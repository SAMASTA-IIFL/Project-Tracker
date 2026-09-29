from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_member_product
from app.models import GlobalRole, SecretGrant, User, VaultSecret
from app.schemas import (
    UserRead,
    UserSearchRead,
    VaultAuditEntryRead,
    VaultBreakglassRevealRead,
    VaultGrantCreate,
    VaultGrantRead,
    VaultKeypairRead,
    VaultKeypairSet,
    VaultSecretCreate,
    VaultSecretRead,
    VaultSecretRevealRead,
)
from app.security import get_current_user
from app.vault_access import get_secret_or_404, require_access, require_owner
from app.vault_audit import log_vault_event
from app.vault_recovery import breakglass_decrypt_secret_value, get_recovery_public_key

router = APIRouter(prefix="/api/vault", tags=["vault"])


def _to_user_read(user: User) -> UserRead:
    return UserRead(id=user.id, name=user.name, email=user.email)


def _to_secret_read(secret: VaultSecret, owner: User, my_access: Literal["OWNER", "GRANTED"]) -> VaultSecretRead:
    return VaultSecretRead(
        id=secret.id,
        owner=_to_user_read(owner),
        product_id=secret.product_id,
        name=secret.name,
        description=secret.description,
        my_access=my_access,
        created_at=secret.created_at,
        updated_at=secret.updated_at,
    )


# --- Recovery public key (safe to be public — needed client-side at secret creation) ---

