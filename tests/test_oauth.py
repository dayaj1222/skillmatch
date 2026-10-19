"""OAuth: state signing, account linking, and the callback without a network."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app import oauth_service
from app.database import SessionLocal
from app.models import OAuthAccount, Profile, User
from app.oauth_service import OAuthIdentity, make_state, read_state


def _identity(**overrides) -> OAuthIdentity:
    values = {
        "subject": "12345",
        "email": "octo@example.com",
        "name": "Octo Cat",
        "avatar_url": "https://avatars.example/octo.png",
        "suggested_username": "octo",
    }
    values.update(overrides)
    return OAuthIdentity(**values)


def test_providers_hidden_when_not_configured(client):
    r = client.get("/api/auth/oauth/providers")
    assert r.status_code == 200
    assert r.json() == {"providers": []}


def test_start_rejects_unconfigured_provider(client):
    r = client.get("/api/auth/oauth/github/login", follow_redirects=False)
    assert r.status_code == 503


def test_state_round_trip_and_tamper_detection():
    state = make_state("github", "/projects")
    assert read_state(state) == {"p": "github", "n": "/projects"}

    with pytest.raises(HTTPException):
        read_state(state + "x")


def test_oauth_login_creates_user_and_links_repeat_logins():
    with SessionLocal() as db:
        first = oauth_service.login_or_register(db, "github", _identity())
        assert first.email == "octo@example.com"
        assert first.username == "octo"

        profile = db.get(Profile, first.id)
        assert profile is not None
        assert profile.full_name == "Octo Cat"
        assert profile.avatar_url == "https://avatars.example/octo.png"

        account = db.query(OAuthAccount).filter_by(user_id=first.id).one()
        assert (account.provider, account.subject) == ("github", "12345")

        again = oauth_service.login_or_register(db, "github", _identity(name="Renamed"))
        assert again.id == first.id
        assert db.query(User).filter_by(email="octo@example.com").count() == 1


def test_oauth_email_links_to_an_existing_account():
    with SessionLocal() as db:
        user = User(username="existing", email="same@example.com", password_hash="x")
        db.add(user)
        db.commit()

        linked = oauth_service.login_or_register(
            db, "google", _identity(email="same@example.com", suggested_username="other")
        )
        assert linked.id == user.id
        assert db.query(User).filter_by(email="same@example.com").count() == 1


def test_oauth_username_collision_gets_a_suffix():
    with SessionLocal() as db:
        db.add(User(username="octo", email="taken@example.com", password_hash="x"))
        db.commit()

        user = oauth_service.login_or_register(
            db, "github", _identity(email="fresh@example.com", suggested_username="octo")
        )
        assert user.username != "octo"
        assert user.username.startswith("octo")


def test_callback_issues_a_session(client, monkeypatch):
    import app.routers.oauth as oauth_router

    monkeypatch.setattr(oauth_router, "exchange_code", lambda provider, code: "token")
    monkeypatch.setattr(
        oauth_router,
        "fetch_identity",
        lambda provider, token: _identity(
            email="callback@example.com", suggested_username="callback"
        ),
    )

    state = make_state("github", "/projects")
    r = client.get(
        f"/api/auth/oauth/github/callback?code=abc&state={state}",
        follow_redirects=False,
    )
    assert r.status_code == 303
    assert r.headers["location"].endswith("/projects")

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "callback"
