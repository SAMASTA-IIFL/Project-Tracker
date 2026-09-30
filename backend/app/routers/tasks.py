from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.activity import log_activity
from app.deps import get_member_product
from app.lifecycle import advance_stage, maybe_advance_when_stage_cleared, maybe_reopen_stage
from app.models import (
    GlobalRole,
    LifecycleStage,
    ProgressUpdate,
    ProductRole,
    Task,
    TaskAssignee,
    TaskStatus,
    User,
    progress_updates_db,
    task_assignees_db,
    tasks_db,
    users_db,
)
from app.permissions import get_product_role, require_roles
from app.schemas import ProgressUpdateCreate, ProgressUpdateRead, TaskCreate, TaskRead, TaskUpdate, UserRead
from app.security import get_current_user

router = APIRouter(prefix="/api/products/{product_id}/tasks", tags=["tasks"])


def _get_assignees(task_id: str) -> list[UserRead]:
    rows = task_assignees_db.where(task_id=task_id)
    result = []
    for row in rows:
        u = users_db.get(row.user_id)
        if u:
            result.append(UserRead(id=u.id, name=u.name, email=u.email))
    return result


def _is_assignee(task_id: str, user_id: str) -> bool:
    return task_assignees_db.first(task_id=task_id, user_id=user_id) is not None


def _to_read(task: Task) -> TaskRead:
    return TaskRead(
        id=task.id, product_id=task.product_id, brd_id=task.brd_id, brd_section=task.brd_section,
        title=task.title, description=task.description,
        assignees=_get_assignees(task.id),
        status=task.status, priority=task.priority, due_date=task.due_date, stage=task.stage,
        created_at=task.created_at, updated_at=task.updated_at,
    )


def _get_task_or_404(product_id: str, task_id: str) -> Task:
    task = tasks_db.get(task_id)
    if not task or task.product_id != product_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("", response_model=list[TaskRead])
def list_tasks(
    product_id: str,
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, user)
    tasks = tasks_db.where(product_id=product_id, order_by="created_at", desc=True)
    return [_to_read(t) for t in tasks]


