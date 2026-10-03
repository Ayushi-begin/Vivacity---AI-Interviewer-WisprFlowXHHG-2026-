from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Vivacity/ — the .env file lives at the repo root.
ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT_DIR / "backend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Vivacity API"

    # Neon connection string, e.g. postgresql://user:pass@host/db?sslmode=require
    DATABASE_URL: str
    DB_ECHO: bool = False

    # Comma-separated list of allowed origins.
    CORS_ORIGINS: str = "http://localhost:5173"
    FRONTEND_URL: str = "http://localhost:5173"

    # --- JWT ---
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- Password reset ---
    PASSWORD_RESET_OTP_EXPIRE_MINUTES: int = 10
    PASSWORD_RESET_OTP_MAX_ATTEMPTS: int = 5

    # --- OAuth (a provider is disabled while its client id is empty) ---
    OAUTH_REDIRECT_BASE_URL: str = "http://localhost:8000/api/v1"
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""

    # --- OpenAI (interview endpoints return 503 while the key is empty) ---
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # --- Email (Brevo HTTP API). Without both values, OTPs print to the console. ---
    BREVO_API_KEY: str = ""
    EMAIL_FROM: str = ""
    EMAIL_FROM_NAME: str = "Vivacity"

    # --- Abuse protection: per-IP / per-user request limits (see app/api/rate_limits.py) ---
    RATE_LIMIT_ENABLED: bool = True

    # --- API docs at /docs and /redoc. Turn off in production. ---
    DOCS_ENABLED: bool = True

    # --- Resume uploads (relative paths resolve against backend/) ---
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_MB: int = 5

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def _strong_secret(cls, value: str) -> str:
        # HS256 needs at least 256 bits of key; a short secret can be brute-forced offline.
        if len(value) < 32:
            raise ValueError(
                "JWT_SECRET_KEY must be at least 32 characters. Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(64))"'
            )
        return value

    @property
    def email_enabled(self) -> bool:
        return bool(self.BREVO_API_KEY and self.EMAIL_FROM)

    @property
    def upload_path(self) -> Path:
        path = Path(self.UPLOAD_DIR)
        return path if path.is_absolute() else BACKEND_DIR / path

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
