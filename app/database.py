"""Engine, session factory, and schema bootstrap.

Note: the schema is created from the ORM metadata for simplicity. Real
deployments should adopt Alembic migrations before the schema changes under
live data.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()

engine = create_engine(
    _settings.database_url,
    echo=_settings.sql_echo,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a session that always closes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create extensions and all tables. Idempotent."""
    with engine.begin() as conn:
        # citext gives us case-insensitive skill-name uniqueness at the DB level.
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))
        # pg_trgm powers fast fuzzy/prefix search on names and titles.
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    # Import models so they register on Base.metadata before create_all.
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Triggers for the invariants constraints cannot express (capacity ceiling,
    # accept-creates-membership). Imported here to avoid a circular import at
    # module load time.
    from .triggers import install_triggers

    install_triggers()
