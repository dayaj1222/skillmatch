from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..messages_service import mark_read, send, thread, threads_for
from ..models import User
from ..schemas import MessageIn, MessageOut, ThreadOut

router = APIRouter(prefix="/api/messages", tags=["messages"])


def _out(m, db) -> MessageOut:
    from ..models import User as U

    s = db.get(U, m.sender_id)
    r = db.get(U, m.recipient_id)
    return MessageOut(
        id=m.id,
        sender_id=m.sender_id,
        sender_username=s.username if s else "?",
        recipient_id=m.recipient_id,
        recipient_username=r.username if r else "?",
        body=m.body,
        created_at=m.created_at,
        read_at=m.read_at,
    )


@router.post("", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def send_message(
    payload: MessageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    m = send(db, user, payload.recipient_username, payload.body)
    return _out(m, db)


@router.get("/threads", response_model=list[ThreadOut])
def list_threads(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ThreadOut]:
    out = []
    for t in threads_for(db, user.id):
        last = t["last_message"]
        out.append(
            ThreadOut(
                partner_id=t["partner_id"],
                partner_username=t["partner_username"],
                last_message=_out(last, db),
            )
        )
    return out


@router.get("/{username}", response_model=list[MessageOut])
def get_thread(
    username: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MessageOut]:
    msgs = thread(db, user, username)
    return [_out(m, db) for m in msgs]


@router.patch("/{message_id}/read", response_model=MessageOut)
def read_message(
    message_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    m = mark_read(db, user, message_id)
    return _out(m, db)
