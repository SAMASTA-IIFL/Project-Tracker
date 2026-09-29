import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session, func, select

from app.activity import log_activity
from app.database import get_session
from app.deps import get_member_product
from app.models import (
    ActivityEvent,
    GlobalRole,
    InfosecChecklistComment,
    InfosecChecklistItem,
    InfosecChecklistTemplate,
    InfosecChecklistTemplateItem,
    InfosecItemSource,
    InfosecVAPTReport,
    ProductMember,
    ProductRole,
    User,
)
from app.permissions import get_product_role, require_roles
from app.schemas import (
    ApplyTemplateBody,
    InfosecChecklistCommentCreate,
    InfosecChecklistCommentRead,
    InfosecChecklistItemCreate,
    InfosecChecklistItemRead,
    InfosecChecklistItemUpdate,
    InfosecChecklistTemplateCreate,
    InfosecChecklistTemplateItemCreate,
    InfosecChecklistTemplateItemRead,
    InfosecChecklistTemplateRead,
    InfosecItemActivityRead,
    InfosecVAPTReportRead,
    UserRead,
)
from app.security import get_current_user
from app.storage import UploadTooLarge, save_upload

bank_router = APIRouter(prefix="/api/infosec-templates", tags=["infosec"])
router = APIRouter(prefix="/api/products/{product_id}/infosec", tags=["infosec"])


def _require_admin(user: User) -> None:
    if user.global_role != GlobalRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")


# Checklist templates are global/cross-product, so there's no single product
# to check a PM role against — "PM on at least one product, or Admin" is the
# closest equivalent to the "PM/Admin manage everything" rule the rest of the
# Infosec feature uses. This is intentionally looser than _require_admin,
# used only for template creation (list/apply stay open to any member).
def _require_pm_or_admin(session: Session, user: User) -> None:
    if user.global_role == GlobalRole.ADMIN:
        return
    is_pm_somewhere = session.exec(
        select(ProductMember).where(ProductMember.user_id == user.id, ProductMember.role == ProductRole.PM)
    ).first()
    if not is_pm_somewhere:
        raise HTTPException(status_code=403, detail="PM or Admin only")


# --- Checklist bank (global, cross-product) ---


