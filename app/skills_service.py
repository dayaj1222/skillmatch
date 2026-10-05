"""Skill vocabulary, per-person skill sets, and endorsement counts."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Endorsement, Skill, SkillCategory, UserSkill


def get_or_create_skill(db: Session, name: str) -> Skill:
    """Return the canonical skill for ``name``, creating it if new.

    CITEXT uniqueness means the lookup is case-insensitive, so "Python" and
    "python" resolve to the same row rather than creating a duplicate.
    """
    clean = name.strip()
    existing = db.scalar(select(Skill).where(Skill.name == clean))
    if existing is not None:
        return existing
    skill = Skill(name=clean)
    db.add(skill)
    db.flush()
    return skill


def replace_user_skills(db: Session, user_id: int, entries: list[tuple[str, int, int]]) -> None:
    """Atomically replace a person's whole skill set.

    Duplicate names in ``entries`` collapse to the last occurrence, since the
    composite primary key forbids two rows for one (user, skill) pair.
    """
    db.execute(UserSkill.__table__.delete().where(UserSkill.user_id == user_id))

    by_skill: dict[int, tuple[int, int]] = {}
    for name, level, years in entries:
        skill = get_or_create_skill(db, name)
        by_skill[skill.id] = (level, years)

    for skill_id, (level, years) in by_skill.items():
        db.add(UserSkill(user_id=user_id, skill_id=skill_id, level=level, years=years))
    db.flush()


def endorsement_counts_for(db: Session, user_id: int) -> dict[int, int]:
    """Map skill_id -> endorsement count for one person's profile."""
    rows = db.execute(
        select(Endorsement.skill_id, func.count())
        .where(Endorsement.user_id == user_id)
        .group_by(Endorsement.skill_id)
    ).all()
    return {skill_id: count for skill_id, count in rows}


def skill_catalog(db: Session) -> list[dict]:
    """Every skill with its category and how many people list it."""
    rows = db.execute(
        select(
            Skill.id,
            Skill.name,
            Skill.category_id,
            SkillCategory.name,
            func.count(UserSkill.user_id),
        )
        .join(SkillCategory, SkillCategory.id == Skill.category_id, isouter=True)
        .join(UserSkill, UserSkill.skill_id == Skill.id, isouter=True)
        .group_by(Skill.id, Skill.name, Skill.category_id, SkillCategory.name)
        .order_by(Skill.name)
    ).all()
    return [
        {
            "id": sid,
            "name": name,
            "category_id": cid,
            "category": cname,
            "people": people,
        }
        for sid, name, cid, cname, people in rows
    ]
