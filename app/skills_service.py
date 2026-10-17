"""Skill vocabulary, per-person skill sets, and endorsement counts."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .models import Endorsement, Profile, Skill, SkillCategory, User, UserSkill
from .schemas import ProfileSkillOut, PublicProfileOut


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


def endorsement_counts_for_many(db: Session, user_ids: list[int]) -> dict[int, dict[int, int]]:
    """Map user_id -> {skill_id: endorsement count} for a whole page at once.

    The batch form of ``endorsement_counts_for``. One query instead of N, so a
    search result page does not fan out into a query per row.
    """
    if not user_ids:
        return {}
    rows = db.execute(
        select(Endorsement.user_id, Endorsement.skill_id, func.count())
        .where(Endorsement.user_id.in_(user_ids))
        .group_by(Endorsement.user_id, Endorsement.skill_id)
    ).all()
    out: dict[int, dict[int, int]] = {}
    for user_id, skill_id, count in rows:
        out.setdefault(user_id, {})[skill_id] = count
    return out


def profile_skills_for(db: Session, user_id: int) -> list[ProfileSkillOut]:
    """A person's skills with category and endorsement count, best first."""
    return profile_skills_for_many(db, [user_id]).get(user_id, [])


def profile_skills_for_many(
    db: Session, user_ids: list[int]
) -> dict[int, list[ProfileSkillOut]]:
    """Batch form of ``profile_skills_for``: one skill read for a page of people.

    Deepens the profile read: callers pass a list of ids, the module does the
    joining, ordering, and endorsement counting, and returns complete skill
    lists keyed by user. The interface is small; the implementation absorbs the
    work that used to loop in the router.
    """
    if not user_ids:
        return {}
    counts_by_user = endorsement_counts_for_many(db, user_ids)
    rows = db.execute(
        select(UserSkill, Skill)
        .options(selectinload(Skill.category))
        .join(Skill, Skill.id == UserSkill.skill_id)
        .where(UserSkill.user_id.in_(user_ids))
        .order_by(UserSkill.user_id, UserSkill.level.desc(), Skill.name)
    ).all()
    out: dict[int, list[ProfileSkillOut]] = {}
    counts = counts_by_user
    for us, skill in rows:
        out.setdefault(us.user_id, []).append(
            ProfileSkillOut(
                skill_id=skill.id,
                name=skill.name,
                category=skill.category.name if skill.category else None,
                level=us.level,
                years=us.years,
                endorsements=counts.get(us.user_id, {}).get(skill.id, 0),
            )
        )
    return out


def public_profiles_for(db: Session, user_ids: list[int]) -> dict[int, PublicProfileOut]:
    """Assemble public profiles for a page of users in one pass.

    Reads users, their profile rows, and their skills as a batch, rather than
    calling a single-user reader per row. Endorsement counts and skill lists
    come from the batch helpers above.
    """
    if not user_ids:
        return {}
    users = db.scalars(select(User).where(User.id.in_(user_ids))).all()
    profiles = {
        p.user_id: p
        for p in db.scalars(select(Profile).where(Profile.user_id.in_(user_ids))).all()
    }
    skills = profile_skills_for_many(db, user_ids)

    out: dict[int, PublicProfileOut] = {}
    for user in users:
        profile = profiles.get(user.id)
        out[user.id] = PublicProfileOut(
            id=user.id,
            username=user.username,
            full_name=profile.full_name if profile else None,
            headline=profile.headline if profile else None,
            branch=profile.branch if profile else None,
            year=profile.year if profile else None,
            location=profile.location if profile else None,
            bio=profile.bio if profile else None,
            contact_link=profile.contact_link if profile else None,
            avatar_url=profile.avatar_url if profile else None,
            upi_id=profile.upi_id if profile else None,
            hourly_rate=(
                float(profile.hourly_rate)
                if profile and profile.hourly_rate is not None
                else None
            ),
            skills=skills.get(user.id, []),
        )
    return out


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
