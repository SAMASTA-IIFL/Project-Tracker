from fastapi import APIRouter, Depends, Query

from app.models import User, users_db
from app.schemas import UserSearchRead
from app.security import get_current_user

# First global, platform-wide user-search endpoint in this app -- everything
# else (e.g. products.py's "add member") is a raw email box with
# find-or-create, not a search. Needed here because a Secrets Vault owner
# grants access to any user on the platform, not just members of one product.
router = APIRouter(prefix="/api/users", tags=["users"])

# Firestore has no substring/ILIKE search, so this scans every user and
# filters in Python — fine for an internal tool's user count, and a lot
# simpler than standing up a separate search index for this one box.
_SCAN_LIMIT = 1000


@router.get("", response_model=list[UserSearchRead])
def search_users(
    q: str = Query(default="", min_length=0),
    user: User = Depends(get_current_user),
):
    q = q.strip().lower()
    if len(q) < 2:
        return []

    candidates = users_db.all()[:_SCAN_LIMIT]
    matches = [
        u for u in candidates
        if u.id != user.id and (q in (u.name or "").lower() or q in u.email.lower())
    ][:20]
    return [
        UserSearchRead(id=u.id, name=u.name, email=u.email, vault_public_key=u.vault_public_key)
        for u in matches
    ]
