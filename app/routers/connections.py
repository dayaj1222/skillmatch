from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..connections_service import (
    accept,
    incoming_requests,
    list_connections,
    reject,
    remove,
    request_connection,
    status_with,
)
from ..database import get_db
from ..models import User
from ..schemas import ConnectionOut, ConnectionRequestIn, ConnectionStatusOut

router = APIRouter(prefix="/api/connections", tags=["connections"])


def _out(c, other_username: str) -> ConnectionOut:
    return ConnectionOut(
        id=c.id,
        requester_id=c.requester_id,
        recipient_id=c.recipient_id,
        other_username=other_username,
        status=c.status,
        created_at=c.created_at,
        responded_at=c.responded_at,
    )


@router.post("/request", response_model=ConnectionOut, status_code=status.HTTP_201_CREATED)
def request_conn(
    payload: ConnectionRequestIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConnectionOut:
    c = request_connection(db, user, payload.username)
    other = payload.username
    return _out(c, other)


@router.post("/{connection_id}/accept", response_model=ConnectionOut)
def accept_conn(
    connection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConnectionOut:
    c = accept(db, connection_id, user)
    # determine other
    from ..models import User as U

    other_id = c.requester_id if c.recipient_id == user.id else c.recipient_id
    other = db.get(U, other_id)
    return _out(c, other.username if other else "?")


@router.post("/{connection_id}/reject", response_model=ConnectionOut)
def reject_conn(
    connection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConnectionOut:
    c = reject(db, connection_id, user)
    from ..models import User as U

    other_id = c.requester_id if c.recipient_id == user.id else c.recipient_id
    other = db.get(U, other_id)
    return _out(c, other.username if other else "?")


@router.delete("/{username}", status_code=status.HTTP_204_NO_CONTENT)
def remove_conn(
    username: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    remove(db, user, username)


@router.get("", response_model=list[ConnectionOut])
def list_conn(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ConnectionOut]:
    out = []
    for c, u in list_connections(db, user.id):
        out.append(_out(c, u.username))
    return out


@router.get("/requests", response_model=list[ConnectionOut])
def requests(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ConnectionOut]:
    out = []
    for c, u in incoming_requests(db, user.id):
        out.append(_out(c, u.username))
    return out


@router.get("/status/{username}", response_model=ConnectionStatusOut)
def status(
    username: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConnectionStatusOut:
    return ConnectionStatusOut(status=status_with(db, user.id, username))
