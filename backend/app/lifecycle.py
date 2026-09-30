from datetime import datetime

from fastapi import HTTPException

from app.models import LIFECYCLE_ORDER, LifecycleStage, Product, Task, TaskStatus, products_db, tasks_db


# Stage transitions are derived automatically from domain events (BRD submitted,
# BRD approved, first progress update posted, ...) rather than an explicit PM
# action. `frm` guards against moving a product backwards or double-advancing
# if the triggering event fires more than once.
def advance_stage(product: Product, *, frm: set[LifecycleStage], to: LifecycleStage) -> None:
    if product.current_stage not in frm:
        return
    product.current_stage = to
    product.updated_at = datetime.utcnow()
    products_db.set(product)


def next_stage(current: LifecycleStage) -> LifecycleStage | None:
    index = LIFECYCLE_ORDER.index(current)
    if index + 1 >= len(LIFECYCLE_ORDER):
        return None
    return LIFECYCLE_ORDER[index + 1]


# Manual fallback for the stages that don't (yet) have a dedicated module to
# derive their transition automatically — e.g. INFOSEC has no review module,
# so a PM moves the product past it explicitly. Always moves exactly one step
# along LIFECYCLE_ORDER; it does not let a PM skip stages or move backwards.
def advance_to_next_stage(product: Product) -> LifecycleStage:
    target = next_stage(product.current_stage)
    if target is None:
        raise HTTPException(status_code=400, detail="Already at the last lifecycle stage")
    product.current_stage = target
    product.updated_at = datetime.utcnow()
    products_db.set(product)
    return target


def stage_index(stage: LifecycleStage) -> int:
    return LIFECYCLE_ORDER.index(stage)


# A task landing on a stage the product has already moved past (e.g. a bug
# found after Infosec gets tagged INFOSEC again) reopens that stage — the
# lifecycle pointer moves back to it so it reads as "current" again in the
# timeline. Returns the reopened stage, or None if nothing changed (the
# task's stage was at or ahead of current_stage).
def maybe_reopen_stage(product: Product, task_stage: LifecycleStage) -> LifecycleStage | None:
    if stage_index(task_stage) >= stage_index(product.current_stage):
        return None
    product.current_stage = task_stage
    product.updated_at = datetime.utcnow()
    products_db.set(product)
    return task_stage


# The inverse of reopening: once every task tagged with the product's current
# stage is Done, there's nothing left pending there, so the product advances
# one step. Scoped to `task_stage == product.current_stage` — completing a
# task from a past or future stage shouldn't move the pointer.
def maybe_advance_when_stage_cleared(product: Product, task_stage: LifecycleStage) -> LifecycleStage | None:
    if task_stage != product.current_stage:
        return None
    pending = [
        t for t in tasks_db.where(product_id=product.id, stage=task_stage)
        if t.status != TaskStatus.DONE
    ]
    if pending:
        return None
    target = next_stage(product.current_stage)
    if target is None:
        return None
    product.current_stage = target
    product.updated_at = datetime.utcnow()
    products_db.set(product)
    return target
