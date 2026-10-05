"""Skills, the canonical vocabulary, and endorsements."""

from __future__ import annotations

from tests.conftest import make_client

SKILLS = {"skills": [{"name": "Python", "level": 4, "years": 3}]}


def test_set_and_read_skills(client, register):
    register()
    r = client.put("/api/profile/skills", json=SKILLS)
    assert r.status_code == 200
    assert r.json()[0]["name"] == "Python"
    assert r.json()[0]["level"] == 4


def test_case_insensitive_skill_dedupe(client, register):
    register("alice")
    client.put("/api/profile/skills", json=SKILLS)
    a = make_client()
    a.post(
        "/api/auth/register",
        json={"username": "bob", "email": "b@x.com", "password": "password123"},
    )
    a.put("/api/profile/skills", json={"skills": [{"name": "python", "level": 2}]})

    catalog = client.get("/api/skills").json()
    pythons = [s for s in catalog if s["name"].lower() == "python"]
    assert len(pythons) == 1, "Python typed twice must be one skill"
    assert pythons[0]["people"] == 2


def test_level_bounds_enforced(client, register):
    register()
    r = client.put("/api/profile/skills", json={"skills": [{"name": "Go", "level": 9}]})
    assert r.status_code == 422


def test_skill_set_replacement_is_atomic(client, register):
    register()
    client.put("/api/profile/skills", json={"skills": [{"name": "Rust", "level": 3}]})
    client.put("/api/profile/skills", json={"skills": [{"name": "Go", "level": 3}]})
    profile = client.get("/api/profile/alice").json()
    names = [s["name"] for s in profile["skills"]]
    assert names == ["Go"]


def test_endorsement_requires_target_to_have_skill(client, register):
    register("alice")
    client.put("/api/profile/skills", json={"skills": [{"name": "Python", "level": 3}]})

    bob = make_client()
    bob.post(
        "/api/auth/register",
        json={"username": "bob", "email": "b@x.com", "password": "password123"},
    )
    bob.put("/api/profile/skills", json={"skills": [{"name": "Go", "level": 3}]})

    # Endorsing a skill Alice does not list must fail.
    alice_skills = client.get("/api/profile/alice").json()["skills"]
    python_id = alice_skills[0]["skill_id"]
    go_id = bob.get("/api/profile/bob").json()["skills"][0]["skill_id"]

    assert bob.post(f"/api/profile/alice/endorse/{go_id}").status_code == 404
    assert bob.post(f"/api/profile/alice/endorse/{python_id}").status_code == 201

    profile = client.get("/api/profile/alice").json()
    assert profile["skills"][0]["endorsements"] == 1


def test_cannot_endorse_self(client, register):
    register()
    client.put("/api/profile/skills", json=SKILLS)
    skill_id = client.get("/api/profile/alice").json()["skills"][0]["skill_id"]
    assert client.post(f"/api/profile/alice/endorse/{skill_id}").status_code == 400


def test_endorsement_is_idempotent(client, register):
    register("alice")
    client.put("/api/profile/skills", json=SKILLS)

    bob = make_client()
    bob.post(
        "/api/auth/register",
        json={"username": "bob", "email": "b@x.com", "password": "password123"},
    )
    skill_id = client.get("/api/profile/alice").json()["skills"][0]["skill_id"]
    bob.post(f"/api/profile/alice/endorse/{skill_id}")
    bob.post(f"/api/profile/alice/endorse/{skill_id}")
    profile = client.get("/api/profile/alice").json()
    assert profile["skills"][0]["endorsements"] == 1


def test_public_profile_hides_email(client, register):
    register()
    body = client.get("/api/profile/alice").json()
    assert "email" not in body
