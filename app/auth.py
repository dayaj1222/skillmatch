"""Password hashing, session cookies, and the current-user dependency."""

from __future__ import annotations

import bcrypt
from fastapi import Cookie, Depends, HTTPException, Response, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import User

_settings = get_settings()
_serializer = URLSafeTimedSerializer(_settings.secret, salt="skillmatch-session")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def issue_session(response: Response, user_id: int) -> None:
    """Sign a session token and set it as an httpOnly cookie."""
    token = _serializer.dumps({"uid": user_id})
    response.set_cookie(
        key=_settings.cookie_name,
        value=token,
        max_age=_settings.session_max_age,
        httponly=True,
        samesite="lax",
        secure=_settings.cookie_secure,
        path="/",
    )


def clear_session(response: Response) -> None:
    response.delete_cookie(_settings.cookie_name, path="/")


def _user_id_from_cookie(token: str | None) -> int | None:
    if not token:
        return None
    try:
        data = _serializer.loads(token, max_age=_settings.session_max_age)
    except (BadSignature, SignatureExpired):
        return None
    uid = data.get("uid")
    return uid if isinstance(uid, int) else None


def get_current_user_optional(
    db: Session = Depends(get_db),
    session: str | None = Cookie(default=None, alias=_settings.cookie_name),
) -> User | None:
    uid = _user_id_from_cookie(session)
    if uid is None:
        return None
    return db.get(User, uid)


def get_current_user(user: User | None = Depends(get_current_user_optional)) -> User:
    """Require an authenticated user; 401 otherwise."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    return user
