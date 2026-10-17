"""Connections (mutual) and follows (one-way)."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import Connection, User


def _user(db: Session, username: str) -> User:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=404, detail="No such user")
    return user


def request_connection(db: Session, requester: User, recipient_username: str) -> Connection:
    recipient = _user(db, recipient_username)
    if recipient.id == requester.id:
        raise HTTPException(status_code=400, detail="You cannot connect to yourself")

    existing = db.scalar(
        select(Connection).where(
            or_(
                (Connection.requester_id == requester.id)
                & (Connection.recipient_id == recipient.id),
                (Connection.requester_id == recipient.id)
                & (Connection.recipient_id == requester.id),
            )
        )
    )
    if existing is not None:
        if existing.status == "ACCEPTED":
            raise HTTPException(status_code=409, detail="Already connected")
        if existing.status == "PENDING":
            raise HTTPException(status_code=409, detail="A request is already pending")
        # rejected/blocked: allow new request by resetting
        existing.requester_id = requester.id
        existing.recipient_id = recipient.id
        existing.status = "PENDING"
        existing.responded_at = None
        db.commit()
        db.refresh(existing)
        return existing

    conn = Connection(requester_id=requester.id, recipient_id=recipient.id, status="PENDING")
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


def _load(db: Session, connection_id: int, actor: User) -> Connection:
    c = db.get(Connection, connection_id)
    if c is None:
        raise HTTPException(status_code=404, detail="No such connection")
    if c.recipient_id != actor.id and c.requester_id != actor.id:
        raise HTTPException(status_code=403, detail="Not your connection")
    return c


def accept(db: Session, connection_id: int, actor: User) -> Connection:
    c = _load(db, connection_id, actor)
    if c.recipient_id != actor.id:
        raise HTTPException(status_code=403, detail="Only the recipient can accept")
    if c.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Already {c.status.lower()}")
    c.status = "ACCEPTED"
    c.responded_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    db.commit()
    db.refresh(c)
    return c


def reject(db: Session, connection_id: int, actor: User) -> Connection:
    c = _load(db, connection_id, actor)
    if c.recipient_id != actor.id:
        raise HTTPException(status_code=403, detail="Only the recipient can reject")
    if c.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Already {c.status.lower()}")
    c.status = "REJECTED"
    c.responded_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    db.commit()
    db.refresh(c)
    return c


def remove(db: Session, actor: User, other_username: str) -> None:
    other = _user(db, other_username)
    c = db.scalar(
        select(Connection).where(
            or_(
                (Connection.requester_id == actor.id) & (Connection.recipient_id == other.id),
                (Connection.requester_id == other.id) & (Connection.recipient_id == actor.id),
            )
        )
    )
    if c is not None:
        db.delete(c)
        db.commit()


def is_connected(db: Session, a_id: int, b_id: int) -> bool:
    if a_id == b_id:
        return False
    c = db.scalar(
        select(Connection).where(
            Connection.status == "ACCEPTED",
            or_(
                (Connection.requester_id == a_id) & (Connection.recipient_id == b_id),
                (Connection.requester_id == b_id) & (Connection.recipient_id == a_id),
            ),
        )
    )
    return c is not None


def list_connections(db: Session, user_id: int) -> list[tuple[Connection, User]]:
    rows = db.execute(
        select(Connection, User).join(
            User,
            (User.id == Connection.requester_id) | (User.id == Connection.recipient_id),
        ).where(
            Connection.status == "ACCEPTED",
            (Connection.requester_id == user_id) | (Connection.recipient_id == user_id),
        )
    ).all()
    out = []
    for c, u in rows:
        if u.id == user_id:
            continue
        out.append((c, u))
    # dedupe by other user
    seen = set()
    uniq = []
    for c, u in out:
        if u.id in seen:
            continue
        seen.add(u.id)
        uniq.append((c, u))
    return uniq


def incoming_requests(db: Session, user_id: int) -> list[tuple[Connection, User]]:
    rows = db.execute(
        select(Connection, User)
        .join(User, User.id == Connection.requester_id)
        .where(Connection.recipient_id == user_id, Connection.status == "PENDING")
        .order_by(Connection.created_at.desc())
    ).all()
    return [(c, u) for c, u in rows]


def status_with(db: Session, user_id: int, other_username: str) -> str:
    other = _user(db, other_username)
    c = db.scalar(
        select(Connection).where(
            or_(
                (Connection.requester_id == user_id) & (Connection.recipient_id == other.id),
                (Connection.requester_id == other.id) & (Connection.recipient_id == user_id),
            )
        )
    )
    if c is None:
        return "NONE"
    if c.status == "ACCEPTED":
        return "CONNECTED"
    if c.status == "PENDING":
        return "PENDING" if c.requester_id == user_id else "INCOMING"
    return c.status


__all__ = [
    "accept",
    "incoming_requests",
    "is_connected",
    "list_connections",
    "reject",
    "remove",
    "request_connection",
    "status_with",
]
