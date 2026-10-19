"""Environment-driven settings.

All configuration flows through this module so tests can point at a throwaway
database without touching the development one.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SKILLMATCH_", env_file=".env", extra="ignore")

    # SQLAlchemy URL. Postgres by default; tests override this.
    database_url: str = "postgresql+psycopg://daya@127.0.0.1:5433/skillmatch"

    # Signs the session cookie. MUST be overridden in production.
    secret: str = "dev-only-insecure-secret-change-me"

    # Cookie hardening, off for local http.
    cookie_secure: bool = False
    cookie_name: str = "skillmatch_session"

    # Session lifetime in seconds (14 days).
    session_max_age: int = 60 * 60 * 24 * 14

    # Echo SQL to stdout; useful when demonstrating queries.
    sql_echo: bool = False

    # Where uploaded avatars live. Kept outside the SPA build output so
    # rebuilding the frontend never deletes people's pictures.
    upload_dir: str = "var/avatars"

    # Public base URL of the backend (used to build OAuth callbacks).
    public_base_url: str = "http://127.0.0.1:8766"

    # Where to send the browser after an OAuth round-trip.
    frontend_base_url: str = "http://127.0.0.1:5173"

    # OAuth providers. A provider is offered only when both values are set.
    github_client_id: str = ""
    github_client_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""

    @property
    def is_test(self) -> bool:
        return self.database_url.endswith("_test") or "test" in self.database_url

    def oauth_configured(self, provider: str) -> bool:
        if provider == "github":
            return bool(self.github_client_id and self.github_client_secret)
        if provider == "google":
            return bool(self.google_client_id and self.google_client_secret)
        return False


@lru_cache
def get_settings() -> Settings:
    return Settings()
