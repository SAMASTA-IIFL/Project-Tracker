from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import GlobalRole, Product, ProductMember, User


# Global Admin bypasses the membership requirement, mirroring how
# permissions.require_roles already bypasses per-product role checks for
# Admin (PRD §4: Admin is ✅ for every action regardless of ProductMember
# row). Every router calls this as the read-access floor, so this is the
# single place that needed the bypass added.
def get_member_product(product_id: str, session: Session, user: User) -> Product:
    if user.global_role != GlobalRole.ADMIN:
        membership = session.exec(
            select(ProductMember).where(
                ProductMember.product_id == product_id, ProductMember.user_id == user.id
            )
        ).first()
        if not membership:
            raise HTTPException(status_code=404, detail="Product not found")

    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
