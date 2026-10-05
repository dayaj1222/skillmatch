"""Concurrency: the capacity invariant must hold under racing acceptances.

This is the test that justifies the trigger's row lock. Two threads accept two
different applications for a project with one remaining slot at the same
moment. Exactly one must succeed; the roster must never exceed capacity.
"""

from __future__ import annotations

import threading

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import Application, Membership, Project
from tests.conftest import make_client

PROJECT = {
    "title": "Race",
    "description": "two acceptances, one slot",
    "capacity": 3,
    "skills": [{"name": "Python", "min_level": 1}],
}


def _register(username):
    c = make_client()
    c.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@x.com", "password": "password123"},
    )
    return c


def test_capacity_holds_under_concurrent_accepts(client, register):
    # Owner creates a 2-person project: leader + exactly one free slot.
    register("lead")
    project_id = client.post("/api/projects", json=dict(PROJECT, capacity=2)).json()["id"]

    bob = _register("bob")
    carol = _register("carol")
    bob.post(f"/api/projects/{project_id}/apply", json={"message": "a"})
    carol.post(f"/api/projects/{project_id}/apply", json={"message": "b"})

    # Collect the two application ids.
    with SessionLocal() as db:
        app_ids = [
            a.id
            for a in db.scalars(
                select(Application).where(Application.project_id == project_id)
            ).all()
        ]
    assert len(app_ids) == 2

    results: list[str] = []
    barrier = threading.Barrier(2)

    def accept(app_id: int) -> None:
        with SessionLocal() as db:
            barrier.wait()  # start both threads at the same instant
            application = db.get(Application, app_id)
            application.status = "ACCEPTED"
            try:
                db.flush()
                db.commit()
                results.append("ok")
            except Exception:
                db.rollback()
                results.append("rejected")

    threads = [threading.Thread(target=accept, args=(aid,)) for aid in app_ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Exactly one thread may win the last slot.
    assert results.count("ok") == 1, f"expected one winner, got {results}"
    assert results.count("rejected") == 1

    with SessionLocal() as db:
        count = db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(Membership.project_id == project_id)
        )
        capacity = db.get(Project, project_id).capacity
    assert count <= capacity, f"roster {count} exceeded capacity {capacity}"


def test_two_leaders_impossible_under_race(client, register):
    """The partial unique index must hold even when two threads promote at once."""
    register("lead")
    project_id = client.post("/api/projects", json=dict(PROJECT, capacity=4)).json()["id"]

    for name in ("bob", "carol"):
        c = _register(name)
        c.post(f"/api/projects/{project_id}/apply", json={"message": "x"})

    with SessionLocal() as db:
        app_ids = [
            a.id
            for a in db.scalars(
                select(Application).where(Application.project_id == project_id)
            ).all()
        ]
    for aid in app_ids:
        client.post(
            f"/api/projects/{project_id}/applications/{aid}/decide",
            json={"status": "ACCEPTED"},
        )

    with SessionLocal() as db:
        user_ids = [
            m.user_id
            for m in db.scalars(
                select(Membership).where(Membership.project_id == project_id)
            ).all()
        ]

    barrier = threading.Barrier(len(user_ids))
    outcomes: list[str] = []

    def promote(uid: int) -> None:
        with SessionLocal() as db:
            mem = db.get(Membership, (project_id, uid))
            mem.role = "LEADER"
            barrier.wait()
            try:
                db.flush()
                db.commit()
                outcomes.append("ok")
            except Exception:
                db.rollback()
                outcomes.append("rejected")

    threads = [threading.Thread(target=promote, args=(uid,)) for uid in user_ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert outcomes.count("ok") == 1, f"more than one leader won: {outcomes}"

    with SessionLocal() as db:
        leaders = db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(Membership.project_id == project_id, Membership.role == "LEADER")
        )
    assert leaders == 1
