from fastapi import HTTPException

from app.models import GlobalRole, ProductRole, User, product_members_db


def get_product_role(product_id: str, user: User) -> ProductRole | None:
    membership = product_members_db.first(product_id=product_id, user_id=user.id)
    return membership.role if membership else None


# Global Admins bypass per-product role checks (mirrors the "Admin" column in PRD §4,
# which is ✅ for every action regardless of ProductMember role).
def require_roles(product_id: str, user: User, allowed: set[ProductRole]) -> None:
    if user.global_role == GlobalRole.ADMIN:
        return
    role = get_product_role(product_id, user)
    if role is None or role not in allowed:
        raise HTTPException(status_code=403, detail="Not permitted for your role on this product")
