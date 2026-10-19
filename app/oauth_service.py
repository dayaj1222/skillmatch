"""GitHub and Google OAuth sign-in.

No OAuth framework: the flows are small enough to read here. A provider is
advertised only when its client id/secret are configured, so the app runs fine
without them and the frontend simply hides the buttons.
"""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass

import httpx
from fastapi import HTTPException
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import hash_password
from .config import get_settings
from .models import OAuthAccount, Profile, User

_settings = get_settings()
_state_serializer = URLSafeTimedSerializer(_settings.secret, salt="skillmatch-oauth-state")

STATE_MAX_AGE = 600  # 10 minutes to complete the round-trip.

PROVIDERS = ("github", "google")

_AUTHORIZE = {
    "github": "https://github.com/login/oauth/authorize",
    "google": "https://accounts.google.com/o/oauth2/v2/auth",
}
_TOKEN = {
    "github": "https://github.com/login/oauth/access_token",
    "google": "https://oauth2.googleapis.com/token",
}


@dataclass
class OAuthIdentity:
    subject: str
    email: str
    name: str | None
    avatar_url: str | None
    suggested_username: str


def configured_providers() -> list[str]:
    return [p for p in PROVIDERS if _settings.oauth_configured(p)]


def redirect_uri(provider: str) -> str:
    base = _settings.public_base_url.rstrip("/")
    return f"{base}/api/auth/oauth/{provider}/callback"


def make_state(provider: str, next_path: str) -> str:
    return _state_serializer.dumps({"p": provider, "n": next_path})


def read_state(state: str) -> dict:
    try:
        data = _state_serializer.loads(state, max_age=STATE_MAX_AGE)
    except (BadSignature, SignatureExpired) as exc:
        raise HTTPException(
            status_code=400, detail="Login attempt expired. Please try again."
        ) from exc
    if data.get("p") not in PROVIDERS:
        raise HTTPException(status_code=400, detail="Unknown login provider")
    return data


def authorize_url(provider: str, state: str) -> str:
    if not _settings.oauth_configured(provider):
        raise HTTPException(status_code=503, detail=f"{provider.title()} login is not configured")
    params = {
        "client_id": _client_id(provider),
        "redirect_uri": redirect_uri(provider),
        "state": state,
        "response_type": "code",
    }
    if provider == "github":
        params["scope"] = "read:user user:email"
    else:
        params["scope"] = "openid email profile"
        params["access_type"] = "online"
        params["prompt"] = "select_account"
    from urllib.parse import urlencode

    return f"{_AUTHORIZE[provider]}?{urlencode(params)}"


def _client_id(provider: str) -> str:
    return _settings.github_client_id if provider == "github" else _settings.google_client_id


def _client_secret(provider: str) -> str:
    if provider == "github":
        return _settings.github_client_secret
    return _settings.google_client_secret


def exchange_code(provider: str, code: str) -> str:
    """Trade the authorization code for an access token."""
    payload = {
        "client_id": _client_id(provider),
        "client_secret": _client_secret(provider),
        "code": code,
        "redirect_uri": redirect_uri(provider),
    }
    if provider == "google":
        payload["grant_type"] = "authorization_code"
    headers = {"Accept": "application/json"}
    try:
        res = httpx.post(_TOKEN[provider], data=payload, headers=headers, timeout=15)
        res.raise_for_status()
        token = res.json().get("access_token")
    except httpx.HTTPError as exc:  # pragma: no cover - network path
        raise HTTPException(status_code=502, detail=f"{provider.title()} login failed") from exc
    if not token:
        raise HTTPException(status_code=502, detail=f"{provider.title()} returned no token")
    return token


def fetch_identity(provider: str, token: str) -> OAuthIdentity:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    try:
        if provider == "github":
            return _github_identity(headers)
        return _google_identity(headers)
    except httpx.HTTPError as exc:  # pragma: no cover - network path
        raise HTTPException(status_code=502, detail=f"Could not read {provider} profile") from exc


def _github_identity(headers: dict) -> OAuthIdentity:
    user = httpx.get("https://api.github.com/user", headers=headers, timeout=15).json()
    email = user.get("email")
    if not email:
        emails = httpx.get("https://api.github.com/user/emails", headers=headers, timeout=15).json()
        primary = next(
            (e["email"] for e in emails if isinstance(e, dict) and e.get("primary")),
            None,
        )
        email = primary or (emails[0]["email"] if emails else None)
    subject = str(user.get("id") or "")
    login = user.get("login") or f"gh{subject}"
    if not email:
        email = f"{subject}+{login}@users.noreply.github.com"
    return OAuthIdentity(
        subject=subject,
        email=email,
        name=user.get("name"),
        avatar_url=user.get("avatar_url"),
        suggested_username=login,
    )


def _google_identity(headers: dict) -> OAuthIdentity:
    info = httpx.get(
        "https://openidconnect.googleapis.com/v1/userinfo", headers=headers, timeout=15
    ).json()
    email = info.get("email")
    if not email:
        raise HTTPException(status_code=502, detail="Google did not share an email address")
    return OAuthIdentity(
        subject=str(info.get("sub") or ""),
        email=email,
        name=info.get("name"),
        avatar_url=info.get("picture"),
        suggested_username=(email.split("@")[0] if email else "user"),
    )


def _unique_username(db: Session, seed: str) -> str:
    base = re.sub(r"[^A-Za-z0-9_.-]", "", seed).strip(".-_") or "user"
    base = base[:32]
    if len(base) < 3:
        base = f"user{base}"
    candidate = base
    while db.scalar(select(User).where(User.username == candidate)) is not None:
        candidate = f"{base[:28]}{secrets.randbelow(9000) + 1000}"
    return candidate


def login_or_register(db: Session, provider: str, identity: OAuthIdentity) -> User:
    """Log in an existing linked account, link by email, or create a new user."""
    account = db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.subject == identity.subject,
        )
    )
    if account is not None:
        user = db.get(User, account.user_id)
        if user is not None:
            _refresh_avatar(db, user, identity.avatar_url)
            return user

    user = db.scalar(select(User).where(User.email == identity.email))
    if user is None:
        user = User(
            username=_unique_username(db, identity.suggested_username),
            email=identity.email,
            # No password is usable; a random secret keeps the column non-null.
            password_hash=hash_password(secrets.token_urlsafe(32)),
        )
        db.add(user)
        db.flush()
        db.add(Profile(user_id=user.id, full_name=identity.name, avatar_url=identity.avatar_url))
    else:
        _refresh_avatar(db, user, identity.avatar_url)

    db.add(OAuthAccount(user_id=user.id, provider=provider, subject=identity.subject))
    db.commit()
    db.refresh(user)
    return user


def _refresh_avatar(db: Session, user: User, avatar_url: str | None) -> None:
    """Adopt the provider picture only when the user has none of their own."""
    if not avatar_url:
        return
    profile = db.get(Profile, user.id)
    if profile is None:
        db.add(Profile(user_id=user.id, avatar_url=avatar_url))
    elif not profile.avatar_url or profile.avatar_url.startswith("http"):
        profile.avatar_url = avatar_url


__all__ = [
    "OAuthIdentity",
    "authorize_url",
    "configured_providers",
    "exchange_code",
    "fetch_identity",
    "login_or_register",
    "make_state",
    "read_state",
    "redirect_uri",
]
