"""Engine, session factory, and schema bootstrap.

Note: the schema is created from the ORM metadata for simplicity. Real
deployments should adopt Alembic migrations before the schema changes under
live data.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
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
    """Bring the database up to date. Idempotent.

    The ordered steps live in ``migrations.py``; this is the one interface the
    app calls. Kept as a wrapper so existing callers do not change.
    """
    from .migrations import migrate

    migrate(engine)
