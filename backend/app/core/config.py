from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"
ENV_LOCAL_FILE = BACKEND_DIR / ".env.local"


class Settings(BaseSettings):
    """All configuration for the API, database, worker, and optional market-data APIs."""

    model_config = SettingsConfigDict(
        env_file=(ENV_FILE, ENV_LOCAL_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = Field(default="development")
    log_level: str = Field(default="INFO")
    api_title: str = Field(default="Stock Predictor API")
    api_version: str = Field(default="1.0.0")
    api_description: str = Field(default="Financial predictions")

    cors_origins: str = Field(default="*")

    database_url: str | None = Field(default=None)
    postgres_user: str = Field(default="postgres")
    postgres_password: str = Field(default="postgres")
    postgres_host: str = Field(default="localhost")
    postgres_port: int = Field(default=5432, ge=1, le=65535)
    postgres_db: str = Field(default="stock_predictor")

    db_echo: bool = Field(default=False)
    db_pool_size: int = Field(default=10, ge=1)
    db_max_overflow: int = Field(default=20, ge=0)
    # Dev-only
    db_auto_create: bool = Field(default=False)

    # (EOD ingest + nightly Prophet / baseline training)
    worker_symbols: str = Field(
        default="AAPL,MSFT,AMZN,GOOGL,META,NVDA,TSLA",
        description="Comma-separated tickers processed by the worker",
    )
    worker_timezone: str = Field(default="America/New_York")
    worker_daily_hour: int = Field(default=22, ge=0, le=23)
    worker_daily_minute: int = Field(default=5, ge=0, le=59)
    worker_ingest_period: str = Field(default="1y")
    worker_fetch_ticker_info: bool = Field(default=True)
    worker_train_min_rows: int = Field(default=60, ge=30)
    worker_run_on_start: bool = Field(default=False)

    # Live intraday fetch on demand, not stored in Postgres
    market_data_provider: str = Field(default="twelvedata")
    market_data_api_key: str | None = Field(default=None)
    # Backend cache + max upstream fetch interval per ticker (seconds).
    intraday_cache_ttl_seconds: int = Field(default=300, ge=0)

    @field_validator("app_env", mode="before")
    @classmethod
    def _normalize_app_env(cls, value: object) -> str:
        return str(value).strip().lower() if value is not None else "development"

    @field_validator("log_level", mode="before")
    @classmethod
    def _normalize_log_level(cls, value: object) -> str:
        return str(value).strip().upper() if value is not None else "INFO"

    @property
    def is_development(self) -> bool:
        return self.app_env in ("development", "dev", "local")

    @property
    def is_production(self) -> bool:
        return self.app_env in ("production", "prod")

    def get_cors_origins(self) -> list[str]:
        raw = self.cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    def get_worker_symbols(self) -> list[str]:
        return [s.strip().upper() for s in self.worker_symbols.split(",") if s.strip()]

    def get_database_url(self) -> str:
        """SQLAlchemy URL; ``DATABASE_URL`` wins over discrete ``POSTGRES_*`` vars."""
        if self.database_url:
            url = self.database_url.strip()
        else:
            url = (
                f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
                f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
            )
        # Neon/Heroku often provide ``postgresql://`` without a driver suffix.
        if url.startswith("postgresql://") and "+psycopg" not in url:
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url

    def has_intraday_api(self) -> bool:
        return bool(self.market_data_api_key and self.market_data_api_key.strip())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
