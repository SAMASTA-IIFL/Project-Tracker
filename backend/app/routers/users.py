from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, or_, select

from app.database import get_session
from app.models import User
from app.schemas import UserSearchRead
from app.security import get_current_user

# First global, platform-wide user-search endpoint in this app -- everything
# else (e.g. products.py's "add member") is a raw email box with
# find-or-create, not a search. Needed here because a Secrets Vault owner
# grants access to any user on the platform, not just members of one product.
router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserSearchRead])
def search_users(
    q: str = Query(default="", min_length=0),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    q = q.strip()
    if len(q) < 2:
        return []

    like = f"%{q}%"
    statement = (
        select(User)
        .where(User.id != user.id)
        .where(or_(User.name.ilike(like), User.email.ilike(like)))
        .limit(20)
    )
    return session.exec(statement).all()
