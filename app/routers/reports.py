from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..reports_service import create, list_mine
from ..schemas import ReportIn, ReportOut

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _out(r) -> ReportOut:
    return ReportOut(
        id=r.id,
        reporter_id=r.reporter_id,
        reported_user_id=r.reported_user_id,
        project_id=r.project_id,
        reason=r.reason,
        details=r.details,
        status=r.status,
        created_at=r.created_at,
    )


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportOut:
    r = create(
        db, user, payload.reported_username, payload.project_id, payload.reason, payload.details
    )
    return _out(r)


@router.get("/mine", response_model=list[ReportOut])
def my_reports(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ReportOut]:
    return [_out(r) for r in list_mine(db, user.id)]
