from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session, select

from app.activity import log_activity
from app.database import get_session
from app.deps import get_member_product
from app.models import ArchitectureDiagram, DiagramComment, ProductRole, User
from app.permissions import require_roles
from app.schemas import DiagramCommentCreate, DiagramCommentRead, DiagramRead, UserRead
from app.security import get_current_user
from app.storage import UploadTooLarge, save_upload

router = APIRouter(prefix="/api/products/{product_id}/diagrams", tags=["diagrams"])

UPLOAD_ROLES = {ProductRole.PM, ProductRole.DELIVERY}


def _to_read(session: Session, diagram: ArchitectureDiagram) -> DiagramRead:
    uploader = session.get(User, diagram.uploaded_by_id)
    return DiagramRead(
        id=diagram.id, product_id=diagram.product_id, title=diagram.title, version=diagram.version,
        file_url=diagram.file_url, description=diagram.description,
        uploaded_by=UserRead(id=uploader.id, name=uploader.name, email=uploader.email),
        created_at=diagram.created_at,
    )


def _get_diagram_or_404(session: Session, product_id: str, diagram_id: str) -> ArchitectureDiagram:
    diagram = session.get(ArchitectureDiagram, diagram_id)
    if not diagram or diagram.product_id != product_id:
        raise HTTPException(status_code=404, detail="Diagram not found")
    return diagram


@router.get("", response_model=list[DiagramRead])
def list_diagrams(
    product_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    diagrams = session.exec(
        select(ArchitectureDiagram)
        .where(ArchitectureDiagram.product_id == product_id)
        .order_by(ArchitectureDiagram.title, ArchitectureDiagram.version.desc())
    ).all()
    return [_to_read(session, d) for d in diagrams]


@router.post("", response_model=DiagramRead)
def upload_diagram(
    product_id: str,
    title: str = Form(...),
    description: str | None = Form(None),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, UPLOAD_ROLES)

    try:
        file_url, _content_type = save_upload(file, f"diagrams/{product_id}")
    except UploadTooLarge:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    diagram = ArchitectureDiagram(
        product_id=product_id, title=title, file_url=file_url, description=description, uploaded_by_id=user.id,
    )
    session.add(diagram)
    session.commit()
    session.refresh(diagram)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="DIAGRAM_UPLOADED", ref_type="DIAGRAM", ref_id=diagram.id,
        metadata={"title": diagram.title, "version": diagram.version},
    )
    return _to_read(session, diagram)


@router.post("/{diagram_id}/new-version", response_model=DiagramRead)
def new_diagram_version(
    product_id: str,
    diagram_id: str,
    description: str | None = Form(None),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, UPLOAD_ROLES)
    source = _get_diagram_or_404(session, product_id, diagram_id)

    latest = session.exec(
        select(ArchitectureDiagram)
        .where(ArchitectureDiagram.product_id == product_id, ArchitectureDiagram.title == source.title)
        .order_by(ArchitectureDiagram.version.desc())
    ).first()

    try:
        file_url, _content_type = save_upload(file, f"diagrams/{product_id}")
    except UploadTooLarge:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    diagram = ArchitectureDiagram(
        product_id=product_id, title=source.title, version=latest.version + 1,
        file_url=file_url, description=description, uploaded_by_id=user.id,
    )
    session.add(diagram)
    session.commit()
    session.refresh(diagram)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="DIAGRAM_NEW_VERSION", ref_type="DIAGRAM", ref_id=diagram.id,
        metadata={"title": diagram.title, "version": diagram.version},
    )
    return _to_read(session, diagram)


@router.get("/{diagram_id}/comments", response_model=list[DiagramCommentRead])
def list_comments(
    product_id: str,
    diagram_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    _get_diagram_or_404(session, product_id, diagram_id)

    comments = session.exec(
        select(DiagramComment).where(DiagramComment.diagram_id == diagram_id).order_by(DiagramComment.created_at)
    ).all()
    result = []
    for c in comments:
        author = session.get(User, c.author_id)
        result.append(
            DiagramCommentRead(
                id=c.id, diagram_id=c.diagram_id, text=c.text,
                author=UserRead(id=author.id, name=author.name, email=author.email), created_at=c.created_at,
            )
        )
    return result


@router.post("/{diagram_id}/comments", response_model=DiagramCommentRead)
def create_comment(
    product_id: str,
    diagram_id: str,
    body: DiagramCommentCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    _get_diagram_or_404(session, product_id, diagram_id)

    comment = DiagramComment(diagram_id=diagram_id, author_id=user.id, text=body.text)
    session.add(comment)
    session.commit()
    session.refresh(comment)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="DIAGRAM_COMMENT_ADDED", ref_type="DIAGRAM", ref_id=diagram_id,
        metadata={"comment_id": comment.id},
    )
    return DiagramCommentRead(
        id=comment.id, diagram_id=comment.diagram_id, text=comment.text,
        author=UserRead(id=user.id, name=user.name, email=user.email), created_at=comment.created_at,
    )
