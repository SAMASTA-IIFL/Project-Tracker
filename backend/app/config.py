from pydantic_settings import BaseSettings, SettingsConfigDict

from app.models import GlobalRole


class Settings(BaseSettings):
    # .env.users is loaded second so it stays a separate, independently
    # rotatable file (see .env.users.example) while still landing on the
    # same `auth_users` field below.
    model_config = SettingsConfigDict(env_file=("../.env", "../.env.users"), extra="ignore")

    database_url: str = "postgresql+psycopg://product_pro:product_pro@localhost:5432/product_pro"

    auth_provider: str = "dev-credentials"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # a week, fine for an internal tool

    # "email:password:role,email:password:role,..." — see .env.users.example.
    # Only used when auth_provider == "dev-credentials".
    auth_users: str = ""

    ai_provider: str = "mock"
    # Empty means "use the provider's own default model" — see app/ai.py.
    ai_model: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    storage_provider: str = "local-disk"
    storage_local_dir: str = "./.uploads"

    # Secrets Vault admin breakglass (app/vault_recovery.py) — a genuine
    # server-held secret, treat with the same operational care as jwt_secret.
    # Base64, 32 bytes. If unset, breakglass stays disabled (no recovery
    # keypair is generated) rather than the app failing to start.
    vault_recovery_master_key: str = ""

    def parsed_auth_users(self) -> dict[str, tuple[str, GlobalRole]]:
        """email (lowercased) -> (password, global_role), parsed from auth_users."""
        users: dict[str, tuple[str, GlobalRole]] = {}
        for entry in self.auth_users.split(","):
            entry = entry.strip()
            if not entry:
                continue
            parts = entry.split(":")
            if len(parts) != 3:
                continue
            email, password, role = (p.strip() for p in parts)
            try:
                global_role = GlobalRole(role.upper())
            except ValueError:
                global_role = GlobalRole.MEMBER
            users[email.lower()] = (password, global_role)
        return users


settings = Settings()
