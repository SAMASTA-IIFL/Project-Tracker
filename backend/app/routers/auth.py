from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.models import User
from app.schemas import DevLoginRequest, MeRead, TokenResponse
from app.security import create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/dev-login", response_model=TokenResponse)
def dev_login(body: DevLoginRequest, session: Session = Depends(get_session)):
    # AUTH_PROVIDER selects the sign-in method without touching call sites
    # elsewhere in the app (see .env.example). "dev-credentials" checks the
    # email/password against AUTH_USERS in .env.users — no external SSO app
    # registration needed, but not a placeholder either: wrong credentials
    # are rejected.
    if settings.auth_provider != "dev-credentials":
        raise HTTPException(status_code=400, detail=f"AUTH_PROVIDER={settings.auth_provider} not wired yet")

    invalid = HTTPException(status_code=401, detail="Invalid email or password")
    known_users = settings.parsed_auth_users()
    entry = known_users.get(body.email.lower())
    if not entry or entry[0] != body.password:
        raise invalid
    _password, global_role = entry

    user = session.exec(select(User).where(User.email == body.email)).first()
    if not user:
        user = User(email=body.email, name=body.name or body.email.split("@")[0], global_role=global_role)
        session.add(user)
        session.commit()
        session.refresh(user)
    elif user.global_role != global_role:
        # .env.users is the source of truth for role — keep the DB in sync
        # if an admin edits the file after the user already has a row.
        user.global_role = global_role
        session.add(user)
        session.commit()
        session.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=MeRead(id=user.id, name=user.name, email=user.email, global_role=user.global_role),
    )


@router.get("/me", response_model=MeRead)
def me(user: User = Depends(get_current_user)):
    return MeRead(id=user.id, name=user.name, email=user.email, global_role=user.global_role)
