from fastapi import HTTPException

from app.models import GlobalRole, Product, User, product_members_db, products_db


# Global Admin bypasses the membership requirement, mirroring how
# permissions.require_roles already bypasses per-product role checks for
# Admin (PRD §4: Admin is ✅ for every action regardless of ProductMember
# row). Every router calls this as the read-access floor, so this is the
# single place that needed the bypass added.
def get_member_product(product_id: str, user: User) -> Product:
    if user.global_role != GlobalRole.ADMIN:
        membership = product_members_db.first(product_id=product_id, user_id=user.id)
        if not membership:
            raise HTTPException(status_code=404, detail="Product not found")

    product = products_db.get(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
