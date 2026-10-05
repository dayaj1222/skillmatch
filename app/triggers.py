"""Triggers for the invariants CHECK constraints cannot express.

Two rules need row-level logic:

1. **Capacity ceiling.** A team may never hold more memberships than the
   project's ``capacity``. A CHECK cannot reference another table, so this is
   a BEFORE INSERT trigger. It takes a row lock on the project (``SELECT ...
   FOR UPDATE``) so two concurrent accepts cannot both slip past the check.
2. **Accept means membership.** Marking an application ACCEPTED must create
   the membership row in the same statement; accepting without joining is an
   inconsistent state. A trigger keeps the two tables in agreement no matter
   which code path flips the status.

Both are written in PL/pgSQL and installed idempotently (DROP IF EXISTS then
CREATE) so ``init_db`` can run repeatedly.
"""

from __future__ import annotations

from sqlalchemy import text

from .database import engine

CAPACITY_FN = """
CREATE OR REPLACE FUNCTION enforce_capacity() RETURNS trigger AS $$
DECLARE
    cap integer;
    current_count integer;
BEGIN
    -- Lock the project row so concurrent inserts serialize here.
    SELECT capacity INTO cap FROM projects WHERE id = NEW.project_id FOR UPDATE;
    IF cap IS NULL THEN
        RAISE EXCEPTION 'project % does not exist', NEW.project_id;
    END IF;

    SELECT count(*) INTO current_count FROM memberships WHERE project_id = NEW.project_id;

    IF current_count >= cap THEN
        RAISE EXCEPTION 'project % is at capacity (% of %)',
            NEW.project_id, current_count, cap
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

CAPACITY_TRIGGER = """
DROP TRIGGER IF EXISTS trg_membership_capacity ON memberships;
CREATE TRIGGER trg_membership_capacity
    BEFORE INSERT ON memberships
    FOR EACH ROW EXECUTE FUNCTION enforce_capacity();
"""

ACCEPT_FN = """
CREATE OR REPLACE FUNCTION accept_creates_membership() RETURNS trigger AS $$
BEGIN
    -- When an application transitions into ACCEPTED, ensure the applicant is
    -- on the roster as a MEMBER. ON CONFLICT keeps a re-run harmless.
    IF NEW.status = 'ACCEPTED' AND (OLD.status IS DISTINCT FROM 'ACCEPTED') THEN
        INSERT INTO memberships (project_id, user_id, role)
        VALUES (NEW.project_id, NEW.applicant_id, 'MEMBER')
        ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

ACCEPT_TRIGGER = """
DROP TRIGGER IF EXISTS trg_application_accept ON applications;
CREATE TRIGGER trg_application_accept
    AFTER UPDATE OF status ON applications
    FOR EACH ROW EXECUTE FUNCTION accept_creates_membership();
"""


def install_triggers() -> None:
    """Create (or replace) all trigger functions and triggers."""
    with engine.begin() as conn:
        conn.execute(text(CAPACITY_FN))
        conn.execute(text(CAPACITY_TRIGGER))
        conn.execute(text(ACCEPT_FN))
        conn.execute(text(ACCEPT_TRIGGER))
