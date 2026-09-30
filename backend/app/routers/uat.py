from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.activity import log_activity
from app.deps import get_member_product
from app.lifecycle import advance_stage, maybe_reopen_stage, stage_index
from app.models import (
    BugReport,
    BugSeverity,
    BugSource,
    BugStatus,
    LifecycleStage,
    ProductRole,
    UATCycleModel,
    UATCycleStatus,
    UATFeedback,
    UATResult,
    User,
    activity_events_db,
    bug_reports_db,
    uat_cycles_db,
    uat_feedback_db,
    users_db,
)
from app.permissions import require_roles
from app.schemas import (
    BugReportRead,
    UATCycleCreate,
    UATCycleRead,
    UATFeedbackActivityRead,
    UATFeedbackCreate,
    UATFeedbackRead,
    UserRead,
)
from app.security import get_current_user
from app.storage import UploadTooLarge, save_upload

router = APIRouter(prefix="/api/products/{product_id}/uat", tags=["uat"])


def _user_read(user: User) -> UserRead:
    return UserRead(id=user.id, name=user.name, email=user.email)


def _cycle_counts(cycle_id: str) -> tuple[int, int, int, int]:
    feedback = uat_feedback_db.where(uat_cycle_id=cycle_id)
    pass_count = sum(1 for f in feedback if f.result == UATResult.PASS_)
    fail_count = sum(1 for f in feedback if f.result == UATResult.FAIL)
    pending_count = sum(1 for f in feedback if f.result == UATResult.PENDING)
    return pass_count, fail_count, pending_count, len(feedback)


def _cycle_to_read(cycle: UATCycleModel) -> UATCycleRead:
    pass_count, fail_count, pending_count, total_count = _cycle_counts(cycle.id)
    return UATCycleRead(
        id=cycle.id, product_id=cycle.product_id, version=cycle.version, status=cycle.status,
        started_at=cycle.started_at, closed_at=cycle.closed_at,
        pass_count=pass_count, fail_count=fail_count, pending_count=pending_count, total_count=total_count,
    )


def _bug_to_read(bug: BugReport) -> BugReportRead:
    reporter = users_db.get(bug.reported_by_id)
    assignee = users_db.get(bug.assignee_id) if bug.assignee_id else None
    return BugReportRead(
        id=bug.id, product_id=bug.product_id, title=bug.title, description=bug.description,
        severity=bug.severity, status=bug.status, source=bug.source,
        reported_by=_user_read(reporter), assignee=_user_read(assignee) if assignee else None,
        linked_task_id=bug.linked_task_id, uat_feedback_id=bug.uat_feedback_id, file_url=bug.file_url,
        created_at=bug.created_at, updated_at=bug.updated_at,
    )


def _feedback_to_read(feedback: UATFeedback) -> UATFeedbackRead:
    author = users_db.get(feedback.author_id)
    linked_bug = bug_reports_db.first(uat_feedback_id=feedback.id)
    return UATFeedbackRead(
        id=feedback.id, uat_cycle_id=feedback.uat_cycle_id, criterion=feedback.criterion,
        task_id=feedback.task_id, result=feedback.result, notes=feedback.notes, file_url=feedback.file_url,
        author=_user_read(author), created_at=feedback.created_at, updated_at=feedback.updated_at,
        linked_bug=_bug_to_read(linked_bug) if linked_bug else None,
    )


def _get_cycle_or_404(product_id: str, cycle_id: str) -> UATCycleModel:
    cycle = uat_cycles_db.get(cycle_id)
    if not cycle or cycle.product_id != product_id:
        raise HTTPException(status_code=404, detail="UAT cycle not found")
    return cycle


def _get_feedback_or_404(cycle_id: str, feedback_id: str) -> UATFeedback:
    feedback = uat_feedback_db.get(feedback_id)
    if not feedback or feedback.uat_cycle_id != cycle_id:
        raise HTTPException(status_code=404, detail="UAT feedback item not found")
    return feedback


@router.get("/cycles", response_model=list[UATCycleRead])
def list_cycles(
    product_id: str,
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, user)
    cycles = uat_cycles_db.where(product_id=product_id, order_by="started_at", desc=True)
    return [_cycle_to_read(c) for c in cycles]


