"""Projects, applications, membership, and the lifecycle."""

from __future__ import annotations

from tests.conftest import make_client

PROJECT = {
    "title": "Build a thing",
    "description": "We need help",
    "capacity": 3,
    "skills": [{"name": "Python", "min_level": 3}],
}


def _client_for(username):
    c = make_client()
    c.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@x.com", "password": "password123"},
    )
    return c


def test_create_project_makes_owner_the_leader(client, register):
    register("lead")
    r = client.post("/api/projects", json=PROJECT)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "OPEN"
    assert body["member_count"] == 1
    assert body["members"][0]["role"] == "LEADER"
    assert body["members"][0]["username"] == "lead"


def test_apply_and_owner_sees_applicant(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]

    bob = _client_for("bob")
    r = bob.post(f"/api/projects/{project_id}/apply", json={"message": "pick me"})
    assert r.status_code == 201

    detail = client.get(f"/api/projects/{project_id}").json()
    assert len(detail["applicants"]) == 1
    assert detail["applicants"][0]["username"] == "bob"


def test_non_owner_cannot_see_applicants(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{project_id}/apply", json={"message": "hi"})

    carol = _client_for("carol")
    detail = carol.get(f"/api/projects/{project_id}").json()
    assert detail["applicants"] is None


def test_duplicate_application_conflicts(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{project_id}/apply", json={"message": "hi"})
    r = bob.post(f"/api/projects/{project_id}/apply", json={"message": "again"})
    assert r.status_code == 409


def test_owner_cannot_apply_to_own_project(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    r = client.post(f"/api/projects/{project_id}/apply", json={"message": "me"})
    assert r.status_code == 400


def test_accepting_application_creates_membership(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{project_id}/apply", json={"message": "hi"})

    detail = client.get(f"/api/projects/{project_id}").json()
    app_id = detail["applicants"][0]["application_id"]
    r = client.post(
        f"/api/projects/{project_id}/applications/{app_id}/decide",
        json={"status": "ACCEPTED"},
    )
    assert r.status_code == 200

    detail = client.get(f"/api/projects/{project_id}").json()
    assert detail["member_count"] == 2
    assert {m["username"] for m in detail["members"]} == {"lead", "bob"}
    assert detail["status"] == "FORMING"


def test_capacity_ceiling_blocks_accept(client, register):
    register("lead")
    small = dict(PROJECT, capacity=2)
    project_id = client.post("/api/projects", json=small).json()["id"]

    bob = _client_for("bob")
    carol = _client_for("carol")
    bob.post(f"/api/projects/{project_id}/apply", json={"message": "a"})
    carol.post(f"/api/projects/{project_id}/apply", json={"message": "b"})

    applicants = client.get(f"/api/projects/{project_id}").json()["applicants"]
    by_name = {a["username"]: a["application_id"] for a in applicants}

    first = client.post(
        f"/api/projects/{project_id}/applications/{by_name['bob']}/decide",
        json={"status": "ACCEPTED"},
    )
    assert first.status_code == 200

    second = client.post(
        f"/api/projects/{project_id}/applications/{by_name['carol']}/decide",
        json={"status": "ACCEPTED"},
    )
    assert second.status_code == 409

    detail = client.get(f"/api/projects/{project_id}").json()
    assert detail["member_count"] == 2
    assert detail["status"] == "ACTIVE"


def test_rejected_application_cannot_be_redecided(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{project_id}/apply", json={"message": "hi"})
    app_id = client.get(f"/api/projects/{project_id}").json()["applicants"][0][
        "application_id"
    ]

    assert (
        client.post(
            f"/api/projects/{project_id}/applications/{app_id}/decide",
            json={"status": "REJECTED"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/projects/{project_id}/applications/{app_id}/decide",
            json={"status": "ACCEPTED"},
        ).status_code
        == 400
    )


def test_non_owner_cannot_decide(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{project_id}/apply", json={"message": "hi"})
    app_id = client.get(f"/api/projects/{project_id}").json()["applicants"][0][
        "application_id"
    ]
    carol = _client_for("carol")
    r = carol.post(
        f"/api/projects/{project_id}/applications/{app_id}/decide",
        json={"status": "ACCEPTED"},
    )
    assert r.status_code == 403


def test_member_can_leave_and_slot_frees(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{project_id}/apply", json={"message": "hi"})
    app_id = client.get(f"/api/projects/{project_id}").json()["applicants"][0][
        "application_id"
    ]
    client.post(
        f"/api/projects/{project_id}/applications/{app_id}/decide",
        json={"status": "ACCEPTED"},
    )

    assert bob.delete(f"/api/projects/{project_id}/members/me").status_code == 204
    detail = client.get(f"/api/projects/{project_id}").json()
    assert detail["member_count"] == 1
    assert detail["status"] == "OPEN"


def test_leader_cannot_leave(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    assert client.delete(f"/api/projects/{project_id}/members/me").status_code == 400


def test_transfer_leadership(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{project_id}/apply", json={"message": "hi"})
    app_id = client.get(f"/api/projects/{project_id}").json()["applicants"][0][
        "application_id"
    ]
    client.post(
        f"/api/projects/{project_id}/applications/{app_id}/decide",
        json={"status": "ACCEPTED"},
    )

    r = client.post(f"/api/projects/{project_id}/members/bob/promote")
    assert r.status_code == 200
    assert r.json()["role"] == "LEADER"

    detail = client.get(f"/api/projects/{project_id}").json()
    roles = {m["username"]: m["role"] for m in detail["members"]}
    assert roles == {"lead": "MEMBER", "bob": "LEADER"}
    assert detail["owner_username"] == "bob"


def test_only_leader_can_transfer(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{project_id}/apply", json={"message": "hi"})
    app_id = client.get(f"/api/projects/{project_id}").json()["applicants"][0][
        "application_id"
    ]
    client.post(
        f"/api/projects/{project_id}/applications/{app_id}/decide",
        json={"status": "ACCEPTED"},
    )
    assert bob.post(f"/api/projects/{project_id}/members/lead/promote").status_code == 403


def test_close_project(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    r = client.post(f"/api/projects/{project_id}/close")
    assert r.status_code == 200
    assert r.json()["status"] == "CLOSED"


def test_cannot_apply_to_closed_project(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    client.post(f"/api/projects/{project_id}/close")
    bob = _client_for("bob")
    r = bob.post(f"/api/projects/{project_id}/apply", json={"message": "hi"})
    assert r.status_code == 400


def test_member_can_post_update_outsider_cannot(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    assert (
        client.post(f"/api/projects/{project_id}/updates", json={"body": "day 1"}).status_code
        == 201
    )
    outsider = _client_for("nobody")
    assert (
        outsider.post(
            f"/api/projects/{project_id}/updates", json={"body": "intrude"}
        ).status_code
        == 403
    )


def test_withdraw_application(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{project_id}/apply", json={"message": "hi"})
    assert bob.delete(f"/api/projects/{project_id}/apply").status_code == 204


def test_delete_project_owner_only(client, register):
    register("lead")
    project_id = client.post("/api/projects", json=PROJECT).json()["id"]
    other = _client_for("other")
    assert other.delete(f"/api/projects/{project_id}").status_code == 403
    assert client.delete(f"/api/projects/{project_id}").status_code == 204


def test_project_filter_by_skill(client, register):
    register("lead")
    client.post("/api/projects", json=PROJECT)
    client.post(
        "/api/projects",
        json={"title": "Other", "capacity": 2, "skills": [{"name": "Rust", "min_level": 1}]},
    )
    r = client.get("/api/projects", params={"skill": "Python"})
    titles = [p["title"] for p in r.json()]
    assert titles == ["Build a thing"]
