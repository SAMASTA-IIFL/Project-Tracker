from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.activity import log_activity
from app.deps import get_member_product
from app.lifecycle import advance_stage
from app.models import (
    BugComment,
    BugReport,
    BugSeverity,
    BugSource,
    BugStatus,
    GlobalRole,
    LifecycleStage,
    Product,
    ProductRole,
    User,
    activity_events_db,
    bug_comments_db,
    bug_reports_db,
    users_db,
)
from app.permissions import get_product_role
from app.schemas import (
    BugActivityRead,
    BugCommentCreate,
    BugCommentRead,
    BugReportRead,
    BugReportUpdate,
    UserRead,
)
from app.security import get_current_user
from app.storage import UploadTooLarge, save_upload

router = APIRouter(prefix="/api/products/{product_id}/bugs", tags=["bugs"])

# A bug is still "open" (blocking BUG_FIX -> RELEASE) until it's Verified or
# Closed — In Progress/Fixed/Reopened all still need attention.
_UNRESOLVED_BUG_STATUSES = {BugStatus.OPEN, BugStatus.IN_PROGRESS, BugStatus.FIXED, BugStatus.REOPENED}


def _user_read(user: User) -> UserRead:
    return UserRead(id=user.id, name=user.name, email=user.email)


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


def _comment_to_read(comment: BugComment, author: User) -> BugCommentRead:
    return BugCommentRead(
        id=comment.id, bug_id=comment.bug_id, text=comment.text,
        author=_user_read(author), created_at=comment.created_at,
    )


def _get_bug_or_404(product_id: str, bug_id: str) -> BugReport:
    bug = bug_reports_db.get(bug_id)
    if not bug or bug.product_id != product_id:
        raise HTTPException(status_code=404, detail="Bug not found")
    return bug


# Mirrors uat.py::close_cycle's "any other open cycle?" check — only ever
# called right after a status change, so a product that just arrived at
# BUG_FIX with zero bugs filed never gets auto-advanced by this path.
def _maybe_advance_bug_fix(product: Product) -> bool:
    if product.current_stage != LifecycleStage.BUG_FIX:
        return False
    bugs = bug_reports_db.where(product_id=product.id)
    unresolved = any(b.status in _UNRESOLVED_BUG_STATUSES for b in bugs)
    if unresolved:
        return False
    advance_stage(product, frm={LifecycleStage.BUG_FIX}, to=LifecycleStage.RELEASE)
    return product.current_stage == LifecycleStage.RELEASE


@router.get("", response_model=list[BugReportRead])
def list_bugs(
    product_id: str,
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, user)
    bugs = bug_reports_db.where(product_id=product_id, order_by="created_at", desc=True)
    return [_bug_to_read(b) for b in bugs]


@router.post("", response_model=BugReportRead)
def create_bug(
    product_id: str,
    title: str = Form(...),
    description: str = Form(...),
    severity: BugSeverity = Form(BugSeverity.MEDIUM),
    source: BugSource = Form(BugSource.INTERNAL),
    linked_task_id: str | None = Form(None),
    file: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
):
    # Any role can log a bug (PRD §6.6) — no require_roles gate here.
    get_member_product(product_id, user)

    file_url = None
    if file is not None:
        try:
            file_url, _content_type = save_upload(file, f"bugs/{product_id}")
        except UploadTooLarge:
            raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    bug = bug_reports_db.set(
        BugReport(
            product_id=product_id, title=title, description=description,
            severity=severity, status=BugStatus.OPEN, source=source,
            reported_by_id=user.id, linked_task_id=linked_task_id, file_url=file_url,
        )
    )

    log_activity(
        product_id=product_id, actor_id=user.id,
        event_type="BUG_LOGGED", ref_type="BUG", ref_id=bug.id,
        metadata={"title": bug.title, "severity": bug.severity, "source": bug.source},
    )
    return _bug_to_read(bug)


@router.patch("/{bug_id}", response_model=BugReportRead)
def update_bug(
    product_id: str,
    bug_id: str,
    body: BugReportUpdate,
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, user)
    bug = _get_bug_or_404(product_id, bug_id)

    is_pm = user.global_role == GlobalRole.ADMIN or get_product_role(product_id, user) == ProductRole.PM
    if not is_pm:
        # Non-PM members may only move the status of a bug assigned to them —
        # same restriction shape as infosec.py::update_item.
        if bug.assignee_id != user.id:
            raise HTTPException(status_code=403, detail="Not permitted for your role on this product")
        if any(v is not None for k, v in body.model_dump().items() if k != "status"):
            raise HTTPException(status_code=403, detail="You can only update the status of bugs assigned to you")

    status_changed = body.status is not None and body.status != bug.status
    triage_changed = any(
        getattr(body, field) is not None and getattr(body, field) != getattr(bug, field)
        for field in ("severity", "assignee_id", "linked_task_id")
    )

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(bug, field, value)
    bug.updated_at = datetime.utcnow()
    bug_reports_db.set(bug)

    if status_changed:
        log_activity(
            product_id=product_id, actor_id=user.id,
            event_type="BUG_STATUS_CHANGED", ref_type="BUG", ref_id=bug.id,
            metadata={"title": bug.title, "status": bug.status},
        )
        _maybe_advance_bug_fix(product)
    if triage_changed:
        log_activity(
            product_id=product_id, actor_id=user.id,
            event_type="BUG_TRIAGED", ref_type="BUG", ref_id=bug.id,
            metadata={"severity": bug.severity, "assignee_id": bug.assignee_id, "linked_task_id": bug.linked_task_id},
        )

    return _bug_to_read(bug)


@router.get("/{bug_id}/activity", response_model=list[BugActivityRead])
def bug_activity(
    product_id: str,
    bug_id: str,
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, user)
    _get_bug_or_404(product_id, bug_id)

    events = activity_events_db.where(ref_type="BUG", ref_id=bug_id, order_by="created_at", desc=True)
    result = []
    for event in events:
        actor = users_db.get(event.actor_id)
        result.append(
            BugActivityRead(
                id=event.id, event_type=event.event_type,
                status=(event.metadata_ or {}).get("status"),
                actor=_user_read(actor), created_at=event.created_at,
            )
        )
    return result


@router.get("/{bug_id}/comments", response_model=list[BugCommentRead])
def list_comments(
    product_id: str,
    bug_id: str,
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, user)
    _get_bug_or_404(product_id, bug_id)

    comments = bug_comments_db.where(bug_id=bug_id, order_by="created_at")
    return [_comment_to_read(c, users_db.get(c.author_id)) for c in comments]


@router.post("/{bug_id}/comments", response_model=BugCommentRead)
def create_comment(
    product_id: str,
    bug_id: str,
    body: BugCommentCreate,
    user: User = Depends(get_current_user),
):
    # Open to any product member — discussion, not a gated action, same
    # precedent as DiagramComment/InfosecChecklistComment.
    get_member_product(product_id, user)
    _get_bug_or_404(product_id, bug_id)

    comment = bug_comments_db.set(BugComment(bug_id=bug_id, author_id=user.id, text=body.text))

    log_activity(
        product_id=product_id, actor_id=user.id,
        event_type="BUG_COMMENTED", ref_type="BUG", ref_id=bug_id,
        metadata={"comment_id": comment.id},
    )
    return _comment_to_read(comment, user)
