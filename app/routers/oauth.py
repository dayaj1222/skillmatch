"""OAuth sign-in: start the flow and handle the provider callback."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..auth import issue_session
from ..config import get_settings
from ..database import get_db
from ..oauth_service import (
    authorize_url,
    configured_providers,
    exchange_code,
    fetch_identity,
    login_or_register,
    make_state,
    read_state,
)

router = APIRouter(prefix="/api/auth/oauth", tags=["oauth"])

_settings = get_settings()


def _safe_next(next_path: str) -> str:
    """Only allow same-site relative redirects (no open redirect)."""
    if (
        not next_path.startswith("/")
        or next_path.startswith("//")
        or "\\" in next_path
    ):
        return "/"
    return next_path


@router.get("/providers")
def providers() -> dict:
    return {"providers": configured_providers()}


@router.get("/{provider}/login")
def start(provider: str, next: str = Query(default="/")) -> RedirectResponse:
    state = make_state(provider, _safe_next(next))
    return RedirectResponse(authorize_url(provider, state), status_code=307)


@router.get("/{provider}/callback")
def callback(
    provider: str,
    code: str = Query(default=""),
    state: str = Query(default=""),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    data = read_state(state)
    if data.get("p") != provider:
        raise HTTPException(status_code=400, detail="Login state does not match the provider")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    token = exchange_code(provider, code)
    identity = fetch_identity(provider, token)
    user = login_or_register(db, provider, identity)

    next_path = _safe_next(data.get("n") or f"/u/{user.username}")
    target = _settings.frontend_base_url.rstrip("/") + next_path
    response = RedirectResponse(target, status_code=303)
    issue_session(response, user.id)
    return response
