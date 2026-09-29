from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import SecretGrant, User, VaultSecret

# Deliberately separate from app/permissions.py, which assumes a product_id
# and a ProductRole -- Secrets Vault is the first personal (non-product-
# scoped) resource in this codebase. A secret's optional product_id is
# purely organizational metadata (see models.py) and grants no access;
# access is exclusively via SecretGrant rows, checked here.
#
# Critically, NEITHER helper below gives GlobalRole.ADMIN any bypass -- that
# would defeat the point of end-to-end encryption. The only way an Admin
# ever reaches a secret's plaintext is the separate, explicitly audited
# breakglass-reveal endpoint (app/routers/vault.py + app/vault_recovery.py),
# which does not go through these functions at all.


def get_secret_or_404(session: Session, secret_id: str, user: User) -> VaultSecret:
    """Existence check only -- callers still need require_owner/require_access."""
    secret = session.get(VaultSecret, secret_id)
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    return secret


def require_owner(session: Session, secret_id: str, user: User) -> VaultSecret:
    """404 (not 403) unless the caller is the owner -- never leak a secret's
    existence to a non-owner, including a grantee."""
    secret = session.get(VaultSecret, secret_id)
    if not secret or secret.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Secret not found")
    return secret


def require_access(session: Session, secret_id: str, user: User) -> tuple[VaultSecret, SecretGrant]:
    """404 unless the caller is the owner or has an explicit SecretGrant.
    Returns the caller's own grant row (owners have a self-grant row too,
    created at secret-creation time)."""
    secret = session.get(VaultSecret, secret_id)
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")

    grant = session.exec(
        select(SecretGrant).where(SecretGrant.secret_id == secret_id, SecretGrant.user_id == user.id)
    ).first()
    if not grant:
        raise HTTPException(status_code=404, detail="Secret not found")
    return secret, grant
