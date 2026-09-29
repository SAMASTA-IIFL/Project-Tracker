from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session, select

from app.activity import log_activity
from app.database import get_session
from app.deps import get_member_product
from app.lifecycle import advance_stage
from app.models import (
    ActivityEvent,
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


def _bug_to_read(session: Session, bug: BugReport) -> BugReportRead:
    reporter = session.get(User, bug.reported_by_id)
    assignee = session.get(User, bug.assignee_id) if bug.assignee_id else None
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


def _get_bug_or_404(session: Session, product_id: str, bug_id: str) -> BugReport:
    bug = session.get(BugReport, bug_id)
    if not bug or bug.product_id != product_id:
        raise HTTPException(status_code=404, detail="Bug not found")
    return bug


# Mirrors uat.py::close_cycle's "any other open cycle?" check — only ever
# called right after a status change, so a product that just arrived at
# BUG_FIX with zero bugs filed never gets auto-advanced by this path.
def _maybe_advance_bug_fix(session: Session, product: Product) -> bool:
    if product.current_stage != LifecycleStage.BUG_FIX:
        return False
    unresolved = session.exec(
        select(BugReport).where(
            BugReport.product_id == product.id,
            BugReport.status.in_(_UNRESOLVED_BUG_STATUSES),
        )
    ).first()
    if unresolved:
        return False
    advance_stage(session, product, frm={LifecycleStage.BUG_FIX}, to=LifecycleStage.RELEASE)
    return product.current_stage == LifecycleStage.RELEASE


@router.get("", response_model=list[BugReportRead])
def list_bugs(
    product_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    bugs = session.exec(
        select(BugReport).where(BugReport.product_id == product_id).order_by(BugReport.created_at.desc())
    ).all()
    return [_bug_to_read(session, b) for b in bugs]


@router.post("", response_model=BugReportRead)
def create_bug(
    product_id: str,
    title: str = Form(...),
    description: str = Form(...),
    severity: BugSeverity = Form(BugSeverity.MEDIUM),
    source: BugSource = Form(BugSource.INTERNAL),
    linked_task_id: str | None = Form(None),
    file: UploadFile | None = File(None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    # Any role can log a bug (PRD §6.6) — no require_roles gate here.
    get_member_product(product_id, session, user)

    file_url = None
    if file is not None:
        try:
            file_url, _content_type = save_upload(file, f"bugs/{product_id}")
        except UploadTooLarge:
            raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    bug = BugReport(
        product_id=product_id, title=title, description=description,
        severity=severity, status=BugStatus.OPEN, source=source,
        reported_by_id=user.id, linked_task_id=linked_task_id, file_url=file_url,
    )
    session.add(bug)
    session.commit()
    session.refresh(bug)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="BUG_LOGGED", ref_type="BUG", ref_id=bug.id,
        metadata={"title": bug.title, "severity": bug.severity, "source": bug.source},
    )
    return _bug_to_read(session, bug)


@router.patch("/{bug_id}", response_model=BugReportRead)
def update_bug(
    product_id: str,
    bug_id: str,
    body: BugReportUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, session, user)
    bug = _get_bug_or_404(session, product_id, bug_id)

    is_pm = user.global_role == GlobalRole.ADMIN or get_product_role(session, product_id, user) == ProductRole.PM
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
    session.add(bug)
    session.commit()
    session.refresh(bug)

    if status_changed:
        log_activity(
            session, product_id=product_id, actor_id=user.id,
            event_type="BUG_STATUS_CHANGED", ref_type="BUG", ref_id=bug.id,
            metadata={"title": bug.title, "status": bug.status},
        )
        _maybe_advance_bug_fix(session, product)
    if triage_changed:
        log_activity(
            session, product_id=product_id, actor_id=user.id,
            event_type="BUG_TRIAGED", ref_type="BUG", ref_id=bug.id,
            metadata={"severity": bug.severity, "assignee_id": bug.assignee_id, "linked_task_id": bug.linked_task_id},
        )

    return _bug_to_read(session, bug)


@router.get("/{bug_id}/activity", response_model=list[BugActivityRead])
def bug_activity(
    product_id: str,
    bug_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    _get_bug_or_404(session, product_id, bug_id)

    events = session.exec(
        select(ActivityEvent)
        .where(ActivityEvent.ref_type == "BUG", ActivityEvent.ref_id == bug_id)
        .order_by(ActivityEvent.created_at.desc())
    ).all()
    result = []
    for event in events:
        actor = session.get(User, event.actor_id)
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
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    _get_bug_or_404(session, product_id, bug_id)

    comments = session.exec(
        select(BugComment).where(BugComment.bug_id == bug_id).order_by(BugComment.created_at)
    ).all()
    return [_comment_to_read(c, session.get(User, c.author_id)) for c in comments]


@router.post("/{bug_id}/comments", response_model=BugCommentRead)
def create_comment(
    product_id: str,
    bug_id: str,
    body: BugCommentCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    # Open to any product member — discussion, not a gated action, same
    # precedent as DiagramComment/InfosecChecklistComment.
    get_member_product(product_id, session, user)
    _get_bug_or_404(session, product_id, bug_id)

    comment = BugComment(bug_id=bug_id, author_id=user.id, text=body.text)
    session.add(comment)
    session.commit()
    session.refresh(comment)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="BUG_COMMENTED", ref_type="BUG", ref_id=bug_id,
        metadata={"comment_id": comment.id},
    )
    return _comment_to_read(comment, user)
