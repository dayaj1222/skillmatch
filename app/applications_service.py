"""The application state machine.

An *application* is one row in ``applications``, but it plays two roles: a
person asking to join (APPLICANT-initiated) and an owner asking a person to join
(OWNER-initiated, an invite). Both flow through the same PENDING -> ACCEPTED |
REJECTED | WITHDRAWN machine, which is why they share a table.

This module owns that machine. Before it existed, four endpoints in two routers
each knew a piece of the rule, and the invite path wrote the row directly. Now
the routers call ``apply``, ``invite``, ``decide``, or ``withdraw`` and the
machine lives in one place.

The capacity ceiling and accept-creates-membership invariants stay in the
database triggers; this module is the Python interface over them.
"""

from __future__ import annotations

import datetime as dt

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import Application, Membership, Project, User
from .projects_service import CLOSED, recompute_status
from .schemas import ApplicantOut

PENDING = "PENDING"
ACCEPTED = "ACCEPTED"
REJECTED = "REJECTED"
WITHDRAWN = "WITHDRAWN"

OWNER = "OWNER"
APPLICANT = "APPLICANT"


def to_out(application: Application, username: str) -> ApplicantOut:
    """Application row as the shape every endpoint returns."""
    return ApplicantOut(
        application_id=application.id,
        user_id=application.applicant_id,
        username=username,
        message=application.message,
        status=application.status,
        initiated_by=application.initiated_by,
        created_at=application.created_at,
    )


def _load(db: Session, project_id: int, application_id: int) -> tuple[Project, Application]:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="No such project")
    application = db.get(Application, application_id)
    if application is None or application.project_id != project_id:
        raise HTTPException(status_code=404, detail="No such application")
    return project, application


def apply(db: Session, project: Project, user: User, message: str) -> Application:
    """A person asks to join. Creates a PENDING, APPLICANT-initiated row.

    The unique constraint would reject a duplicate anyway; checking first is so
    the caller sees a 409 rather than a 500.
    """
    if project.status == CLOSED:
        raise HTTPException(status_code=400, detail="This project is closed")
    if project.owner_id == user.id:
        raise HTTPException(status_code=400, detail="You already lead this project")
    if db.get(Membership, (project.id, user.id)) is not None:
        raise HTTPException(status_code=400, detail="You are already on this team")

    application = Application(
        project_id=project.id,
        applicant_id=user.id,
        message=message,
        status=PENDING,
        initiated_by=APPLICANT,
    )
    db.add(application)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="You have already applied to this project"
        ) from exc
    db.refresh(application)
    return application


def invite(db: Session, project: Project, owner: User, username: str, message: str) -> Application:
    """The owner asks a named person to join. The inverse of applying.

    Stored as a PENDING, OWNER-initiated application so there is one state
    machine, not two. The activity trigger announces it as INVITED.
    """
    if project.owner_id != owner.id:
        raise HTTPException(status_code=403, detail="Only the owner can invite")

    target = db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=404, detail="No such user")
    if target.id == owner.id:
        raise HTTPException(status_code=400, detail="You lead this project")
    if db.get(Membership, (project.id, target.id)) is not None:
        raise HTTPException(status_code=400, detail="They are already on the team")

    existing = db.scalar(
        select(Application).where(
            Application.project_id == project.id,
            Application.applicant_id == target.id,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="They already have a record here")

    application = Application(
        project_id=project.id,
        applicant_id=target.id,
        message=message,
        status=PENDING,
        initiated_by=OWNER,
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


def decide(
    db: Session, project: Project, application: Application, actor: User, new_status: str
) -> None:
    """Move a PENDING application to ACCEPTED or REJECTED.

    Who may decide is the machine's rule, not the router's:

    * The owner may decide anyone.
    * The invitee may answer their *own* invite, but only accept or decline it.
    * An applicant may not decide their own normal application.

    The trigger creates the membership on ACCEPT and enforces capacity.
    """
    is_owner = project.owner_id == actor.id
    is_invitee = application.applicant_id == actor.id and application.initiated_by == OWNER

    if not is_owner and not is_invitee:
        raise HTTPException(status_code=403, detail="Only the owner can decide")
    if is_invitee and not is_owner and new_status not in (ACCEPTED, REJECTED):
        raise HTTPException(status_code=400, detail="You can only accept or decline")
    if application.status != PENDING:
        raise HTTPException(status_code=400, detail=f"Already {application.status.lower()}")

    application.status = new_status
    application.decided_at = dt.datetime.now(dt.UTC)
    application.decided_by = actor.id
    try:
        db.flush()
        recompute_status(db, project)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="That decision would exceed the team's capacity"
        ) from exc


def withdraw(db: Session, project_id: int, user: User) -> None:
    """An applicant retracts a still-pending application."""
    application = db.scalar(
        select(Application).where(
            Application.project_id == project_id,
            Application.applicant_id == user.id,
        )
    )
    if application is None:
        raise HTTPException(status_code=404, detail="You have not applied")
    if application.status != PENDING:
        raise HTTPException(status_code=400, detail="Only a pending application can be withdrawn")
    application.status = WITHDRAWN
    application.decided_at = dt.datetime.now(dt.UTC)
    db.commit()


def load_for_decide(
    db: Session, project_id: int, application_id: int
) -> tuple[Project, Application]:
    """Fetch both rows for a decide call, or raise the shared 404s."""
    return _load(db, project_id, application_id)


__all__ = [
    "ACCEPTED",
    "APPLICANT",
    "OWNER",
    "PENDING",
    "REJECTED",
    "WITHDRAWN",
    "apply",
    "decide",
    "invite",
    "load_for_decide",
    "to_out",
    "withdraw",
]
