"""One-way follows."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Follow, User


def _user(db: Session, username: str) -> User:
    u = db.scalar(select(User).where(User.username == username))
    if u is None:
        raise HTTPException(status_code=404, detail="No such user")
    return u


def follow(db: Session, follower: User, username: str) -> None:
    target = _user(db, username)
    if target.id == follower.id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")
    exists = db.get(Follow, (follower.id, target.id))
    if exists is None:
        db.add(Follow(follower_id=follower.id, following_id=target.id))
        db.commit()


def unfollow(db: Session, follower: User, username: str) -> None:
    target = _user(db, username)
    row = db.get(Follow, (follower.id, target.id))
    if row is not None:
        db.delete(row)
        db.commit()


def is_following(db: Session, follower_id: int, target_id: int) -> bool:
    return db.get(Follow, (follower_id, target_id)) is not None


def followers(db: Session, username: str) -> list[User]:
    target = _user(db, username)
    rows = db.scalars(select(Follow).where(Follow.following_id == target.id)).all()
    ids = [f.follower_id for f in rows]
    if not ids:
        return []
    return list(db.scalars(select(User).where(User.id.in_(ids))).all())


def following(db: Session, username: str) -> list[User]:
    target = _user(db, username)
    rows = db.scalars(select(Follow).where(Follow.follower_id == target.id)).all()
    ids = [f.following_id for f in rows]
    if not ids:
        return []
    return list(db.scalars(select(User).where(User.id.in_(ids))).all())


__all__ = ["follow", "followers", "following", "is_following", "unfollow"]