@router.post("", response_model=TaskRead)
def create_task(
    product_id: str,
    body: TaskCreate,
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, user)
    require_roles(product_id, user, {ProductRole.PM})

    stage = body.stage or product.current_stage
    task = tasks_db.set(
        Task(
            product_id=product_id, brd_id=body.brd_id, brd_section=body.brd_section,
            title=body.title, description=body.description,
            priority=body.priority, due_date=body.due_date, stage=stage,
        )
    )

    for uid in body.assignee_ids:
        task_assignees_db.set(TaskAssignee(task_id=task.id, user_id=uid))

    log_activity(
        product_id=product_id, actor_id=user.id,
        event_type="TASK_CREATED", ref_type="TASK", ref_id=task.id,
        metadata={"title": task.title, "stage": task.stage},
    )

    reopened = maybe_reopen_stage(product, task.stage)
    if reopened:
        log_activity(
            product_id=product_id, actor_id=user.id,
            event_type="STAGE_REOPENED", ref_type="PRODUCT", ref_id=product.id,
            metadata={"stage": reopened, "reason": "task added", "task_id": task.id},
        )

    return _to_read(task)


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(
    product_id: str,
    task_id: str,
    body: TaskUpdate,
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, user)
    task = _get_task_or_404(product_id, task_id)

    is_pm = user.global_role == GlobalRole.ADMIN or get_product_role(product_id, user) == ProductRole.PM

    if not is_pm:
        # Non-PM callers may only move the status of a task they're assigned to —
        # everything else (reassignment, priority, dates, title, stage) is PM/Admin-only.
        if not _is_assignee(task_id, user.id):
            raise HTTPException(status_code=403, detail="Not permitted for your role on this product")
        if any(v is not None for k, v in body.model_dump().items() if k != "status"):
            raise HTTPException(status_code=403, detail="You can only update the status of your own tasks")

    status_changed = body.status is not None and body.status != task.status
    stage_changed = body.stage is not None and body.stage != task.stage
    completed_to_done = status_changed and body.status == TaskStatus.DONE
    new_stage = body.stage if stage_changed else task.stage

    update_data = body.model_dump(exclude_unset=True)
    new_assignee_ids = update_data.pop("assignee_ids", None)
    for field, value in update_data.items():
        setattr(task, field, value)
    task.updated_at = datetime.utcnow()
    tasks_db.set(task)

    if new_assignee_ids is not None:
        existing = task_assignees_db.where(task_id=task.id)
        existing_ids = {row.user_id for row in existing}
        for row in existing:
            if row.user_id not in new_assignee_ids:
                task_assignees_db.delete(row.id)
        for uid in new_assignee_ids:
            if uid not in existing_ids:
                task_assignees_db.set(TaskAssignee(task_id=task.id, user_id=uid))

    if status_changed:
        log_activity(
            product_id=product_id, actor_id=user.id,
            event_type="TASK_STATUS_CHANGED", ref_type="TASK", ref_id=task.id,
            metadata={"title": task.title, "status": task.status},
        )

    if stage_changed:
        reopened = maybe_reopen_stage(product, new_stage)
        if reopened:
            log_activity(
                product_id=product_id, actor_id=user.id,
                event_type="STAGE_REOPENED", ref_type="PRODUCT", ref_id=product.id,
                metadata={"stage": reopened, "reason": "task reassigned", "task_id": task.id},
            )

    if completed_to_done:
        advanced = maybe_advance_when_stage_cleared(product, new_stage)
        if advanced:
            log_activity(
                product_id=product_id, actor_id=user.id,
                event_type="STAGE_ADVANCED", ref_type="PRODUCT", ref_id=product.id,
                metadata={"from": new_stage, "to": advanced, "reason": "all tasks in stage done"},
            )

    return _to_read(task)


@router.get("/{task_id}/progress", response_model=list[ProgressUpdateRead])
def list_progress(
    product_id: str,
    task_id: str,
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, user)
    _get_task_or_404(product_id, task_id)

    updates = progress_updates_db.where(task_id=task_id, order_by="created_at", desc=True)
    result = []
    for u in updates:
        author = users_db.get(u.author_id)
        result.append(
            ProgressUpdateRead(
                id=u.id, task_id=u.task_id, note=u.note, percent_complete=u.percent_complete,
                author=UserRead(id=author.id, name=author.name, email=author.email),
                created_at=u.created_at,
            )
        )
    return result


@router.post("/{task_id}/progress", response_model=ProgressUpdateRead)
def create_progress(
    product_id: str,
    task_id: str,
    body: ProgressUpdateCreate,
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, user)
    task = _get_task_or_404(product_id, task_id)

    is_privileged = (
        user.global_role == GlobalRole.ADMIN or get_product_role(product_id, user) == ProductRole.PM
    )
    if not is_privileged and not _is_assignee(task_id, user.id):
        raise HTTPException(status_code=403, detail="Only the task's assignee (or a PM) can post progress updates")

    update = progress_updates_db.set(
        ProgressUpdate(task_id=task_id, author_id=user.id, note=body.note, percent_complete=body.percent_complete)
    )

    advance_stage(product, frm={LifecycleStage.PLANNING}, to=LifecycleStage.DEVELOPMENT)

    log_activity(
        product_id=product_id, actor_id=user.id,
        event_type="TASK_PROGRESS_UPDATE", ref_type="TASK", ref_id=task.id,
        metadata={"title": task.title, "percent_complete": update.percent_complete},
    )
    return ProgressUpdateRead(
        id=update.id, task_id=update.task_id, note=update.note, percent_complete=update.percent_complete,
        author=UserRead(id=user.id, name=user.name, email=user.email), created_at=update.created_at,
    )
