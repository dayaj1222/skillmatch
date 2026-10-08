"""Tasks / project board: membership gate, moves, and the assignee trigger."""

from __future__ import annotations

from tests.conftest import make_client

PROJECT = {
    "title": "Board project",
    "description": "has a board",
    "capacity": 3,
    "skills": [{"name": "Python", "min_level": 1}],
}


def _client_for(username):
    c = make_client()
    r = c.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@x.com", "password": "password123"},
    )
    assert r.status_code == 201, r.text
    return c


def _make_project(client):
    return client.post("/api/projects", json=PROJECT).json()["id"]


def test_outsider_cannot_read_or_write_board(client, register):
    register("lead")
    pid = _make_project(client)
    outsider = _client_for("nosy")

    assert outsider.get(f"/api/projects/{pid}/tasks").status_code == 403
    assert (
        outsider.post(f"/api/projects/{pid}/tasks", json={"title": "sneak"}).status_code == 403
    )


def test_create_task_lands_in_todo(client, register):
    register("lead")
    pid = _make_project(client)
    r = client.post(f"/api/projects/{pid}/tasks", json={"title": "Write schema"})
    assert r.status_code == 201, r.text
    task = r.json()
    assert task["status"] == "TODO"
    assert task["position"] == 0

    board = client.get(f"/api/projects/{pid}/tasks").json()
    assert [t["title"] for t in board["TODO"]] == ["Write schema"]
    assert board["DOING"] == []
    assert board["DONE"] == []


def test_moving_task_sets_completed_at_only_for_done(client, register):
    register("lead")
    pid = _make_project(client)
    tid = client.post(f"/api/projects/{pid}/tasks", json={"title": "Ship"}).json()["id"]

    doing = client.patch(f"/api/projects/{pid}/tasks/{tid}", json={"status": "DOING"}).json()
    assert doing["status"] == "DOING"
    assert doing["completed_at"] is None

    done = client.patch(f"/api/projects/{pid}/tasks/{tid}", json={"status": "DONE"}).json()
    assert done["status"] == "DONE"
    assert done["completed_at"] is not None

    # Moving back out of DONE clears the completion time.
    back = client.patch(f"/api/projects/{pid}/tasks/{tid}", json={"status": "DOING"}).json()
    assert back["completed_at"] is None


def test_assignee_must_be_a_team_member(client, register):
    register("lead")
    pid = _make_project(client)
    bob = _client_for("bob")
    bob_id = bob.get("/api/auth/me").json()["id"]

    # Bob is not on the team yet: assigning him must be refused by the trigger.
    r = client.post(
        f"/api/projects/{pid}/tasks", json={"title": "for bob", "assignee_id": bob_id}
    )
    assert r.status_code == 400, r.text


def test_task_can_be_assigned_to_a_member(client, register):
    register("lead")
    pid = _make_project(client)
    bob = _client_for("bob")
    bob_id = bob.get("/api/auth/me").json()["id"]
    bob.post(f"/api/projects/{pid}/apply", json={"message": "me"})
    app_id = client.get(f"/api/projects/{pid}").json()["applicants"][0]["application_id"]
    client.post(f"/api/projects/{pid}/applications/{app_id}/decide", json={"status": "ACCEPTED"})

    r = client.post(
        f"/api/projects/{pid}/tasks", json={"title": "for bob", "assignee_id": bob_id}
    )
    assert r.status_code == 201, r.text
    assert r.json()["assignee_username"] == "bob"


def test_delete_task(client, register):
    register("lead")
    pid = _make_project(client)
    tid = client.post(f"/api/projects/{pid}/tasks", json={"title": "tmp"}).json()["id"]
    assert client.delete(f"/api/projects/{pid}/tasks/{tid}").status_code == 204
    assert client.get(f"/api/projects/{pid}/tasks").json()["TODO"] == []


def test_task_on_wrong_project_is_404(client, register):
    register("lead")
    pid_a = _make_project(client)
    pid_b = client.post(
        "/api/projects", json={**PROJECT, "title": "second"}
    ).json()["id"]
    tid = client.post(f"/api/projects/{pid_a}/tasks", json={"title": "x"}).json()["id"]
    r = client.patch(f"/api/projects/{pid_b}/tasks/{tid}", json={"status": "DONE"})
    assert r.status_code == 404
