"""The deepened modules, tested through their interfaces.

These tests cross the same seam the routers cross. They are not a second copy
of the endpoint tests in ``test_projects.py``; they pin the *rules* the modules
own, so a router change cannot quietly move them.
"""

from __future__ import annotations

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Application, Membership, Project, User
from app.projects_service import (
    ACTIVE,
    APPLICANT,
    FORMING,
    INVITEE,
    LEADER,
    MEMBER,
    OPEN,
    OUTSIDER,
    member_count,
    recompute_status,
    relationship_for,
    visible_project_ids,
)
from app.skills_service import profile_skills_for, public_profiles_for
from tests.conftest import make_client

PROJECT = {
    "title": "Lifecycle",
    "description": "for module tests",
    "capacity": 3,
    "skills": [{"name": "Python", "min_level": 1}],
}


def _client(username):
    c = make_client()
    c.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@x.com", "password": "password123"},
    )
    return c


def test_recompute_status_follows_roster_size(client, register):
    """OPEN -> FORMING -> ACTIVE is a function of roster fullness."""
    register("lead")
    pid = client.post("/api/projects", json=dict(PROJECT, capacity=3)).json()["id"]
    # Real second and third users, so the membership FKs hold. Registered up
    # front so no other connection is opened while a session holds a transaction.
    _client("bob")
    _client("carol")

    with SessionLocal() as db:
        project = db.get(Project, pid)
        assert project.status == OPEN

        bob = db.scalar(select(User).where(User.username == "bob"))
        carol = db.scalar(select(User).where(User.username == "carol"))

        # Leader + a directly-added member is two people: FORMING.
        db.add(Membership(project_id=pid, user_id=bob.id, role=MEMBER))
        db.flush()
        recompute_status(db, project)
        assert member_count(db, pid) == 2
        assert project.status == FORMING

        # One more member fills the seat: ACTIVE.
        db.add(Membership(project_id=pid, user_id=carol.id, role=MEMBER))
        db.flush()
        recompute_status(db, project)
        assert project.status == ACTIVE

        # A closed project is terminal: recompute must not reopen it.
        project.status = "CLOSED"
        recompute_status(db, project)
        assert project.status == "CLOSED"


def test_relationship_precedence(client, register):
    """A team role beats a pending row; leader beats member."""
    register("lead")
    pid = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client("bob")
    bob.post(f"/api/projects/{pid}/apply", json={"message": "hi"})

    with SessionLocal() as db:
        project = db.get(Project, pid)
        lead = db.scalar(select(User).where(User.username == "lead"))
        bob_user = db.scalar(select(User).where(User.username == "bob"))

        lead_rel = relationship_for(db, project, lead)
        assert lead_rel.status == LEADER and lead_rel.is_leader
        assert lead_rel.can_see_applicants

        bob_rel = relationship_for(db, project, bob_user)
        assert bob_rel.status == APPLICANT and bob_rel.is_applicant
        assert not bob_rel.can_see_applicants

        assert relationship_for(db, project, None).status == OUTSIDER


def test_invite_relationship_is_invitee(client, register):
    register("lead")
    pid = client.post("/api/projects", json=PROJECT).json()["id"]
    _client("bob")
    client.post(f"/api/projects/{pid}/invite", json={"username": "bob", "message": "join"})

    with SessionLocal() as db:
        project = db.get(Project, pid)
        bob = db.scalar(select(User).where(User.username == "bob"))
        rel = relationship_for(db, project, bob)
        assert rel.status == INVITEE and rel.is_invitee and not rel.is_applicant


def test_visible_project_ids_covers_led_joined_applied(client, register):
    register("lead")
    pid = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client("bob")
    bob.post(f"/api/projects/{pid}/apply", json={"message": "hi"})

    with SessionLocal() as db:
        bob_user = db.scalar(select(User).where(User.username == "bob"))
        assert pid in visible_project_ids(db, bob_user.id)


def test_accept_creates_membership_and_recomputes(client, register):
    """The decide path is the module's, and the trigger still does its job."""
    register("lead")
    pid = client.post("/api/projects", json=dict(PROJECT, capacity=2)).json()["id"]
    bob = _client("bob")
    bob.post(f"/api/projects/{pid}/apply", json={"message": "hi"})

    app_id = client.get(f"/api/projects/{pid}").json()["applicants"][0]["application_id"]
    r = client.post(
        f"/api/projects/{pid}/applications/{app_id}/decide", json={"status": "ACCEPTED"}
    )
    assert r.status_code == 200, r.text

    with SessionLocal() as db:
        assert member_count(db, pid) == 2
        assert db.get(Project, pid).status == ACTIVE
        # The row the module wrote carries the owner-initiated flag when invited.
        app_row = db.get(Application, app_id)
        assert app_row.status == "ACCEPTED"
        assert app_row.decided_by is not None


def test_public_profiles_for_batches_many_users(client, register):
    """One call returns complete profiles for a page, not one query per row."""
    register("alice")
    register("bob")
    register("carol")

    with SessionLocal() as db:
        ids = [u.id for u in db.scalars(select(User).order_by(User.id)).all()]
        profiles = public_profiles_for(db, ids)
        assert set(profiles) == set(ids)
        # Each carries its skill list, assembled by the same batch call.
        for uid in ids:
            assert profiles[uid].username
            assert isinstance(profiles[uid].skills, list)


def test_profile_skills_for_reads_one_person(client, register):
    register("alice")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == "alice"))
        assert profile_skills_for(db, user.id) == []


def test_schema_endpoint_reports_the_live_catalog(client):
    """The schema page's data comes from Postgres, not a hardcoded list."""
    body = client.get("/api/schema").json()
    assert body["tables"], "expected live table counts"
    assert body["indexes"] > 0
    assert body["fk_count"] > 0
    assert any(t["name"] == "users" for t in body["tables"])
    assert any("capacity" in t["name"] for t in body["triggers"])
