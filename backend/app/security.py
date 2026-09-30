from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth

from app.config import settings
from app.models import GlobalRole, User, users_db

# No locally-issued JWT anymore — the frontend gets an ID token straight from
# Firebase after Google Sign-In (see frontend/src/lib/firebase.ts) and sends
# that as the Bearer token on every request. This just verifies it.
bearer_scheme = HTTPBearer(auto_error=False)


def _upsert_user(uid: str, email: str, name: str | None) -> User:
    is_admin_email = email.lower() in settings.admin_emails()
    global_role = GlobalRole.ADMIN if is_admin_email else GlobalRole.MEMBER

    user = users_db.first(firebase_uid=uid)
    if not user:
        # No user is tied to this Firebase account yet — but a PM may have
        # already pre-provisioned a User row for this email via "Add member"
        # (app/routers/products.py) before this person ever signed in. Claim
        # that placeholder instead of creating a second, disconnected User —
        # otherwise their existing ProductMember/TaskAssignee rows (which
        # point at the placeholder's id) would silently stop being "them".
        user = users_db.first(email=email)

    if not user:
        return users_db.set(User(email=email, name=name or email.split("@")[0], global_role=global_role, firebase_uid=uid))

    changed = False
    if user.firebase_uid != uid:
        user.firebase_uid = uid
        changed = True
    if name and user.name != name:
        user.name = name
        changed = True
    if user.global_role != global_role:
        # settings.firebase_admin_emails is the source of truth for role —
        # keep the Firestore record in sync if it's edited after the user's
        # first sign-in (mirrors the pre-Firebase dev-credentials behavior).
        user.global_role = global_role
        changed = True
    return users_db.set(user) if changed else user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if not credentials:
        raise unauthorized
    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
    except Exception:
        raise unauthorized

    email = decoded.get("email")
    if not email:
        raise unauthorized

    return _upsert_user(decoded["uid"], email, decoded.get("name"))
