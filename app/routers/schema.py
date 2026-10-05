"""The database design, exposed as data.

This exists so the schema page can show the real thing: live row counts, the
actual constraint definitions from ``pg_constraint``, and the installed
triggers. Nothing is hardcoded, so it cannot drift from the database.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import ConstraintOut, SchemaOut, TableStatsOut, TriggerOut

router = APIRouter(prefix="/api/schema", tags=["schema"])

# Fixed list. Identifiers are never taken from user input.
TABLES = [
    "users",
    "profiles",
    "skill_categories",
    "skills",
    "user_skills",
    "endorsements",
    "projects",
    "project_skills",
    "applications",
    "memberships",
    "project_updates",
    "tasks",
    "project_comments",
    "activity",
]

KIND_LABEL = {"p": "PRIMARY KEY", "f": "FOREIGN KEY", "c": "CHECK", "u": "UNIQUE"}


@router.get("", response_model=SchemaOut)
def schema_overview(db: Session = Depends(get_db)) -> SchemaOut:
    tables: list[TableStatsOut] = []
    for name in TABLES:
        count = db.execute(text(f"SELECT count(*) FROM {name}")).scalar() or 0
        tables.append(TableStatsOut(name=name, rows=int(count)))

    constraint_rows = db.execute(
        text(
            """
            SELECT c.relname AS table_name,
                   con.conname AS name,
                   con.contype AS kind,
                   pg_get_constraintdef(con.oid) AS definition
            FROM pg_constraint con
            JOIN pg_class c ON c.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
            ORDER BY c.relname, con.contype, con.conname
            """
        )
    ).all()

    constraints = [
        ConstraintOut(
            table=row.table_name,
            name=row.name,
            kind=KIND_LABEL.get(row.kind, row.kind),
            definition=row.definition,
        )
        for row in constraint_rows
    ]

    trigger_rows = db.execute(
        text(
            """
            SELECT t.tgname AS name,
                   c.relname AS table_name,
                   CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
                   trim(both ' OR ' from concat_ws(' OR ',
                       CASE WHEN t.tgtype & 4 = 4 THEN 'INSERT' END,
                       CASE WHEN t.tgtype & 8 = 8 THEN 'DELETE' END,
                       CASE WHEN t.tgtype & 16 = 16 THEN 'UPDATE' END)) AS event
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE NOT t.tgisinternal AND n.nspname = 'public'
            ORDER BY c.relname, t.tgname
            """
        )
    ).all()

    triggers = [
        TriggerOut(name=row.name, table=row.table_name, timing=row.timing, event=row.event)
        for row in trigger_rows
    ]

    indexes = (
        db.execute(text("SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'")).scalar()
        or 0
    )
    fk_count = sum(1 for c in constraints if c.kind == "FOREIGN KEY")

    return SchemaOut(
        tables=tables,
        constraints=constraints,
        triggers=triggers,
        indexes=int(indexes),
        fk_count=fk_count,
    )
