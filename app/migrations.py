"""The ordered schema bootstrap.

Schema knowledge used to be spread across three places: the ORM metadata in
``models.py``, two ad-hoc ALTER/DO blocks written because ``create_all`` never
alters an existing table, and the trigger strings in ``triggers.py``. Order was
implicit in the body of ``init_db``.

This module owns that order. ``migrate(engine)`` applies the steps in sequence;
each step is a named function, so the sequence reads top to bottom and a new
step is one entry in ``MIGRATIONS``.

This is a *bootstrap*, not a versioned migration tool. It is idempotent and
meant to be safe to run on every boot. When the schema changes under live data,
replace the steps with a real migration tool and keep ``migrate`` as the
interface the app calls.
"""

from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import Engine, text


def _extensions(engine: Engine) -> None:
    """citext (case-insensitive skill names) and pg_trgm (fuzzy search)."""
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))


def _tables(engine: Engine) -> None:
    """Create every table the ORM knows about. Creates missing tables only."""
    # Import models so they register on Base.metadata before create_all.
    from . import models  # noqa: F401
    from .database import Base

    Base.metadata.create_all(bind=engine)


def _initiated_by(engine: Engine) -> None:
    """Bring pre-``initiated_by`` databases forward.

    ``create_all`` never alters an existing table, so a column added after the
    first release needs an explicit, idempotent step.
    """
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE applications "
                "ADD COLUMN IF NOT EXISTS initiated_by varchar(9) "
                "NOT NULL DEFAULT 'APPLICANT'"
            )
        )
        # ADD CONSTRAINT has no IF NOT EXISTS in Postgres; check the catalog.
        conn.execute(
            text(
                "DO $$ BEGIN "
                "IF NOT EXISTS (SELECT 1 FROM pg_constraint "
                "WHERE conname = 'ck_application_initiated_by') THEN "
                "ALTER TABLE applications ADD CONSTRAINT ck_application_initiated_by "
                "CHECK (initiated_by IN ('APPLICANT','OWNER')); "
                "END IF; END $$;"
            )
        )


def _triggers(engine: Engine) -> None:
    """Install the PL/pgSQL invariants and activity-feed writers."""
    from .triggers import install_triggers

    install_triggers()


# The ordered bootstrap. Position is the order; add a step at the end.
MIGRATIONS: list[tuple[str, Callable[[Engine], None]]] = [
    ("0001_extensions", _extensions),
    ("0002_tables", _tables),
    ("0003_initiated_by", _initiated_by),
    ("0004_triggers", _triggers),
]


def migrate(engine: Engine) -> None:
    """Apply every bootstrap step in order. Idempotent."""
    for _name, step in MIGRATIONS:
        step(engine)


__all__ = ["MIGRATIONS", "migrate"]
