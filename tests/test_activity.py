"""Comments, the trigger-written activity feed, and invites."""

from __future__ import annotations

from tests.conftest import make_client

PROJECT = {
    "title": "Feed project",
    "description": "generates events",
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


def _feed(client):
    r = client.get("/api/activity")
    assert r.status_code == 200, r.text
    return r.json()


def test_project_creation_writes_activity(client, register):
    register("lead")
    pid = client.post("/api/projects", json=PROJECT).json()["id"]
    kinds = [a["kind"] for a in _feed(client)]
    assert "PROJECT_CREATED" in kinds
    created = next(a for a in _feed(client) if a["kind"] == "PROJECT_CREATED")
    assert created["project_id"] == pid


def test_apply_then_accept_writes_both_events_for_owner(client, register):
    register("lead")
    pid = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{pid}/apply", json={"message": "hi"})

    app_id = client.get(f"/api/projects/{pid}").json()["applicants"][0]["application_id"]
    client.post(f"/api/projects/{pid}/applications/{app_id}/decide", json={"status": "ACCEPTED"})

    kinds = [a["kind"] for a in _feed(client)]
    assert "APPLIED" in kinds
    assert "ACCEPTED" in kinds


def test_activity_feed_is_scoped_to_the_users_world(client, register):
    register("lead")
    client.post("/api/projects", json=PROJECT)

    # An unrelated user must not see another project's events.
    stranger = _client_for("stranger")
    assert _feed(stranger) == []


def test_invite_creates_exactly_one_feed_entry(client, register):
    """An invite is *one* event, not an APPLIED followed by an INVITED.

    The invite is stored as a PENDING application, which fires the
    AFTER-INSERT applications trigger. If the endpoint also writes an INVITED
    row explicitly, the invitee's feed shows two contradictory entries.
    """
    register("lead")
    pid = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")

    r = client.post(f"/api/projects/{pid}/invite", json={"username": "bob", "message": "join"})
    assert r.status_code == 201, r.text

    kinds = [a["kind"] for a in _feed(bob)]
    assert kinds.count("INVITED") == 1
    assert "APPLIED" not in kinds, f"invite should not masquerade as an application: {kinds}"


def test_invitee_can_accept_their_own_invite(client, register):
    """An invited user can accept, and acceptance puts them on the team."""
    register("lead")
    pid = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")

    client.post(f"/api/projects/{pid}/invite", json={"username": "bob", "message": "join"})

    # Bob sees the invite on the project, marked as owner-initiated.
    detail = bob.get(f"/api/projects/{pid}").json()
    assert detail["my_application"]["initiated_by"] == "OWNER"
    app_id = detail["my_application"]["application_id"]

    r = bob.post(
        f"/api/projects/{pid}/applications/{app_id}/decide", json={"status": "ACCEPTED"}
    )
    assert r.status_code == 200, r.text

    # Bob is now a member.
    after = bob.get(f"/api/projects/{pid}").json()
    assert after["my_membership"] is not None


def test_applicant_cannot_self_accept_a_normal_application(client, register):
    """Someone who applied on their own cannot accept themselves onto the team."""
    register("lead")
    pid = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{pid}/apply", json={"message": "pick me"})

    app_id = bob.get(f"/api/projects/{pid}").json()["my_application"]["application_id"]
    r = bob.post(
        f"/api/projects/{pid}/applications/{app_id}/decide", json={"status": "ACCEPTED"}
    )
    assert r.status_code == 403, r.text


def test_comment_thread_is_one_level_deep(client, register):
    register("lead")
    pid = client.post("/api/projects", json=PROJECT).json()["id"]

    root = client.post(f"/api/projects/{pid}/comments", json={"body": "first"}).json()
    root_id = root[0]["id"]

    threaded = client.post(
        f"/api/projects/{pid}/comments", json={"body": "reply", "parent_id": root_id}
    ).json()
    assert len(threaded) == 1
    assert len(threaded[0]["replies"]) == 1
    reply_id = threaded[0]["replies"][0]["id"]

    # A reply to a reply is refused by the flat-thread trigger.
    nested = client.post(
        f"/api/projects/{pid}/comments", json={"body": "nested", "parent_id": reply_id}
    )
    assert nested.status_code == 400, nested.text


def test_outsider_cannot_comment(client, register):
    register("lead")
    pid = client.post("/api/projects", json=PROJECT).json()["id"]
    outsider = _client_for("nosy")
    assert outsider.post(f"/api/projects/{pid}/comments", json={"body": "hi"}).status_code == 403
    assert outsider.get(f"/api/projects/{pid}/comments").status_code == 403


def test_dashboard_reports_led_projects_and_attention(client, register):
    register("lead")
    pid = client.post("/api/projects", json=PROJECT).json()["id"]
    bob = _client_for("bob")
    bob.post(f"/api/projects/{pid}/apply", json={"message": "pick me"})

    dash = client.get("/api/me/dashboard").json()
    assert dash["stats"]["projects_led"] == 1
    assert any(a["kind"] == "APPLIED" for a in dash["needs_attention"])


def test_schema_page_reports_the_installed_triggers(client):
    body = client.get("/api/schema").json()
    names = {t["name"] for t in body["triggers"]}
    # Spot-check triggers from both the original design and the redesign.
    assert "trg_capacity" in names or any("capacity" in n for n in names)
    assert any("assignee" in n for n in names)
    assert any("flat_thread" in n for n in names)
    assert body["fk_count"] > 0
