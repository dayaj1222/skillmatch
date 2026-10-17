"""Direct messages between connected users."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .connections_service import is_connected
from .models import Message, User


def send(db: Session, sender: User, recipient_username: str, body: str) -> Message:
    recipient = db.scalar(select(User).where(User.username == recipient_username))
    if recipient is None:
        raise HTTPException(status_code=404, detail="No such user")
    if recipient.id == sender.id:
        raise HTTPException(status_code=400, detail="You cannot message yourself")
    if not is_connected(db, sender.id, recipient.id):
        raise HTTPException(status_code=403, detail="You must be connected to message this user")

    msg = Message(sender_id=sender.id, recipient_id=recipient.id, body=body)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def thread(db: Session, user: User, other_username: str) -> list[Message]:
    other = db.scalar(select(User).where(User.username == other_username))
    if other is None:
        raise HTTPException(status_code=404, detail="No such user")
    rows = db.scalars(
        select(Message)
        .where(
            or_(
                (Message.sender_id == user.id) & (Message.recipient_id == other.id),
                (Message.sender_id == other.id) & (Message.recipient_id == user.id),
            )
        )
        .order_by(Message.created_at)
    ).all()
    return list(rows)


def mark_read(db: Session, user: User, message_id: int) -> Message:
    msg = db.get(Message, message_id)
    if msg is None or msg.recipient_id != user.id:
        raise HTTPException(status_code=404, detail="No such message")
    if msg.read_at is None:
        msg.read_at = datetime.now(UTC)
        db.commit()
        db.refresh(msg)
    return msg


def threads_for(db: Session, user_id: int) -> list[dict]:
    rows = db.scalars(
        select(Message)
        .where((Message.sender_id == user_id) | (Message.recipient_id == user_id))
        .order_by(Message.created_at.desc())
    ).all()
    partners: dict[int, Message] = {}
    for m in rows:
        other = m.recipient_id if m.sender_id == user_id else m.sender_id
        if other not in partners:
            partners[other] = m
    out = []
    for other_id, last in partners.items():
        other = db.get(User, other_id)
        out.append(
            {
                "partner_id": other_id,
                "partner_username": other.username if other else "?",
                "last_message": last,
            }
        )
    return out


__all__ = ["mark_read", "send", "thread", "threads_for"]
