import logging
from collections.abc import Generator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select

from app.config import settings
from app.models import LIFECYCLE_ORDER, TaskAssignee

logger = logging.getLogger(__name__)

engine = create_engine(settings.database_url, echo=False)


def init_db() -> None:
    # Phase 1 uses create_all for a troublefree local setup. Move to Alembic
    # migrations once the schema stabilizes and this needs to run against
    # data that already exists in production.
    SQLModel.metadata.create_all(engine)
    _sync_lifecycle_stage_enum()
    _sync_task_stage_column()
    _sync_task_brd_section_column()
    _sync_task_assignees_backfill()
    _sync_uat_result_enum()
    _sync_uat_feedback_columns()
    _sync_bugreport_uat_feedback_column()
    _sync_bugreport_file_url_column()
    _sync_product_budget_cap_column()
    _sync_user_vault_columns()


# create_all() only creates missing tables/types — it never ALTERs an existing
# Postgres native enum, so a value added to LifecycleStage after the type was
# first created (e.g. INFOSEC) would otherwise be silently rejected by the DB.
# `ADD VALUE IF NOT EXISTS ... AFTER` is idempotent and keeps new values in
# LIFECYCLE_ORDER position for anyone inspecting the enum directly in psql —
# though Postgres can't reorder a value that a previous run already appended
# without a position, so this only guarantees correct placement going forward.
def _sync_lifecycle_stage_enum() -> None:
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            for i, stage in enumerate(LIFECYCLE_ORDER):
                position = f"AFTER '{LIFECYCLE_ORDER[i - 1].value}'" if i > 0 else ""
                conn.execute(text(f"ALTER TYPE lifecyclestage ADD VALUE IF NOT EXISTS '{stage.value}' {position}"))
    except Exception:
        logger.exception("Could not sync lifecyclestage enum values — non-Postgres DB or insufficient privileges?")


# Same class of problem as the enum sync above, but for a whole column: `task`
# already existed before Task.stage was added, and create_all() never ALTERs
# an existing table. `ADD COLUMN IF NOT EXISTS` is idempotent.
def _sync_task_stage_column() -> None:
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(
                text(
                    "ALTER TABLE task ADD COLUMN IF NOT EXISTS stage lifecyclestage "
                    "NOT NULL DEFAULT 'DEVELOPMENT'"
                )
            )
    except Exception:
        logger.exception("Could not sync task.stage column — non-Postgres DB or insufficient privileges?")


# Same idempotent-migration pattern as _sync_task_stage_column, for the
# brd_section column added alongside the Planning page.
def _sync_task_brd_section_column() -> None:
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("ALTER TABLE task ADD COLUMN IF NOT EXISTS brd_section text"))
    except Exception:
        logger.exception("Could not sync task.brd_section column — non-Postgres DB or insufficient privileges?")


# One-time-per-row carry-forward from the old single assignee_id column (still
# physically present in Postgres, just unmapped now) into the new TaskAssignee
# join table added for multi-assignee support. Idempotent — safe on every
# startup — and a no-op once every legacy row has been backfilled or the
# column doesn't exist (a fresh install never had it).
def _sync_task_assignees_backfill() -> None:
    try:
        with engine.connect() as conn:
            has_column = conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = 'task' AND column_name = 'assignee_id'"
                )
            ).first()
            if not has_column:
                return
            legacy_assignments = conn.execute(
                text("SELECT id, assignee_id FROM task WHERE assignee_id IS NOT NULL")
            ).all()

        if not legacy_assignments:
            return

        with Session(engine) as session:
            for task_id, user_id in legacy_assignments:
                exists = session.exec(
                    select(TaskAssignee).where(
                        TaskAssignee.task_id == task_id, TaskAssignee.user_id == user_id
                    )
                ).first()
                if not exists:
                    session.add(TaskAssignee(task_id=task_id, user_id=user_id))
            session.commit()
    except Exception:
        logger.exception("Could not backfill task assignees from legacy assignee_id column")


# Same class of problem as _sync_lifecycle_stage_enum: `uatresult` already
# existed (PASS/FAIL/COMMENT) before PENDING was added as the untested
# starting state for the UAT module's checklist-style feedback items.
def _sync_uat_result_enum() -> None:
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("ALTER TYPE uatresult ADD VALUE IF NOT EXISTS 'PENDING'"))
    except Exception:
        logger.exception("Could not sync uatresult enum values — non-Postgres DB or insufficient privileges?")


# `uatfeedback` already existed (scaffolded in Phase 1, never wired to a
# router) before the UAT module added updated_at/file_url. Same idempotent
# ADD COLUMN pattern as _sync_task_stage_column.
def _sync_uat_feedback_columns() -> None:
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(
                text(
                    "ALTER TABLE uatfeedback ADD COLUMN IF NOT EXISTS updated_at "
                    "timestamp NOT NULL DEFAULT now()"
                )
            )
            conn.execute(text("ALTER TABLE uatfeedback ADD COLUMN IF NOT EXISTS file_url text"))
    except Exception:
        logger.exception("Could not sync uatfeedback columns — non-Postgres DB or insufficient privileges?")


# `bugreport` already existed before the UAT module's Fail -> Bug conversion
# added the link back to the UATFeedback it was filed from.
def _sync_bugreport_uat_feedback_column() -> None:
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("ALTER TABLE bugreport ADD COLUMN IF NOT EXISTS uat_feedback_id text"))
    except Exception:
        logger.exception("Could not sync bugreport.uat_feedback_id column — non-Postgres DB or insufficient privileges?")


# `bugreport` predates the standalone Bug Tracking module's file-attachment
# support (PRD §6.6) — same ADD COLUMN pattern as the field above.
def _sync_bugreport_file_url_column() -> None:
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("ALTER TABLE bugreport ADD COLUMN IF NOT EXISTS file_url text"))
    except Exception:
        logger.exception("Could not sync bugreport.file_url column — non-Postgres DB or insufficient privileges?")


# `product` predates the Planning workspace's Budget tab, which added an
# optional overall budget ceiling. Same idempotent ADD COLUMN pattern as
# the other single-column additions above.
def _sync_product_budget_cap_column() -> None:
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("ALTER TABLE product ADD COLUMN IF NOT EXISTS budget_cap double precision"))
    except Exception:
        logger.exception("Could not sync product.budget_cap column — non-Postgres DB or insufficient privileges?")


# `user` predates the Secrets Vault, which added the keypair columns used to
# unlock a user's vault. Same idempotent ADD COLUMN pattern as the other
# single-column additions above -- except "user" is a reserved SQL keyword
# and must be double-quoted, unlike every other table this pattern has
# touched so far (task/product/bugreport/uatfeedback are all unquotable-safe).
def _sync_user_vault_columns() -> None:
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS vault_public_key text'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS vault_wrapped_private_key text'))
    except Exception:
        logger.exception("Could not sync user vault columns — non-Postgres DB or insufficient privileges?")


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