@router.get("/recovery-public-key")
def get_recovery_public_key_endpoint(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    public_key = get_recovery_public_key(session)
    if not public_key:
        raise HTTPException(status_code=503, detail="Vault admin breakglass is not configured on this server")
    return {"public_key": public_key}


# --- Per-user keypair bootstrap / unlock ---

@router.post("/keypair", response_model=VaultKeypairRead)
def set_keypair(
    body: VaultKeypairSet,
    force: bool = Query(default=False),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if user.vault_public_key and not force:
        raise HTTPException(
            status_code=400,
            detail="Vault already set up for this user — pass force=true to reset (this orphans every existing grant wrapped with the old key)",
        )
    user.vault_public_key = body.public_key
    user.vault_wrapped_private_key = body.wrapped_private_key
    session.add(user)
    session.commit()
    session.refresh(user)
    return VaultKeypairRead(public_key=user.vault_public_key, wrapped_private_key=user.vault_wrapped_private_key)


@router.get("/keypair", response_model=VaultKeypairRead)
def get_my_keypair(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if not user.vault_public_key or not user.vault_wrapped_private_key:
        raise HTTPException(status_code=404, detail="Vault not set up for this user yet")
    return VaultKeypairRead(public_key=user.vault_public_key, wrapped_private_key=user.vault_wrapped_private_key)


@router.get("/public-key/{user_id}")
def get_user_public_key(
    user_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    target = session.get(User, user_id)
    if not target or not target.vault_public_key:
        raise HTTPException(status_code=404, detail="This user hasn't set up their vault yet")
    return {"public_key": target.vault_public_key}


# --- Secrets ---

@router.post("/secrets", response_model=VaultSecretRead)
def create_secret(
    body: VaultSecretCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not user.vault_public_key:
        raise HTTPException(status_code=400, detail="Set up your vault before creating a secret")
    if body.product_id:
        get_member_product(body.product_id, session, user)  # 404 if not a member — product tag is metadata, not an access grant

    secret = VaultSecret(
        owner_id=user.id,
        product_id=body.product_id,
        name=body.name,
        description=body.description,
        ciphertext=body.ciphertext,
        iv=body.iv,
        recovery_wrapped_key=body.recovery_wrapped_key,
    )
    session.add(secret)
    session.commit()
    session.refresh(secret)

    session.add(
        SecretGrant(secret_id=secret.id, user_id=user.id, wrapped_key=body.owner_wrapped_key, granted_by_id=user.id)
    )
    session.commit()
    log_vault_event(session, secret_id=secret.id, actor_id=user.id, action="CREATED")

    for grant in body.initial_grants:
        grantee = session.get(User, grant.user_id)
        if not grantee or not grantee.vault_public_key:
            raise HTTPException(status_code=400, detail=f"User {grant.user_id} hasn't set up their vault yet")
        session.add(
            SecretGrant(secret_id=secret.id, user_id=grant.user_id, wrapped_key=grant.wrapped_key, granted_by_id=user.id)
        )
        session.commit()
        log_vault_event(session, secret_id=secret.id, actor_id=user.id, action="GRANTED", metadata={"user_id": grant.user_id})

    return _to_secret_read(secret, user, "OWNER")


@router.get("/secrets", response_model=list[VaultSecretRead])
def list_secrets(
    scope: Literal["mine", "shared"] = Query(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if scope == "mine":
        secrets = session.exec(
            select(VaultSecret).where(VaultSecret.owner_id == user.id).order_by(VaultSecret.updated_at.desc())
        ).all()
        return [_to_secret_read(s, user, "OWNER") for s in secrets]

    statement = (
        select(VaultSecret)
        .join(SecretGrant, SecretGrant.secret_id == VaultSecret.id)
        .where(SecretGrant.user_id == user.id, VaultSecret.owner_id != user.id)
        .order_by(VaultSecret.updated_at.desc())
    )
    secrets = session.exec(statement).all()
    reads = []
    for s in secrets:
        owner = session.get(User, s.owner_id)
        reads.append(_to_secret_read(s, owner, "GRANTED"))
    return reads


@router.get("/secrets/{secret_id}", response_model=VaultSecretRead)
def get_secret_detail(secret_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    secret = require_owner(session, secret_id, user)
    return _to_secret_read(secret, user, "OWNER")


@router.get("/secrets/{secret_id}/reveal-data", response_model=VaultSecretRevealRead)
def reveal_secret(secret_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    secret, grant = require_access(session, secret_id, user)
    try:
        log_vault_event(session, secret_id=secret.id, actor_id=user.id, action="VIEWED")
    except Exception:
        pass  # best-effort audit — never block a legitimate reveal on a logging failure
    return VaultSecretRevealRead(ciphertext=secret.ciphertext, iv=secret.iv, wrapped_key=grant.wrapped_key)


@router.get("/secrets/{secret_id}/grants", response_model=list[VaultGrantRead])
def list_grants(secret_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    require_owner(session, secret_id, user)
    grants = session.exec(select(SecretGrant).where(SecretGrant.secret_id == secret_id)).all()
    reads = []
    for g in grants:
        grantee = session.get(User, g.user_id)
        granted_by = session.get(User, g.granted_by_id)
        reads.append(VaultGrantRead(id=g.id, user=_to_user_read(grantee), granted_by=_to_user_read(granted_by), created_at=g.created_at))
    return reads


@router.post("/secrets/{secret_id}/grants", response_model=VaultGrantRead)
def grant_access(
    secret_id: str,
    body: VaultGrantCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    require_owner(session, secret_id, user)

    grantee = session.get(User, body.user_id)
    if not grantee or not grantee.vault_public_key:
        raise HTTPException(status_code=400, detail="This user hasn't set up their vault yet")

    existing = session.exec(
        select(SecretGrant).where(SecretGrant.secret_id == secret_id, SecretGrant.user_id == body.user_id)
    ).first()
    if existing:
        # Upsert — a harmless "re-invite" since the DEK never changes.
        existing.wrapped_key = body.wrapped_key
        session.add(existing)
        session.commit()
        session.refresh(existing)
        grant = existing
    else:
        grant = SecretGrant(secret_id=secret_id, user_id=body.user_id, wrapped_key=body.wrapped_key, granted_by_id=user.id)
        session.add(grant)
        session.commit()
        session.refresh(grant)

    log_vault_event(session, secret_id=secret_id, actor_id=user.id, action="GRANTED", metadata={"user_id": body.user_id})
    return VaultGrantRead(id=grant.id, user=_to_user_read(grantee), granted_by=_to_user_read(user), created_at=grant.created_at)


@router.delete("/secrets/{secret_id}/grants/{grantee_user_id}", status_code=204)
def revoke_access(
    secret_id: str,
    grantee_user_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    require_owner(session, secret_id, user)
    if grantee_user_id == user.id:
        raise HTTPException(status_code=400, detail="Owners can't revoke their own access")

    grant = session.exec(
        select(SecretGrant).where(SecretGrant.secret_id == secret_id, SecretGrant.user_id == grantee_user_id)
    ).first()
    if not grant:
        raise HTTPException(status_code=404, detail="Grant not found")

    session.delete(grant)
    session.commit()
    log_vault_event(session, secret_id=secret_id, actor_id=user.id, action="REVOKED", metadata={"user_id": grantee_user_id})


@router.get("/secrets/{secret_id}/audit", response_model=list[VaultAuditEntryRead])
def get_audit_log(secret_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    require_owner(session, secret_id, user)
    from app.models import VaultAuditLog

    entries = session.exec(
        select(VaultAuditLog).where(VaultAuditLog.secret_id == secret_id).order_by(VaultAuditLog.created_at.desc())
    ).all()
    reads = []
    for e in entries:
        actor = session.get(User, e.actor_id)
        reads.append(VaultAuditEntryRead(id=e.id, action=e.action, actor=_to_user_read(actor), created_at=e.created_at, metadata=e.metadata_))
    return reads


# --- Admin breakglass ---
#
# The ONLY endpoint in this feature where the backend ever produces a
# secret's plaintext value. Deliberately does NOT go through
# vault_access.require_access — an Admin has no SecretGrant and none is
# created here. Every call is logged as ADMIN_BREAKGLASS_VIEWED so the
# owner can see it in their audit log.

@router.post("/secrets/{secret_id}/breakglass-reveal", response_model=VaultBreakglassRevealRead)
def breakglass_reveal(secret_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if user.global_role != GlobalRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")

    secret = get_secret_or_404(session, secret_id, user)
    try:
        value = breakglass_decrypt_secret_value(
            session,
            recovery_wrapped_key=secret.recovery_wrapped_key,
            iv=secret.iv,
            ciphertext=secret.ciphertext,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    log_vault_event(session, secret_id=secret.id, actor_id=user.id, action="ADMIN_BREAKGLASS_VIEWED")
    return VaultBreakglassRevealRead(value=value)