@router.post("/cycles", response_model=UATCycleRead)
def create_cycle(
    product_id: str,
    body: UATCycleCreate,
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, user)
    require_roles(product_id, user, {ProductRole.PM})

    cycle = uat_cycles_db.set(UATCycleModel(product_id=product_id, version=body.version, status=UATCycleStatus.OPEN))

    # Opening a cycle actively drives the lifecycle stage to UAT — unlike
    # Infosec, which has no server-side stage gate. Moving forward (from
    # Development or Infosec) and reopening (from a later stage, e.g. after
    # a retest cycle is opened post-Bug-Fix) are both one call each.
    current_index = stage_index(product.current_stage)
    uat_index = stage_index(LifecycleStage.UAT)
    if current_index < uat_index:
        advance_stage(
            product,
            frm={LifecycleStage.DEVELOPMENT, LifecycleStage.INFOSEC},
            to=LifecycleStage.UAT,
        )
        if product.current_stage == LifecycleStage.UAT:
            log_activity(
                product_id=product_id, actor_id=user.id,
                event_type="STAGE_ADVANCED", ref_type="PRODUCT", ref_id=product.id,
                metadata={"to": LifecycleStage.UAT, "reason": "uat cycle opened"},
            )
    elif current_index > uat_index:
        reopened = maybe_reopen_stage(product, LifecycleStage.UAT)
        if reopened:
            log_activity(
                product_id=product_id, actor_id=user.id,
                event_type="STAGE_REOPENED", ref_type="PRODUCT", ref_id=product.id,
                metadata={"stage": reopened, "reason": "uat cycle opened", "cycle_id": cycle.id},
            )

    log_activity(
        product_id=product_id, actor_id=user.id,
        event_type="UAT_CYCLE_OPENED", ref_type="PRODUCT", ref_id=product_id,
        metadata={"cycle_id": cycle.id, "version": cycle.version},
    )
    return _cycle_to_read(cycle)


@router.post("/cycles/{cycle_id}/close", response_model=UATCycleRead)
def close_cycle(
    product_id: str,
    cycle_id: str,
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, user)
    require_roles(product_id, user, {ProductRole.PM})
    cycle = _get_cycle_or_404(product_id, cycle_id)

    if cycle.status != UATCycleStatus.CLOSED:
        cycle.status = UATCycleStatus.CLOSED
        cycle.closed_at = datetime.utcnow()
        uat_cycles_db.set(cycle)

        log_activity(
            product_id=product_id, actor_id=user.id,
            event_type="UAT_CYCLE_CLOSED", ref_type="PRODUCT", ref_id=product_id,
            metadata={"cycle_id": cycle.id},
        )

        other_open = uat_cycles_db.first(product_id=product_id, status=UATCycleStatus.OPEN)
        if not other_open:
            advance_stage(product, frm={LifecycleStage.UAT}, to=LifecycleStage.BUG_FIX)
            if product.current_stage == LifecycleStage.BUG_FIX:
                log_activity(
                    product_id=product_id, actor_id=user.id,
                    event_type="STAGE_ADVANCED", ref_type="PRODUCT", ref_id=product.id,
                    metadata={"to": LifecycleStage.BUG_FIX, "reason": "uat cycle closed"},
                )

    return _cycle_to_read(cycle)


@router.get("/cycles/{cycle_id}/feedback", response_model=list[UATFeedbackRead])
def list_feedback(
    product_id: str,
    cycle_id: str,
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, user)
    _get_cycle_or_404(product_id, cycle_id)
    feedback = uat_feedback_db.where(uat_cycle_id=cycle_id, order_by="created_at")
    return [_feedback_to_read(f) for f in feedback]


