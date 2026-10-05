"""Skill vocabulary and category endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SkillCategory
from ..schemas import CategoryOut, SkillOut
from ..skills_service import skill_catalog

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("", response_model=list[SkillOut])
def list_skills(db: Session = Depends(get_db)) -> list[dict]:
    return skill_catalog(db)


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)) -> list[SkillCategory]:
    return list(
        db.scalars(select(SkillCategory).order_by(SkillCategory.sort_order, SkillCategory.name))
    )
