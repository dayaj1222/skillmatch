"""Ratings for users, optionally tied to a project."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .connections_service import is_connected
from .models import Membership, Project, Rating, User


def _user(db: Session, username: str) -> User:
    u = db.scalar(select(User).where(User.username == username))
    if u is None:
        raise HTTPException(status_code=404, detail="No such user")
    return u


def _eligible(db: Session, rater: User, ratee: User, project_id: int | None) -> None:
    if project_id is not None:
        project = db.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="No such project")
        rater_on = (
            db.get(Membership, (project_id, rater.id)) is not None
            or project.owner_id == rater.id
        )
        ratee_on = (
            db.get(Membership, (project_id, ratee.id)) is not None
            or project.owner_id == ratee.id
        )
        if not (rater_on and ratee_on):
            raise HTTPException(status_code=403, detail="Both must be on the project to rate")
    else:
        if not is_connected(db, rater.id, ratee.id):
            raise HTTPException(status_code=403, detail="You must be connected to rate this user")


def create(
    db: Session,
    rater: User,
    ratee_username: str,
    score: int,
    comment: str | None,
    project_id: int | None,
) -> Rating:
    ratee = _user(db, ratee_username)
    if ratee.id == rater.id:
        raise HTTPException(status_code=400, detail="You cannot rate yourself")
    _eligible(db, rater, ratee, project_id)
    existing = db.scalar(
        select(Rating).where(
            Rating.rater_id == rater.id,
            Rating.ratee_id == ratee.id,
            Rating.project_id == project_id,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="You already rated this user for this project")
    rating = Rating(
        rater_id=rater.id, ratee_id=ratee.id, project_id=project_id, score=score, comment=comment
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)
    return rating


def summary(db: Session, username: str) -> dict:
    user = _user(db, username)
    rows = db.scalars(select(Rating).where(Rating.ratee_id == user.id)).all()
    if not rows:
        return {"average": None, "count": 0, "ratings": []}
    avg = sum(r.score for r in rows) / len(rows)
    return {"average": round(avg, 2), "count": len(rows), "ratings": list(rows)}


__all__ = ["create", "summary"]