@bank_router.get("", response_model=list[InfosecChecklistTemplateRead])
def list_templates(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    templates = session.exec(select(InfosecChecklistTemplate).order_by(InfosecChecklistTemplate.created_at.desc())).all()
    result = []
    for t in templates:
        count = session.exec(
            select(func.count(InfosecChecklistTemplateItem.id)).where(
                InfosecChecklistTemplateItem.template_id == t.id
            )
        ).one()
        creator = session.get(User, t.created_by_id)
        result.append(
            InfosecChecklistTemplateRead(
                id=t.id, name=t.name, description=t.description, item_count=count,
                created_by=UserRead(id=creator.id, name=creator.name, email=creator.email),
                created_at=t.created_at,
            )
        )
    return result


@bank_router.post("", response_model=InfosecChecklistTemplateRead)
def create_template(
    body: InfosecChecklistTemplateCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_pm_or_admin(session, user)
    template = InfosecChecklistTemplate(name=body.name, description=body.description, created_by_id=user.id)
    session.add(template)
    session.commit()
    session.refresh(template)
    return InfosecChecklistTemplateRead(
        id=template.id, name=template.name, description=template.description, item_count=0,
        created_by=UserRead(id=user.id, name=user.name, email=user.email), created_at=template.created_at,
    )


@bank_router.post("/{template_id}/items/csv", response_model=list[str])
def upload_template_items_csv(
    template_id: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_pm_or_admin(session, user)
    template = session.get(InfosecChecklistTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    raw = file.file.read().decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames or not any(f.strip().lower() == "title" for f in reader.fieldnames):
        raise HTTPException(status_code=400, detail="CSV must have a 'title' column")

    # Case-insensitive header lookup — CSV exports vary in casing.
    field_map = {f.strip().lower(): f for f in reader.fieldnames}

    existing_count = session.exec(
        select(func.count(InfosecChecklistTemplateItem.id)).where(
            InfosecChecklistTemplateItem.template_id == template_id
        )
    ).one()

    created_titles: list[str] = []
    for row in reader:
        title = (row.get(field_map["title"]) or "").strip()
        if not title:
            continue
        item = InfosecChecklistTemplateItem(
            template_id=template_id,
            title=title,
            description=(row.get(field_map.get("description", "")) or "").strip() or None,
            category=(row.get(field_map.get("category", "")) or "").strip() or None,
            order=existing_count + len(created_titles),
        )
        session.add(item)
        created_titles.append(title)

    if not created_titles:
        raise HTTPException(status_code=400, detail="No valid rows found in CSV (every row was missing a title)")

    session.commit()
    return created_titles


@bank_router.post("/{template_id}/items", response_model=InfosecChecklistTemplateItemRead)
def add_template_item(
    template_id: str,
    body: InfosecChecklistTemplateItemCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_pm_or_admin(session, user)
    template = session.get(InfosecChecklistTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    existing_count = session.exec(
        select(func.count(InfosecChecklistTemplateItem.id)).where(
            InfosecChecklistTemplateItem.template_id == template_id
        )
    ).one()

    item = InfosecChecklistTemplateItem(
        template_id=template_id, title=body.title, description=body.description,
        category=body.category, order=existing_count,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return InfosecChecklistTemplateItemRead(
        id=item.id, template_id=item.template_id, title=item.title,
        description=item.description, category=item.category,
    )


# --- Product-scoped checklist + VAPT tracking ---


def _item_to_read(session: Session, item: InfosecChecklistItem) -> InfosecChecklistItemRead:
    assignee = session.get(User, item.assignee_id) if item.assignee_id else None
    return InfosecChecklistItemRead(
        id=item.id, product_id=item.product_id, stage=item.stage, round=item.round,
        source=item.source, template_item_id=item.template_item_id, vapt_report_id=item.vapt_report_id,
        title=item.title, description=item.description, category=item.category, status=item.status,
        assignee=UserRead(id=assignee.id, name=assignee.name, email=assignee.email) if assignee else None,
        created_at=item.created_at, updated_at=item.updated_at,
    )


def _report_to_read(session: Session, report: InfosecVAPTReport) -> InfosecVAPTReportRead:
    uploader = session.get(User, report.uploaded_by_id)
    return InfosecVAPTReportRead(
        id=report.id, product_id=report.product_id, round=report.round, file_url=report.file_url,
        notes=report.notes, uploaded_by=UserRead(id=uploader.id, name=uploader.name, email=uploader.email),
        uploaded_at=report.uploaded_at,
    )


@router.get("/items", response_model=list[InfosecChecklistItemRead])
def list_items(
    product_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    items = session.exec(
        select(InfosecChecklistItem)
        .where(InfosecChecklistItem.product_id == product_id)
        .order_by(InfosecChecklistItem.stage, InfosecChecklistItem.round, InfosecChecklistItem.created_at)
    ).all()
    return [_item_to_read(session, i) for i in items]


@router.post("/apply-template", response_model=list[InfosecChecklistItemRead])
def apply_template(
    product_id: str,
    body: ApplyTemplateBody,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM})

    template_items = session.exec(
        select(InfosecChecklistTemplateItem)
        .where(InfosecChecklistTemplateItem.template_id == body.template_id)
        .order_by(InfosecChecklistTemplateItem.order)
    ).all()
    if not template_items:
        raise HTTPException(status_code=404, detail="Template not found or has no items")

    created = []
    for ti in template_items:
        item = InfosecChecklistItem(
            product_id=product_id, stage=1, round=1, source=InfosecItemSource.TEMPLATE,
            template_item_id=ti.id, title=ti.title, description=ti.description, category=ti.category,
            created_by_id=user.id,
        )
        session.add(item)
        created.append(item)
    session.commit()
    for item in created:
        session.refresh(item)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="INFOSEC_TEMPLATE_APPLIED", ref_type="PRODUCT", ref_id=product_id,
        metadata={"template_id": body.template_id, "item_count": len(created)},
    )
    return [_item_to_read(session, i) for i in created]


@router.post("/items", response_model=InfosecChecklistItemRead)
def create_item(
    product_id: str,
    body: InfosecChecklistItemCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM})

    if body.vapt_report_id:
        report = session.get(InfosecVAPTReport, body.vapt_report_id)
        if not report or report.product_id != product_id:
            raise HTTPException(status_code=404, detail="VAPT report not found")

    item = InfosecChecklistItem(
        product_id=product_id, stage=body.stage, round=body.round,
        source=InfosecItemSource.VAPT_REPORT if body.vapt_report_id else InfosecItemSource.MANUAL,
        vapt_report_id=body.vapt_report_id, title=body.title, description=body.description,
        category=body.category, assignee_id=body.assignee_id, created_by_id=user.id,
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="INFOSEC_ITEM_ADDED", ref_type="INFOSEC_ITEM", ref_id=item.id,
        metadata={"title": item.title, "stage": item.stage, "round": item.round},
    )
    return _item_to_read(session, item)


@router.patch("/items/{item_id}", response_model=InfosecChecklistItemRead)
def update_item(
    product_id: str,
    item_id: str,
    body: InfosecChecklistItemUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    item = session.get(InfosecChecklistItem, item_id)
    if not item or item.product_id != product_id:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    is_pm = user.global_role == GlobalRole.ADMIN or get_product_role(session, product_id, user) == ProductRole.PM
    if not is_pm:
        # Delivery may only move the status of an item assigned to them —
        # same restriction shape as Task's non-PM branch in routers/tasks.py.
        if item.assignee_id != user.id:
            raise HTTPException(status_code=403, detail="Not permitted for your role on this product")
        if any(v is not None for k, v in body.model_dump().items() if k != "status"):
            raise HTTPException(status_code=403, detail="You can only update the status of items assigned to you")

    status_changed = body.status is not None and body.status != item.status

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)

    if status_changed:
        log_activity(
            session, product_id=product_id, actor_id=user.id,
            event_type="INFOSEC_ITEM_STATUS_CHANGED", ref_type="INFOSEC_ITEM", ref_id=item.id,
            metadata={"title": item.title, "status": item.status},
        )
    return _item_to_read(session, item)


def _get_item_or_404(session: Session, product_id: str, item_id: str) -> InfosecChecklistItem:
    item = session.get(InfosecChecklistItem, item_id)
    if not item or item.product_id != product_id:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    return item


@router.get("/items/{item_id}/activity", response_model=list[InfosecItemActivityRead])
def item_activity(
    product_id: str,
    item_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    _get_item_or_404(session, product_id, item_id)

    # Reuses the same ActivityEvent log every other module already writes to
    # (log_activity in create_item/update_item above) rather than a separate
    # history table — INFOSEC_ITEM_ADDED and INFOSEC_ITEM_STATUS_CHANGED rows
    # for this item's ref_id are its full status history.
    events = session.exec(
        select(ActivityEvent)
        .where(ActivityEvent.ref_type == "INFOSEC_ITEM", ActivityEvent.ref_id == item_id)
        .order_by(ActivityEvent.created_at.desc())
    ).all()
    result = []
    for event in events:
        actor = session.get(User, event.actor_id)
        status = (event.metadata_ or {}).get("status")
        result.append(
            InfosecItemActivityRead(
                id=event.id, event_type=event.event_type, status=status,
                actor=UserRead(id=actor.id, name=actor.name, email=actor.email), created_at=event.created_at,
            )
        )
    return result


@router.get("/items/{item_id}/comments", response_model=list[InfosecChecklistCommentRead])
def list_item_comments(
    product_id: str,
    item_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    _get_item_or_404(session, product_id, item_id)

    comments = session.exec(
        select(InfosecChecklistComment)
        .where(InfosecChecklistComment.item_id == item_id)
        .order_by(InfosecChecklistComment.created_at)
    ).all()
    result = []
    for c in comments:
        author = session.get(User, c.author_id)
        result.append(
            InfosecChecklistCommentRead(
                id=c.id, item_id=c.item_id, text=c.text,
                author=UserRead(id=author.id, name=author.name, email=author.email), created_at=c.created_at,
            )
        )
    return result


@router.post("/items/{item_id}/comments", response_model=InfosecChecklistCommentRead)
def create_item_comment(
    product_id: str,
    item_id: str,
    body: InfosecChecklistCommentCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    # Open to any product member — same precedent as DiagramComment
    # (routers/diagrams.py), unlike item edits/status changes which stay
    # role-gated. Comments are discussion, not the higher-stakes action.
    get_member_product(product_id, session, user)
    _get_item_or_404(session, product_id, item_id)

    comment = InfosecChecklistComment(item_id=item_id, author_id=user.id, text=body.text)
    session.add(comment)
    session.commit()
    session.refresh(comment)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="INFOSEC_ITEM_COMMENT_ADDED", ref_type="INFOSEC_ITEM", ref_id=item_id,
        metadata={"comment_id": comment.id},
    )
    return InfosecChecklistCommentRead(
        id=comment.id, item_id=comment.item_id, text=comment.text,
        author=UserRead(id=user.id, name=user.name, email=user.email), created_at=comment.created_at,
    )


@router.get("/vapt-reports", response_model=list[InfosecVAPTReportRead])
def list_vapt_reports(
    product_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    reports = session.exec(
        select(InfosecVAPTReport).where(InfosecVAPTReport.product_id == product_id).order_by(InfosecVAPTReport.round)
    ).all()
    return [_report_to_read(session, r) for r in reports]


@router.post("/vapt-reports", response_model=InfosecVAPTReportRead)
def upload_vapt_report(
    product_id: str,
    notes: str | None = Form(None),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM})

    latest_round = session.exec(
        select(func.max(InfosecVAPTReport.round)).where(InfosecVAPTReport.product_id == product_id)
    ).one()
    next_round = (latest_round or 0) + 1

    try:
        file_url, _content_type = save_upload(file, f"infosec/{product_id}")
    except UploadTooLarge:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    report = InfosecVAPTReport(
        product_id=product_id, round=next_round, file_url=file_url, notes=notes, uploaded_by_id=user.id,
    )
    session.add(report)
    session.commit()
    session.refresh(report)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="INFOSEC_VAPT_REPORT_UPLOADED", ref_type="INFOSEC_VAPT_REPORT", ref_id=report.id,
        metadata={"round": report.round},
    )
    return _report_to_read(session, report)
