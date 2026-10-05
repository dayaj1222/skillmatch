"""Search people by the skills a project needs, ranked by coverage.

Coverage is the fraction of requested skills a person holds at or above the
requested level. ``require_all`` restricts results to people covering every
skill; otherwise partial matches come back ranked by coverage and then by how
deep their levels run. The ranking happens in the database as a single grouped
join-and-aggregate, not in a Python loop.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Profile, Skill, User, UserSkill
from ..schemas import PublicProfileOut

router = APIRouter(prefix="/api", tags=["search"])


def _ids_for(db: Session, names: list[str]) -> list[int]:
    if not names:
        return []
    return list(db.scalars(select(Skill.id).where(Skill.name.in_(names))).all())


@router.get("/search", response_model=list[PublicProfileOut])
def search_people(
    skill: list[str] = Query(default=[], description="Required skill names (repeatable)"),
    min_level: int = Query(default=1, ge=1, le=5),
    require_all: bool = Query(default=False),
    q: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[PublicProfileOut]:
    from .profiles import public_profile  # local import avoids a circular import

    skill_ids = _ids_for(db, skill)

    # No skill filter: behave like the directory, ordered by name.
    if not skill_ids:
        users = db.scalars(
            select(User).order_by(User.username).limit(limit).offset(offset)
        ).all()
        return [public_profile(u.username, db) for u in users]

    matched = func.count(func.distinct(UserSkill.skill_id))
    depth = func.sum(UserSkill.level)

    stmt = (
        select(User.id, matched.label("matched"), depth.label("depth"))
        .join(UserSkill, UserSkill.user_id == User.id)
        .where(UserSkill.skill_id.in_(skill_ids), UserSkill.level >= min_level)
        .group_by(User.id)
    )

    if require_all:
        stmt = stmt.having(matched == len(skill_ids))

    if q:
        like = f"%{q}%"
        stmt = stmt.join(Profile, Profile.user_id == User.id).where(
            Profile.full_name.ilike(like)
            | Profile.headline.ilike(like)
            | Profile.bio.ilike(like)
            | User.username.ilike(like)
        )

    stmt = stmt.order_by(matched.desc(), depth.desc(), User.username)
    rows = db.execute(stmt.limit(limit).offset(offset)).all()

    out: list[PublicProfileOut] = []
    for user_id, _matched, _depth in rows:
        user = db.get(User, user_id)
        if user is not None:
            out.append(public_profile(user.username, db))
    return out
