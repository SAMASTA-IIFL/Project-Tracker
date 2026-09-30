from fastapi import APIRouter, Depends, HTTPException

from app.activity import log_activity
from app.deps import get_member_product
from app.lifecycle import advance_to_next_stage
from app.models import Product, ProductMember, ProductRole, User, product_members_db, products_db, users_db
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
def list_products(user: User = Depends(get_current_user)):
    memberships = product_members_db.where(user_id=user.id)
    products = [products_db.get(m.product_id) for m in memberships]
    products = [p for p in products if p is not None]
    products.sort(key=lambda p: p.updated_at, reverse=True)
    return products


@router.post("", response_model=ProductRead)
def create_product(
    body: ProductCreate,
    user: User = Depends(get_current_user),
):
    product = products_db.set(Product(name=body.name, description=body.description, owner_id=user.id))
    product_members_db.set(ProductMember(product_id=product.id, user_id=user.id, role=ProductRole.PM))

    log_activity(
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
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, user)

    members = product_members_db.where(product_id=product_id)
    member_reads = []
    for m in members:
        member_user = users_db.get(m.user_id)
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
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, user)
    require_roles(product_id, user, {ProductRole.PM})

    # find-or-create by email — lets a PM add a teammate to a product before
    # that person has ever signed in with Google.
    member_user = users_db.first(email=body.email)
    if not member_user:
        member_user = users_db.set(User(email=body.email, name=body.name or body.email.split("@")[0]))

    existing = product_members_db.first(product_id=product_id, user_id=member_user.id)
    if existing:
        raise HTTPException(status_code=400, detail="This person is already a member of this product")

    membership = product_members_db.set(ProductMember(product_id=product_id, user_id=member_user.id, role=body.role))

    log_activity(
        product_id=product_id, actor_id=user.id,
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
    user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, user)
    require_roles(product_id, user, {ProductRole.PM})

    from_stage = product.current_stage
    to_stage = advance_to_next_stage(product)

    log_activity(
        product_id=product_id, actor_id=user.id,
        event_type="STAGE_ADVANCED", ref_type="PRODUCT", ref_id=product.id,
        metadata={"from": from_stage, "to": to_stage},
    )
    return product
