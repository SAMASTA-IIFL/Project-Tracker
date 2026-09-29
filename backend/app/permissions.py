from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import GlobalRole, ProductMember, ProductRole, User


def get_product_role(session: Session, product_id: str, user: User) -> ProductRole | None:
    membership = session.exec(
        select(ProductMember).where(
            ProductMember.product_id == product_id, ProductMember.user_id == user.id
        )
    ).first()
    return membership.role if membership else None


# Global Admins bypass per-product role checks (mirrors the "Admin" column in PRD §4,
# which is ✅ for every action regardless of ProductMember role).
def require_roles(session: Session, product_id: str, user: User, allowed: set[ProductRole]) -> None:
    if user.global_role == GlobalRole.ADMIN:
        return
    role = get_product_role(session, product_id, user)
    if role is None or role not in allowed:
        raise HTTPException(status_code=403, detail="Not permitted for your role on this product")
