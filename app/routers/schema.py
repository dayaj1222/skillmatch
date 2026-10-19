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
from ..schemas import (
    ColumnOut,
    ConstraintOut,
    ForeignKeyEdge,
    SchemaGraphOut,
    SchemaOut,
    TableNodeOut,
    TableStatsOut,
    TriggerOut,
)

router = APIRouter(prefix="/api/schema", tags=["schema"])

# Tables come from the catalog, never from a list in this file. A table added
# by a migration appears here on the next request; a dropped one disappears.
TABLES_SQL = text(
    """
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
    """
)

KIND_LABEL = {
    "p": "PRIMARY KEY",
    "f": "FOREIGN KEY",
    "c": "CHECK",
    "u": "UNIQUE",
    "n": "NOT NULL",
    "x": "EXCLUDE",
}


@router.get("", response_model=SchemaOut)
def schema_overview(db: Session = Depends(get_db)) -> SchemaOut:
    # Names come from the catalog and are quoted before interpolation, so this
    # stays a fixed-shape query. Nothing here trusts user input.
    table_names = [r.name for r in db.execute(TABLES_SQL).all()]
    tables: list[TableStatsOut] = []
    for name in table_names:
        quoted = '"' + name.replace('"', '""') + '"'
        count = db.execute(text(f"SELECT count(*) FROM {quoted}")).scalar() or 0
        tables.append(TableStatsOut(name=name, rows=int(count)))

    # Columns are resolved once here and attached to every table, then reused by
    # the graph below. Two callers, one catalog read.
    edges, fk_sources = _fk_edges(db)
    columns_by_table = _columns(db, [t.name for t in tables], fk_sources)
    for t in tables:
        t.columns = columns_by_table.get(t.name, [])

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

    return SchemaOut(
        tables=tables,
        constraints=constraints,
        triggers=triggers,
        indexes=int(indexes),
        fk_count=len(edges),
        graph=SchemaGraphOut(
            nodes=[TableNodeOut(name=t.name, rows=t.rows, columns=t.columns) for t in tables],
            edges=edges,
        ),
    )


def _fk_edges(db: Session) -> tuple[list[ForeignKeyEdge], set[tuple[str, str]]]:
    """Every foreign key, plus the set of (table, column) pairs that are one."""
    # Every FK: which table.column points at which table.column.
    fk_rows = db.execute(
        text(
            """
            SELECT con.conname AS name,
                   src.relname AS source_table,
                   src_att.attname AS source_column,
                   tgt.relname AS target_table,
                   tgt_att.attname AS target_column
            FROM pg_constraint con
            JOIN pg_class src ON src.oid = con.conrelid
            JOIN pg_class tgt ON tgt.oid = con.confrelid
            JOIN pg_namespace n ON n.oid = src.relnamespace
            JOIN unnest(con.conkey) WITH ORDINALITY AS sk(attnum, ord) ON TRUE
            JOIN unnest(con.confkey) WITH ORDINALITY AS tk(attnum, ord)
                 ON tk.ord = sk.ord
            JOIN pg_attribute src_att
                 ON src_att.attrelid = con.conrelid AND src_att.attnum = sk.attnum
            JOIN pg_attribute tgt_att
                 ON tgt_att.attrelid = con.confrelid AND tgt_att.attnum = tk.attnum
            WHERE con.contype = 'f' AND n.nspname = 'public'
            ORDER BY src.relname, con.conname, sk.ord
            """
        )
    ).all()

    fk_sources: set[tuple[str, str]] = set()
    edges: list[ForeignKeyEdge] = []
    for r in fk_rows:
        fk_sources.add((r.source_table, r.source_column))
        edges.append(
            ForeignKeyEdge(
                name=r.name,
                source_table=r.source_table,
                source_column=r.source_column,
                target_table=r.target_table,
                target_column=r.target_column,
            )
        )
    return edges, fk_sources


def _columns(
    db: Session, table_names: list[str], fk_sources: set[tuple[str, str]]
) -> dict[str, list[ColumnOut]]:
    """Columns in ordinal order, with primary- and foreign-key flags."""
    # Primary-key columns, so the graph can mark them.
    pk_rows = db.execute(
        text(
            """
            SELECT c.relname AS table_name, a.attname AS column_name
            FROM pg_constraint con
            JOIN pg_class c ON c.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN unnest(con.conkey) AS k(attnum) ON TRUE
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
            WHERE con.contype = 'p' AND n.nspname = 'public'
            """
        )
    ).all()
    pk_cols = {(r.table_name, r.column_name) for r in pk_rows}

    # Columns, in ordinal order, for every table.
    col_rows = db.execute(
        text(
            """
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
            """
        )
    ).all()

    columns_by_table: dict[str, list[ColumnOut]] = {name: [] for name in table_names}
    for r in col_rows:
        if r.table_name not in columns_by_table:
            continue
        columns_by_table[r.table_name].append(
            ColumnOut(
                name=r.column_name,
                type=r.data_type,
                nullable=r.is_nullable == "YES",
                is_primary_key=(r.table_name, r.column_name) in pk_cols,
                is_foreign_key=(r.table_name, r.column_name) in fk_sources,
            )
        )
    return columns_by_table

