"""Register, log in, log out, and identify the current user."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..auth import (
    clear_session,
    get_current_user,
    hash_password,
    issue_session,
    verify_password,
)
from ..database import get_db
from ..models import Profile, User
from ..schemas import LoginIn, RegisterIn, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, response: Response, db: Session = Depends(get_db)) -> User:
    username = payload.username.strip()
    email = payload.email.strip()

    clash = db.scalar(
        select(User).where(or_(User.username == username, User.email == email))
    )
    if clash is not None:
        raise HTTPException(status_code=409, detail="Username or email already taken")

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.flush()
    # Every user gets an empty profile row so updates are simple UPSERTs.
    db.add(Profile(user_id=user.id))
    db.commit()
    db.refresh(user)

    issue_session(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
def login(payload: LoginIn, response: Response, db: Session = Depends(get_db)) -> User:
    ident = payload.username_or_email.strip()
    user = db.scalar(
        select(User).where(or_(User.username == ident, User.email == ident))
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    issue_session(response, user.id)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    clear_session(response)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
