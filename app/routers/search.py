"""Search people by the skills a project needs, ranked by coverage.

Coverage is the fraction of requested skills a person holds at or above the
requested level. ``require_all`` restricts results to people covering every
skill; otherwise partial matches come back ranked by coverage and then by how
deep their levels run. The ranking happens in the database as a single grouped
join-and-aggregate, not in a Python loop.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Profile, Skill, User, UserSkill
from ..schemas import PublicProfileOut
from ..skills_service import public_profiles_for

router = APIRouter(prefix="/api", tags=["search"])


def _ids_for(db: Session, names: list[str]) -> list[int]:
    if not names:
        return []
    return list(db.scalars(select(Skill.id).where(Skill.name.in_(names))).all())


def _free_text_filter(q: str):
    """The one definition of the free-text match.

    Matches username, full name, headline, or bio. Shared by both branches of
    the search so typing free text filters in every case, not only when skills
    are selected.
    """
    like = f"%{q}%"
    return or_(
        User.username.ilike(like),
        Profile.full_name.ilike(like),
        Profile.headline.ilike(like),
        Profile.bio.ilike(like),
    )


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
    skill_ids = _ids_for(db, skill)

    # No skill filter: behave like the directory, ordered by name, but still
    # honour the free-text query.
    if not skill_ids:
        stmt = select(User)
        if q:
            stmt = stmt.join(Profile, Profile.user_id == User.id).where(
                _free_text_filter(q)
            )
        users = db.scalars(
            stmt.order_by(User.username).limit(limit).offset(offset)
        ).all()
        profiles = public_profiles_for(db, [u.id for u in users])
        return [profiles[u.id] for u in users if u.id in profiles]

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
        stmt = stmt.join(Profile, Profile.user_id == User.id).where(
            _free_text_filter(q)
        )

    stmt = stmt.order_by(matched.desc(), depth.desc(), User.username)
    rows = db.execute(stmt.limit(limit).offset(offset)).all()

    # One batch read for the whole page, rather than a profile read per row.
    ranked_ids = [user_id for user_id, _matched, _depth in rows]
    profiles = public_profiles_for(db, ranked_ids)
    return [profiles[uid] for uid in ranked_ids if uid in profiles]
