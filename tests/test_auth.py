"""Registration, login, session, and authorization."""

from __future__ import annotations

from tests.conftest import make_client


def test_register_creates_session(client):
    r = client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "alice@example.com", "password": "password123"},
    )
    assert r.status_code == 201
    assert client.get("/api/auth/me").status_code == 200


def test_duplicate_username_conflicts(client):
    client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "a@x.com", "password": "password123"},
    )
    r = client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "b@x.com", "password": "password123"},
    )
    assert r.status_code == 409


def test_duplicate_email_conflicts(client):
    client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "same@x.com", "password": "password123"},
    )
    r = client.post(
        "/api/auth/register",
        json={"username": "bob", "email": "same@x.com", "password": "password123"},
    )
    assert r.status_code == 409


def test_short_password_rejected(client):
    r = client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "a@x.com", "password": "short"},
    )
    assert r.status_code == 422


def test_login_by_email(client):
    client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "alice@x.com", "password": "password123"},
    )
    fresh = make_client()
    r = fresh.post(
        "/api/auth/login",
        json={"username_or_email": "alice@x.com", "password": "password123"},
    )
    assert r.status_code == 200


def test_login_wrong_password(client):
    client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "a@x.com", "password": "password123"},
    )
    fresh = make_client()
    r = fresh.post(
        "/api/auth/login", json={"username_or_email": "alice", "password": "wrong"}
    )
    assert r.status_code == 401


def test_logout_invalidates_session(client):
    client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "a@x.com", "password": "password123"},
    )
    assert client.get("/api/auth/me").status_code == 200
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_unauthenticated_profile_write_is_401(client):
    assert client.put("/api/profile", json={"bio": "hi"}).status_code == 401
