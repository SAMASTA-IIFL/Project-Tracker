import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.activity import log_activity
from app.ai import generate_brd, suggest_tasks_from_brd
from app.database import get_session
from app.deps import get_member_product
from app.lifecycle import advance_stage
from app.models import BRD, BRDComment, BRDStatus, LifecycleStage, ProductRole, User
from app.permissions import require_roles
from app.schemas import (
    BRDCommentCreate,
    BRDCommentRead,
    BRDCreate,
    BRDGenerateRequest,
    BRDGenerateResponse,
    BRDRead,
    BRDSections,
    BRDUpdate,
    RequestChangesBody,
    TaskSuggestion,
    UserRead,
)
from app.security import get_current_user

router = APIRouter(prefix="/api/products/{product_id}/brd", tags=["brd"])

EDITABLE_STATUSES = {BRDStatus.DRAFT, BRDStatus.CHANGES_REQUESTED}


def _sections_to_json(sections: BRDSections) -> str:
    return json.dumps(sections.model_dump())


def _json_to_sections(content: str | None) -> BRDSections:
    if not content:
        return BRDSections()
    try:
        return BRDSections(**json.loads(content))
    except (json.JSONDecodeError, TypeError):
        return BRDSections()


def _to_read(session: Session, brd: BRD) -> BRDRead:
    creator = session.get(User, brd.created_by_id)
    return BRDRead(
        id=brd.id,
        product_id=brd.product_id,
        title=brd.title,
        version=brd.version,
        status=brd.status,
        sections=_json_to_sections(brd.content),
        created_by=UserRead(id=creator.id, name=creator.name, email=creator.email),
        created_at=brd.created_at,
        updated_at=brd.updated_at,
    )


def _get_brd_or_404(session: Session, product_id: str, brd_id: str) -> BRD:
    brd = session.get(BRD, brd_id)
    if not brd or brd.product_id != product_id:
        raise HTTPException(status_code=404, detail="BRD not found")
    return brd


@router.get("", response_model=list[BRDRead])
def list_brds(
    product_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    brds = session.exec(
        select(BRD).where(BRD.product_id == product_id).order_by(BRD.version.desc())
    ).all()
    return [_to_read(session, b) for b in brds]


@router.post("", response_model=BRDRead)
def create_brd(
    product_id: str,
    body: BRDCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM})

    existing = session.exec(select(BRD).where(BRD.product_id == product_id)).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A BRD already exists for this product — edit the current draft or start a new version",
        )

    brd = BRD(
        product_id=product_id,
        title=body.title,
        content=_sections_to_json(body.sections),
        created_by_id=user.id,
    )
    session.add(brd)
    session.commit()
    session.refresh(brd)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="BRD_CREATED", ref_type="BRD", ref_id=brd.id,
        metadata={"title": brd.title, "version": brd.version},
    )
    return _to_read(session, brd)


# Drafting aid only — returns a suggested title/sections for the PM to review
# and edit in the normal create/edit form, same "suggest, don't bypass the
# workflow" precedent as suggest_tasks_from_brd below. Nothing is persisted
# here; PM-gated to match create_brd, since generation is only useful to
# whoever can actually author a BRD for this product.
@router.post("/generate", response_model=BRDGenerateResponse)
def generate_brd_draft(
    product_id: str,
    body: BRDGenerateRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM})

    try:
        return generate_brd(body.prompt)
    except (RuntimeError, NotImplementedError) as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/{brd_id}", response_model=BRDRead)
def get_brd(
    product_id: str,
    brd_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    brd = _get_brd_or_404(session, product_id, brd_id)
    return _to_read(session, brd)


@router.patch("/{brd_id}", response_model=BRDRead)
def update_brd(
    product_id: str,
    brd_id: str,
    body: BRDUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM})
    brd = _get_brd_or_404(session, product_id, brd_id)

    if brd.status not in EDITABLE_STATUSES:
        raise HTTPException(status_code=400, detail=f"Cannot edit a BRD in {brd.status} status")

    if body.title is not None:
        brd.title = body.title
    if body.sections is not None:
        brd.content = _sections_to_json(body.sections)
    brd.updated_at = datetime.utcnow()
    session.add(brd)
    session.commit()
    session.refresh(brd)
    return _to_read(session, brd)


@router.post("/{brd_id}/submit", response_model=BRDRead)
def submit_brd(
    product_id: str,
    brd_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM})
    brd = _get_brd_or_404(session, product_id, brd_id)

    if brd.status not in EDITABLE_STATUSES:
        raise HTTPException(status_code=400, detail=f"Cannot submit a BRD in {brd.status} status")

    brd.status = BRDStatus.IN_REVIEW
    brd.updated_at = datetime.utcnow()
    session.add(brd)
    session.commit()
    session.refresh(brd)

    advance_stage(session, product, frm={LifecycleStage.INTAKE}, to=LifecycleStage.BRD_REVIEW)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="BRD_SUBMITTED", ref_type="BRD", ref_id=brd.id,
        metadata={"title": brd.title, "version": brd.version},
    )
    return _to_read(session, brd)


