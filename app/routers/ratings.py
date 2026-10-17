from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..ratings_service import create, summary
from ..schemas import RatingIn, RatingOut, RatingSummaryOut

router = APIRouter(prefix="/api/ratings", tags=["ratings"])


def _out(r, db) -> RatingOut:
    from ..models import User as U

    rater = db.get(U, r.rater_id)
    return RatingOut(
        id=r.id,
        rater_id=r.rater_id,
        rater_username=rater.username if rater else "?",
        ratee_id=r.ratee_id,
        project_id=r.project_id,
        score=r.score,
        comment=r.comment,
        created_at=r.created_at,
    )


@router.post("", response_model=RatingOut, status_code=status.HTTP_201_CREATED)
def create_rating(
    payload: RatingIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RatingOut:
    r = create(db, user, payload.ratee_username, payload.score, payload.comment, payload.project_id)
    return _out(r, db)


@router.get("/{username}", response_model=RatingSummaryOut)
def get_ratings(
    username: str,
    db: Session = Depends(get_db),
) -> RatingSummaryOut:
    s = summary(db, username)
    return RatingSummaryOut(
        average=s["average"],
        count=s["count"],
        ratings=[_out(r, db) for r in s["ratings"]],
    )