@router.post("/cycles/{cycle_id}/feedback", response_model=UATFeedbackRead)
def create_feedback(
    product_id: str,
    cycle_id: str,
    body: UATFeedbackCreate,
    user: User = Depends(get_current_user),
):
    # Any of the four roles may add/submit UAT feedback (PRD §4) — unlike
    # cycle open/close, which stay PM/Admin-only.
    get_member_product(product_id, user)
    _get_cycle_or_404(product_id, cycle_id)

    feedback = uat_feedback_db.set(
        UATFeedback(
            uat_cycle_id=cycle_id, task_id=body.task_id, author_id=user.id,
            criterion=body.criterion, result=UATResult.PENDING,
        )
    )

    log_activity(
        product_id=product_id, actor_id=user.id,
        event_type="UAT_FEEDBACK_ADDED", ref_type="UAT_FEEDBACK", ref_id=feedback.id,
        metadata={"criterion": feedback.criterion},
    )
    return _feedback_to_read(feedback)


@router.post("/cycles/{cycle_id}/feedback/{feedback_id}/submit", response_model=UATFeedbackRead)
def submit_feedback(
    product_id: str,
    cycle_id: str,
    feedback_id: str,
    result: UATResult = Form(...),
    notes: str | None = Form(None),
    file: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, user)
    _get_cycle_or_404(product_id, cycle_id)
    feedback = _get_feedback_or_404(cycle_id, feedback_id)

    if file is not None:
        try:
            file_url, _content_type = save_upload(file, f"uat/{product_id}")
            feedback.file_url = file_url
        except UploadTooLarge:
            raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    feedback.result = result
    feedback.notes = notes
    feedback.author_id = user.id
    feedback.updated_at = datetime.utcnow()
    uat_feedback_db.set(feedback)

    log_activity(
        product_id=product_id, actor_id=user.id,
        event_type="UAT_FEEDBACK_RESULT_CHANGED", ref_type="UAT_FEEDBACK", ref_id=feedback.id,
        metadata={"criterion": feedback.criterion, "result": feedback.result},
    )
    return _feedback_to_read(feedback)


@router.get("/cycles/{cycle_id}/feedback/{feedback_id}/activity", response_model=list[UATFeedbackActivityRead])
def feedback_activity(
    product_id: str,
    cycle_id: str,
    feedback_id: str,
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, user)
    _get_cycle_or_404(product_id, cycle_id)
    _get_feedback_or_404(cycle_id, feedback_id)

    events = activity_events_db.where(ref_type="UAT_FEEDBACK", ref_id=feedback_id, order_by="created_at", desc=True)
    result = []
    for event in events:
        actor = users_db.get(event.actor_id)
        result.append(
            UATFeedbackActivityRead(
                id=event.id, event_type=event.event_type,
                result=(event.metadata_ or {}).get("result"),
                actor=_user_read(actor), created_at=event.created_at,
            )
        )
    return result


@router.post("/cycles/{cycle_id}/feedback/{feedback_id}/convert-to-bug", response_model=BugReportRead)
def convert_feedback_to_bug(
    product_id: str,
    cycle_id: str,
    feedback_id: str,
    user: User = Depends(get_current_user),
):
    # Logging a bug is open to every role (PRD §4), same as submitting feedback.
    get_member_product(product_id, user)
    _get_cycle_or_404(product_id, cycle_id)
    feedback = _get_feedback_or_404(cycle_id, feedback_id)

    if feedback.result != UATResult.FAIL:
        raise HTTPException(status_code=400, detail="Only a Failed feedback item can be converted to a bug")

    existing = bug_reports_db.first(uat_feedback_id=feedback_id)
    if existing:
        raise HTTPException(status_code=400, detail="Already converted to a bug")

    bug = bug_reports_db.set(
        BugReport(
            product_id=product_id, title=feedback.criterion[:200], description=feedback.notes or "",
            severity=BugSeverity.MEDIUM, status=BugStatus.OPEN, source=BugSource.UAT,
            reported_by_id=user.id, linked_task_id=feedback.task_id, uat_feedback_id=feedback.id,
        )
    )

    log_activity(
        product_id=product_id, actor_id=user.id,
        event_type="BUG_FILED_FROM_UAT", ref_type="UAT_FEEDBACK", ref_id=feedback.id,
        metadata={"bug_id": bug.id, "title": bug.title},
    )
    return _bug_to_read(bug)