@router.post("/{brd_id}/request-changes", response_model=BRDRead)
def request_changes(
    product_id: str,
    brd_id: str,
    body: RequestChangesBody,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM, ProductRole.STAKEHOLDER})
    brd = _get_brd_or_404(session, product_id, brd_id)

    if brd.status != BRDStatus.IN_REVIEW:
        raise HTTPException(status_code=400, detail="Only a BRD in review can have changes requested")

    brd.status = BRDStatus.CHANGES_REQUESTED
    brd.updated_at = datetime.utcnow()
    session.add(brd)

    if body.note:
        session.add(BRDComment(brd_id=brd.id, author_id=user.id, text=body.note))

    session.commit()
    session.refresh(brd)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="BRD_CHANGES_REQUESTED", ref_type="BRD", ref_id=brd.id,
        metadata={"title": brd.title, "version": brd.version},
    )
    return _to_read(session, brd)


@router.post("/{brd_id}/approve", response_model=BRDRead)
def approve_brd(
    product_id: str,
    brd_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM, ProductRole.STAKEHOLDER})
    brd = _get_brd_or_404(session, product_id, brd_id)

    if brd.status != BRDStatus.IN_REVIEW:
        raise HTTPException(status_code=400, detail="Only a BRD in review can be approved")

    brd.status = BRDStatus.APPROVED
    brd.updated_at = datetime.utcnow()
    session.add(brd)
    session.commit()
    session.refresh(brd)

    advance_stage(
        session, product,
        frm={LifecycleStage.BRD_REVIEW, LifecycleStage.INTAKE},
        to=LifecycleStage.PLANNING,
    )

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="BRD_APPROVED", ref_type="BRD", ref_id=brd.id,
        metadata={"title": brd.title, "version": brd.version},
    )
    return _to_read(session, brd)


@router.post("/{brd_id}/suggest-tasks", response_model=list[TaskSuggestion])
def suggest_tasks(
    product_id: str,
    brd_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM})
    brd = _get_brd_or_404(session, product_id, brd_id)

    if brd.status != BRDStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Only an approved BRD can be broken down into tasks")

    try:
        return suggest_tasks_from_brd(_json_to_sections(brd.content))
    except (RuntimeError, NotImplementedError) as exc:
        # Missing API key, unparseable model output, unimplemented provider, ...
        # — surface the real reason instead of an opaque 500.
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/{brd_id}/new-version", response_model=BRDRead)
def new_version(
    product_id: str,
    brd_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM})
    brd = _get_brd_or_404(session, product_id, brd_id)

    if brd.status != BRDStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Only an approved BRD can be revised into a new version")

    latest = session.exec(
        select(BRD).where(BRD.product_id == product_id).order_by(BRD.version.desc())
    ).first()

    new_brd = BRD(
        product_id=product_id,
        title=brd.title,
        version=latest.version + 1,
        content=brd.content,
        created_by_id=user.id,
    )
    session.add(new_brd)
    session.commit()
    session.refresh(new_brd)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="BRD_NEW_VERSION", ref_type="BRD", ref_id=new_brd.id,
        metadata={"title": new_brd.title, "version": new_brd.version},
    )
    return _to_read(session, new_brd)


@router.get("/{brd_id}/comments", response_model=list[BRDCommentRead])
def list_comments(
    product_id: str,
    brd_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    _get_brd_or_404(session, product_id, brd_id)

    comments = session.exec(
        select(BRDComment).where(BRDComment.brd_id == brd_id).order_by(BRDComment.created_at)
    ).all()
    result = []
    for c in comments:
        author = session.get(User, c.author_id)
        result.append(
            BRDCommentRead(
                id=c.id, brd_id=c.brd_id, section_anchor=c.section_anchor, text=c.text,
                resolved=c.resolved, author=UserRead(id=author.id, name=author.name, email=author.email),
                created_at=c.created_at,
            )
        )
    return result


@router.post("/{brd_id}/comments", response_model=BRDCommentRead)
def create_comment(
    product_id: str,
    brd_id: str,
    body: BRDCommentCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM, ProductRole.STAKEHOLDER})
    _get_brd_or_404(session, product_id, brd_id)

    comment = BRDComment(
        brd_id=brd_id, author_id=user.id, section_anchor=body.section_anchor, text=body.text
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="BRD_COMMENT_ADDED", ref_type="BRD", ref_id=brd_id,
        metadata={"comment_id": comment.id},
    )
    return BRDCommentRead(
        id=comment.id, brd_id=comment.brd_id, section_anchor=comment.section_anchor,
        text=comment.text, resolved=comment.resolved,
        author=UserRead(id=user.id, name=user.name, email=user.email),
        created_at=comment.created_at,
    )


@router.post("/{brd_id}/comments/{comment_id}/resolve", response_model=BRDCommentRead)
def resolve_comment(
    product_id: str,
    brd_id: str,
    comment_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM, ProductRole.STAKEHOLDER})
    _get_brd_or_404(session, product_id, brd_id)

    comment = session.get(BRDComment, comment_id)
    if not comment or comment.brd_id != brd_id:
        raise HTTPException(status_code=404, detail="Comment not found")

    comment.resolved = not comment.resolved
    session.add(comment)
    session.commit()
    session.refresh(comment)

    author = session.get(User, comment.author_id)
    return BRDCommentRead(
        id=comment.id, brd_id=comment.brd_id, section_anchor=comment.section_anchor,
        text=comment.text, resolved=comment.resolved,
        author=UserRead(id=author.id, name=author.name, email=author.email),
        created_at=comment.created_at,
    )
