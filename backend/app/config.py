from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    # Firebase (Firestore + Firebase Authentication). Path to the Admin SDK
    # service-account JSON — Firebase Console > Project Settings > Service
    # Accounts > "Generate new private key". Keep this file out of git.
    firebase_credentials_path: str = ""
    # Only needed if it can't be inferred from the service account file
    # (it normally can — this is a fallback/override).
    firebase_project_id: str = ""

    # Comma-separated emails auto-promoted to GlobalRole.ADMIN the first time
    # they sign in with Google — there's no in-app "make someone Admin" flow
    # yet, so this is how the first admin(s) get seeded.
    firebase_admin_emails: str = ""

    ai_provider: str = "mock"
    # Empty means "use the provider's own default model" — see app/ai.py.
    ai_model: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    storage_provider: str = "local-disk"
    storage_local_dir: str = "./.uploads"

    # Secrets Vault admin breakglass (app/vault_recovery.py) — a genuine
    # server-held secret, treat with the same operational care as any other
    # credential here. Base64, 32 bytes. If unset, breakglass stays disabled
    # (no recovery keypair is generated) rather than the app failing to start.
    vault_recovery_master_key: str = ""

    def admin_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.firebase_admin_emails.split(",") if e.strip()}


settings = Settings()
