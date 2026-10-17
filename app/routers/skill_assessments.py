from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import SkillAssessmentIn
from ..skill_assessments_service import assess

router = APIRouter(prefix="/api/skill-assessments", tags=["skill-assessments"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_assessment(
    payload: SkillAssessmentIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    a = assess(
        db,
        user,
        payload.project_id,
        payload.ratee_username,
        payload.skill_name,
        payload.score,
        payload.comment,
    )
    return {"ok": True, "id": a.id}
