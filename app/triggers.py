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


ACTIVITY_APPLICATION_FN = """
CREATE OR REPLACE FUNCTION log_application_event() RETURNS trigger AS $$
DECLARE
    owner integer;
BEGIN
    SELECT owner_id INTO owner FROM projects WHERE id = NEW.project_id;

    IF TG_OP = 'INSERT' THEN
        -- Who opened the row decides which event this is. An invite is stored
        -- as an application so there is one state machine, but it must not be
        -- announced to the invitee as "they applied".
        IF NEW.initiated_by = 'OWNER' THEN
            INSERT INTO activity (kind, actor_id, subject_user_id, project_id)
            VALUES ('INVITED', owner, NEW.applicant_id, NEW.project_id);
        ELSE
            INSERT INTO activity (kind, actor_id, subject_user_id, project_id)
            VALUES ('APPLIED', NEW.applicant_id, owner, NEW.project_id);
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE: only log a real transition, not a re-save of the same status.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'ACCEPTED' THEN
            INSERT INTO activity (kind, actor_id, subject_user_id, project_id)
            VALUES ('ACCEPTED', owner, NEW.applicant_id, NEW.project_id);
        ELSIF NEW.status = 'REJECTED' THEN
            INSERT INTO activity (kind, actor_id, subject_user_id, project_id)
            VALUES ('REJECTED', owner, NEW.applicant_id, NEW.project_id);
        ELSIF NEW.status = 'WITHDRAWN' THEN
            INSERT INTO activity (kind, actor_id, subject_user_id, project_id)
            VALUES ('WITHDRAWN', NEW.applicant_id, owner, NEW.project_id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

ACTIVITY_APPLICATION_TRIGGER = """
DROP TRIGGER IF EXISTS trg_activity_application ON applications;
CREATE TRIGGER trg_activity_application
    AFTER INSERT OR UPDATE OF status ON applications
    FOR EACH ROW EXECUTE FUNCTION log_application_event();
