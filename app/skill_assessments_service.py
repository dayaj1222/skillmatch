"""Owner skill assessments after a project closes."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Endorsement, Membership, Project, Skill, SkillAssessment, User


def assess(
    db: Session,
    rater: User,
    project_id: int,
    ratee_username: str,
    skill_name: str,
    score: int,
    comment: str | None = None,
) -> SkillAssessment:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="No such project")
    if project.owner_id != rater.id:
        raise HTTPException(
            status_code=403, detail="Only the project owner can assess skills"
        )
    if project.status != "CLOSED":
        raise HTTPException(
            status_code=400,
            detail="Assessments are allowed only after the project is closed",
        )

    ratee = db.scalar(select(User).where(User.username == ratee_username))
    if ratee is None:
        raise HTTPException(status_code=404, detail="No such user")
    if ratee.id == rater.id:
        raise HTTPException(status_code=400, detail="You cannot assess yourself")
    if db.get(Membership, (project_id, ratee.id)) is None and project.owner_id != ratee.id:
        raise HTTPException(status_code=400, detail="That person is not on this team")

    skill = db.scalar(select(Skill).where(Skill.name == skill_name.strip()))
    if skill is None:
        skill = Skill(name=skill_name.strip())
        db.add(skill)
        db.flush()

    existing = db.scalar(
        select(SkillAssessment).where(
            SkillAssessment.project_id == project_id,
            SkillAssessment.rater_id == rater.id,
            SkillAssessment.ratee_id == ratee.id,
            SkillAssessment.skill_id == skill.id,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=409, detail="You already assessed this skill for this person"
        )

    assessment = SkillAssessment(
        project_id=project_id,
        rater_id=rater.id,
        ratee_id=ratee.id,
        skill_id=skill.id,
        score=score,
        comment=comment,
    )
    db.add(assessment)

    # Reflect as an endorsement on the profile.
    end = db.get(Endorsement, (rater.id, ratee.id, skill.id))
    if end is None:
        db.add(Endorsement(endorser_id=rater.id, user_id=ratee.id, skill_id=skill.id))

    db.commit()
    db.refresh(assessment)
    return assessment


__all__ = ["assess"]
