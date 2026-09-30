import base64
import logging
import os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings
from app.models import VaultRecoveryKey, vault_recovery_key_db

logger = logging.getLogger(__name__)

_RECOVERY_KEY_ID = "singleton"

# This module is the ONE deliberate exception to Secrets Vault's end-to-end
# encryption guarantee -- see the plan's "Admin breakglass" section. Every
# other part of the vault (app/routers/vault.py, app/vault_access.py) never
# constructs a private key or produces a secret's plaintext value; only the
# functions below do, and only the admin-only breakglass-reveal endpoint
# calls them.


def ensure_vault_recovery_key() -> None:
    """Generate the platform-wide admin-breakglass recovery keypair once, if
    settings.vault_recovery_master_key is configured and no key exists yet.
    If the master key isn't set, breakglass simply stays disabled -- this
    must never block startup, matching every other *_provider abstraction's
    "degrade gracefully with no config" behavior elsewhere in this app.
    """
    if not settings.vault_recovery_master_key:
        logger.warning(
            "VAULT_RECOVERY_MASTER_KEY not set — Secrets Vault admin breakglass is disabled"
        )
        return

    try:
        master_key = base64.b64decode(settings.vault_recovery_master_key)
    except Exception:
        logger.exception("VAULT_RECOVERY_MASTER_KEY is not valid base64 — breakglass disabled")
        return
    if len(master_key) != 32:
        logger.error("VAULT_RECOVERY_MASTER_KEY must decode to exactly 32 bytes — breakglass disabled")
        return

    if vault_recovery_key_db.get(_RECOVERY_KEY_ID):
        return

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()

    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    aesgcm = AESGCM(master_key)
    iv = os.urandom(12)
    ciphertext = aesgcm.encrypt(iv, private_bytes, None)

    vault_recovery_key_db.set(
        VaultRecoveryKey(
            id=_RECOVERY_KEY_ID,
            public_key=base64.b64encode(public_bytes).decode(),
            encrypted_private_key=f"{base64.b64encode(iv).decode()}:{base64.b64encode(ciphertext).decode()}",
        )
    )
    logger.info("Generated Secrets Vault admin-breakglass recovery keypair")


def get_recovery_public_key() -> str | None:
    row = vault_recovery_key_db.get(_RECOVERY_KEY_ID)
    return row.public_key if row else None


def _decrypt_recovery_private_key() -> rsa.RSAPrivateKey:
    if not settings.vault_recovery_master_key:
        raise RuntimeError("Admin breakglass is not configured (VAULT_RECOVERY_MASTER_KEY unset)")

    row = vault_recovery_key_db.get(_RECOVERY_KEY_ID)
    if not row:
        raise RuntimeError("No vault recovery key has been generated yet")

    master_key = base64.b64decode(settings.vault_recovery_master_key)
    iv_b64, ciphertext_b64 = row.encrypted_private_key.split(":", 1)
    private_bytes = AESGCM(master_key).decrypt(base64.b64decode(iv_b64), base64.b64decode(ciphertext_b64), None)
    return serialization.load_der_private_key(private_bytes, password=None)


def breakglass_decrypt_secret_value(*, recovery_wrapped_key: str, iv: str, ciphertext: str) -> str:
    """Unwraps a secret's DEK with the recovery private key and decrypts its
    value. Called only from the admin-only POST .../breakglass-reveal
    endpoint in app/routers/vault.py -- the sole place in this codebase
    where a vault secret's plaintext is ever produced server-side."""
    private_key = _decrypt_recovery_private_key()
    dek = private_key.decrypt(
        base64.b64decode(recovery_wrapped_key),
        padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
    )
    plaintext = AESGCM(dek).decrypt(base64.b64decode(iv), base64.b64decode(ciphertext), None)
    return plaintext.decode("utf-8")