"""

ACTIVITY_MEMBERSHIP_FN = """
CREATE OR REPLACE FUNCTION log_membership_event() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.role <> 'LEADER' THEN
            INSERT INTO activity (kind, actor_id, project_id)
            VALUES ('LEFT', OLD.user_id, OLD.project_id);
        END IF;
        RETURN OLD;
    END IF;
    -- Inserts are logged by the accept path; only log a non-leader joining
    -- directly (e.g. an accepted invite) to avoid duplicate feed entries.
    IF NEW.role <> 'LEADER' AND NOT EXISTS (
        SELECT 1 FROM activity
        WHERE kind = 'ACCEPTED' AND subject_user_id = NEW.user_id
          AND project_id = NEW.project_id
    ) THEN
        INSERT INTO activity (kind, actor_id, project_id)
        VALUES ('JOINED', NEW.user_id, NEW.project_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

ACTIVITY_MEMBERSHIP_TRIGGER = """
DROP TRIGGER IF EXISTS trg_activity_membership ON memberships;
CREATE TRIGGER trg_activity_membership
    AFTER INSERT OR DELETE ON memberships
    FOR EACH ROW EXECUTE FUNCTION log_membership_event();
"""

ACTIVITY_PROJECT_TRIGGER = """
DROP TRIGGER IF EXISTS trg_activity_project ON projects;
CREATE TRIGGER trg_activity_project
    AFTER INSERT OR UPDATE OF status ON projects
    FOR EACH ROW EXECUTE FUNCTION log_project_event();
"""

ACTIVITY_PROJECT_FN = """
CREATE OR REPLACE FUNCTION log_project_event() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO activity (kind, actor_id, project_id)
        VALUES ('PROJECT_CREATED', NEW.owner_id, NEW.id);
    ELSIF NEW.status = 'CLOSED' AND OLD.status <> 'CLOSED' THEN
        INSERT INTO activity (kind, actor_id, project_id)
        VALUES ('CLOSED', NEW.owner_id, NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

ACTIVITY_ENDORSEMENT_FN = """
CREATE OR REPLACE FUNCTION log_endorsement_event() RETURNS trigger AS $$
DECLARE
    skill_name text;
BEGIN
    SELECT name INTO skill_name FROM skills WHERE id = NEW.skill_id;
    INSERT INTO activity (kind, actor_id, subject_user_id, detail)
    VALUES ('ENDORSED', NEW.endorser_id, NEW.user_id, skill_name);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

ACTIVITY_ENDORSEMENT_TRIGGER = """
DROP TRIGGER IF EXISTS trg_activity_endorsement ON endorsements;
CREATE TRIGGER trg_activity_endorsement
    AFTER INSERT ON endorsements
    FOR EACH ROW EXECUTE FUNCTION log_endorsement_event();
"""

ACTIVITY_TASK_TRIGGER = """
DROP TRIGGER IF EXISTS trg_activity_task ON tasks;
CREATE TRIGGER trg_activity_task
    AFTER UPDATE OF status ON tasks
    FOR EACH ROW EXECUTE FUNCTION log_task_event();
"""

ACTIVITY_TASK_FN = """
CREATE OR REPLACE FUNCTION log_task_event() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'DONE' AND OLD.status <> 'DONE' THEN
        INSERT INTO activity (kind, actor_id, project_id, detail)
        VALUES ('TASK_DONE', COALESCE(NEW.assignee_id, NEW.created_by), NEW.project_id, NEW.title);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

ACTIVITY_COMMENT_TRIGGER = """
DROP TRIGGER IF EXISTS trg_activity_comment ON project_comments;
CREATE TRIGGER trg_activity_comment
    AFTER INSERT ON project_comments
    FOR EACH ROW EXECUTE FUNCTION log_comment_event();
"""

ACTIVITY_COMMENT_FN = """
CREATE OR REPLACE FUNCTION log_comment_event() RETURNS trigger AS $$
BEGIN
    INSERT INTO activity (kind, actor_id, project_id, detail)
    VALUES ('COMMENTED', NEW.author_id, NEW.project_id, left(NEW.body, 80));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

ASSIGNEE_FN = """
CREATE OR REPLACE FUNCTION check_task_assignee() RETURNS trigger AS $$
BEGIN
    -- A task may only be assigned to someone on the team, or to nobody.
    IF NEW.assignee_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM memberships
        WHERE project_id = NEW.project_id AND user_id = NEW.assignee_id
    ) THEN
        RAISE EXCEPTION 'user % is not on project %',
            NEW.assignee_id, NEW.project_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

ASSIGNEE_TRIGGER = """
DROP TRIGGER IF EXISTS trg_task_assignee ON tasks;
CREATE TRIGGER trg_task_assignee
    BEFORE INSERT OR UPDATE OF assignee_id, project_id ON tasks
    FOR EACH ROW EXECUTE FUNCTION check_task_assignee();
"""

FLAT_THREAD_FN = """
CREATE OR REPLACE FUNCTION check_flat_thread() RETURNS trigger AS $$
DECLARE
    grandparent integer;
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        SELECT parent_id INTO grandparent FROM project_comments WHERE id = NEW.parent_id;
        IF grandparent IS NOT NULL THEN
            RAISE EXCEPTION 'replies cannot be nested more than one level'
                USING ERRCODE = 'check_violation';
        END IF;
        -- A reply must be on the same project as its parent.
        IF NOT EXISTS (
            SELECT 1 FROM project_comments
            WHERE id = NEW.parent_id AND project_id = NEW.project_id
        ) THEN
            RAISE EXCEPTION 'parent comment belongs to a different project'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

FLAT_THREAD_TRIGGER = """
DROP TRIGGER IF EXISTS trg_comment_flat_thread ON project_comments;
CREATE TRIGGER trg_comment_flat_thread
    BEFORE INSERT ON project_comments
    FOR EACH ROW EXECUTE FUNCTION check_flat_thread();
"""


MESSAGE_CONNECTION_FN = '''
CREATE OR REPLACE FUNCTION check_message_connection() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM connections
        WHERE status = 'ACCEPTED'
          AND ((requester_id = NEW.sender_id AND recipient_id = NEW.recipient_id)
               OR (requester_id = NEW.recipient_id AND recipient_id = NEW.sender_id))
    ) THEN
        RAISE EXCEPTION 'sender % and recipient % are not connected',
            NEW.sender_id, NEW.recipient_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
'''

MESSAGE_CONNECTION_TRIGGER = """
DROP TRIGGER IF EXISTS trg_message_connection ON messages;
CREATE TRIGGER trg_message_connection
    BEFORE INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION check_message_connection();
"""


def install_triggers() -> None:
    """Create (or replace) all trigger functions and triggers."""
    with engine.begin() as conn:
        # Existing invariants.
        conn.execute(text(CAPACITY_FN))
        conn.execute(text(CAPACITY_TRIGGER))
        conn.execute(text(ACCEPT_FN))
        conn.execute(text(ACCEPT_TRIGGER))
        # Message gating: only connected users may message.
        conn.execute(text(MESSAGE_CONNECTION_FN))
        conn.execute(text(MESSAGE_CONNECTION_TRIGGER))
        # Activity feed writers.
        conn.execute(text(ACTIVITY_APPLICATION_FN))
        conn.execute(text(ACTIVITY_APPLICATION_TRIGGER))
        conn.execute(text(ACTIVITY_MEMBERSHIP_FN))
        conn.execute(text(ACTIVITY_MEMBERSHIP_TRIGGER))
        conn.execute(text(ACTIVITY_PROJECT_FN))
        conn.execute(text(ACTIVITY_PROJECT_TRIGGER))
        conn.execute(text(ACTIVITY_ENDORSEMENT_FN))
        conn.execute(text(ACTIVITY_ENDORSEMENT_TRIGGER))
        conn.execute(text(ACTIVITY_TASK_FN))
        conn.execute(text(ACTIVITY_TASK_TRIGGER))
        conn.execute(text(ACTIVITY_COMMENT_FN))
        conn.execute(text(ACTIVITY_COMMENT_TRIGGER))
        # New constraints.
        conn.execute(text(ASSIGNEE_FN))
        conn.execute(text(ASSIGNEE_TRIGGER))
        conn.execute(text(FLAT_THREAD_FN))
        conn.execute(text(FLAT_THREAD_TRIGGER))
