from fastapi import APIRouter, Depends

from app.models import User
from app.schemas import MeRead
from app.security import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


# Sign-in itself happens entirely client-side via Firebase Authentication
# (Google Sign-In — see frontend/src/lib/firebase.ts). The frontend just
# sends the resulting Firebase ID token as a Bearer token; get_current_user
# verifies it and upserts the matching Firestore user record. So this one
# endpoint does double duty as both "log me in" (first call after sign-in
# creates the user) and "who am I" (every call after that).
@router.get("/me", response_model=MeRead)
def me(user: User = Depends(get_current_user)):
    return MeRead(id=user.id, name=user.name, email=user.email, global_role=user.global_role)
