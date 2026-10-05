"""Profile read/write, skill sets, endorsements, and people browsing."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Endorsement, Profile, Skill, User, UserSkill
from ..schemas import (
    ProfileIn,
    ProfileOut,
    ProfileSkillOut,
    PublicProfileOut,
    SkillSetIn,
)
from ..skills_service import endorsement_counts_for, replace_user_skills

router = APIRouter(prefix="/api", tags=["profiles"])


def _profile_skills(db: Session, user_id: int) -> list[ProfileSkillOut]:
    """A person's skills with category and endorsement count, best first."""
    counts = endorsement_counts_for(db, user_id)
    rows = db.execute(
        select(UserSkill, Skill)
        .join(Skill, Skill.id == UserSkill.skill_id)
        .where(UserSkill.user_id == user_id)
        .order_by(UserSkill.level.desc(), Skill.name)
    ).all()
    out: list[ProfileSkillOut] = []
    for us, skill in rows:
        out.append(
            ProfileSkillOut(
                skill_id=skill.id,
                name=skill.name,
                category=skill.category.name if skill.category else None,
                level=us.level,
                years=us.years,
                endorsements=counts.get(skill.id, 0),
            )
        )
    return out


@router.get("/profile", response_model=ProfileOut)
def my_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Profile:
    profile = db.get(Profile, user.id)
    if profile is None:
        profile = Profile(user_id=user.id)
        db.add(profile)
        db.commit()
    return profile


@router.put("/profile", response_model=ProfileOut)
def update_profile(
    payload: ProfileIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Profile:
    profile = db.get(Profile, user.id)
    if profile is None:
        profile = Profile(user_id=user.id)
        db.add(profile)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile


@router.put("/profile/skills", response_model=list[ProfileSkillOut])
def set_skills(
    payload: SkillSetIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ProfileSkillOut]:
    replace_user_skills(db, user.id, [(s.name, s.level, s.years) for s in payload.skills])
    db.commit()
    return _profile_skills(db, user.id)


@router.get("/profile/{username}", response_model=PublicProfileOut)
def public_profile(username: str, db: Session = Depends(get_db)) -> PublicProfileOut:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=404, detail="No such user")
    profile = db.get(Profile, user.id)
    return PublicProfileOut(
        id=user.id,
        username=user.username,
        full_name=profile.full_name if profile else None,
        headline=profile.headline if profile else None,
        branch=profile.branch if profile else None,
        year=profile.year if profile else None,
        location=profile.location if profile else None,
        bio=profile.bio if profile else None,
        contact_link=profile.contact_link if profile else None,
        skills=_profile_skills(db, user.id),
    )


@router.post("/profile/{username}/endorse/{skill_id}", status_code=status.HTTP_201_CREATED)
def endorse(
    username: str,
    skill_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    target = db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=404, detail="No such user")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="You cannot endorse yourself")

    # The FK to user_skills would reject an endorsement of a skill the person
    # does not list; check first so the client gets a clear 404 instead of a
    # constraint violation.
    listed = db.scalar(
        select(UserSkill).where(
            UserSkill.user_id == target.id, UserSkill.skill_id == skill_id
        )
    )
    if listed is None:
        raise HTTPException(status_code=404, detail="That skill is not on their profile")

    exists = db.get(Endorsement, (user.id, target.id, skill_id))
    if exists is None:
        db.add(Endorsement(endorser_id=user.id, user_id=target.id, skill_id=skill_id))
        db.commit()
    return {"ok": True}


@router.delete("/profile/{username}/endorse/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def unendorse(
    username: str,
    skill_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    target = db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=404, detail="No such user")
    row = db.get(Endorsement, (user.id, target.id, skill_id))
    if row is not None:
        db.delete(row)
        db.commit()


@router.get("/people", response_model=list[PublicProfileOut])
def people(
    skill: list[str] = Query(default=[]),
    q: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[PublicProfileOut]:
    """Browse everyone, optionally filtered by skill names and free text."""
    stmt = select(User)
    if skill:
        skill_ids = select(Skill.id).where(Skill.name.in_(skill))
        stmt = stmt.where(
            User.id.in_(select(UserSkill.user_id).where(UserSkill.skill_id.in_(skill_ids)))
        )
    if q:
        like = f"%{q}%"
        stmt = stmt.join(Profile, Profile.user_id == User.id).where(
            Profile.full_name.ilike(like)
            | Profile.headline.ilike(like)
            | Profile.bio.ilike(like)
            | User.username.ilike(like)
        )
    users = db.scalars(stmt.order_by(User.username).limit(limit).offset(offset)).all()
    return [public_profile(u.username, db) for u in users]
