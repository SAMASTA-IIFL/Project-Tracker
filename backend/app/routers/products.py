from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.activity import log_activity
from app.database import get_session
from app.deps import get_member_product
from app.lifecycle import advance_to_next_stage
from app.models import Product, ProductMember, ProductRole, User
from app.permissions import require_roles
from app.schemas import (
    ProductCreate,
    ProductDetailRead,
    ProductMemberCreate,
    ProductMemberRead,
    ProductRead,
    UserRead,
)
from app.security import get_current_user

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("", response_model=list[ProductRead])
def list_products(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    statement = (
        select(Product)
        .join(ProductMember, ProductMember.product_id == Product.id)
        .where(ProductMember.user_id == user.id)
        .order_by(Product.updated_at.desc())
    )
    return session.exec(statement).all()


@router.post("", response_model=ProductRead)
def create_product(
    body: ProductCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    product = Product(name=body.name, description=body.description, owner_id=user.id)
    session.add(product)
    session.commit()
    session.refresh(product)

    session.add(ProductMember(product_id=product.id, user_id=user.id, role=ProductRole.PM))
    session.commit()

    log_activity(
        session,
        product_id=product.id,
        actor_id=user.id,
        event_type="PRODUCT_CREATED",
        ref_type="PRODUCT",
        ref_id=product.id,
    )

    return product


@router.get("/{product_id}", response_model=ProductDetailRead)
def get_product(
    product_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, session, user)

    members = session.exec(select(ProductMember).where(ProductMember.product_id == product_id)).all()
    member_reads = []
    for m in members:
        member_user = session.get(User, m.user_id)
        member_reads.append(
            ProductMemberRead(
                id=m.id,
                role=m.role,
                user=UserRead(id=member_user.id, name=member_user.name, email=member_user.email),
            )
        )

    return ProductDetailRead(**product.model_dump(), members=member_reads)


@router.post("/{product_id}/members", response_model=ProductMemberRead)
def add_member(
    product_id: str,
    body: ProductMemberCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM})

    # dev-credentials-style find-or-create by email (app/routers/auth.py mirrors this) —
    # lets a PM add a teammate to a product before that person has ever signed in.
    member_user = session.exec(select(User).where(User.email == body.email)).first()
    if not member_user:
        member_user = User(email=body.email, name=body.name or body.email.split("@")[0])
        session.add(member_user)
        session.commit()
        session.refresh(member_user)

    existing = session.exec(
        select(ProductMember).where(
            ProductMember.product_id == product_id, ProductMember.user_id == member_user.id
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="This person is already a member of this product")

    membership = ProductMember(product_id=product_id, user_id=member_user.id, role=body.role)
    session.add(membership)
    session.commit()
    session.refresh(membership)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="MEMBER_ADDED", ref_type="PRODUCT_MEMBER", ref_id=membership.id,
        metadata={"email": member_user.email, "role": membership.role},
    )
    return ProductMemberRead(
        id=membership.id, role=membership.role,
        user=UserRead(id=member_user.id, name=member_user.name, email=member_user.email),
    )


@router.post("/{product_id}/advance-stage", response_model=ProductRead)
def advance_stage(
    product_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, session, user)
    require_roles(session, product_id, user, {ProductRole.PM})

    from_stage = product.current_stage
    to_stage = advance_to_next_stage(session, product)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="STAGE_ADVANCED", ref_type="PRODUCT", ref_id=product.id,
        metadata={"from": from_stage, "to": to_stage},
    )
    return product
