from app.models import VaultAuditLog, vault_audit_log_db

# Mirrors app/activity.py::log_activity()'s role for products, but writes to
# VaultAuditLog instead of ActivityEvent (which has a non-nullable
# product_id and can't represent a personal vault secret's history).


def log_vault_event(
    *,
    secret_id: str,
    actor_id: str,
    action: str,
    metadata: dict | None = None,
) -> VaultAuditLog:
    entry = VaultAuditLog(secret_id=secret_id, actor_id=actor_id, action=action, metadata_=metadata)
    return vault_audit_log_db.set(entry)
