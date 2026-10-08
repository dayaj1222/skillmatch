"""The project lifecycle module.

Everything a caller needs to know about a project's *relationship to a person*
and its *derived status* lives here. The routers ask this module questions; they
do not re-derive the answers.

Two ideas are behind the interface:

* **Status is derived, never set.** OPEN -> FORMING -> ACTIVE is a function of
  how full the roster is. Only CLOSED is explicit. ``recompute_status`` is the
  one place that rule lives.
* **Membership is a relationship, not a lookup.** ``relationship_for`` answers
  "is this person the leader, a member, an applicant, or an outsider?" once,
  instead of every router testing ``owner_id == user.id`` and poking at
  ``Membership`` in its own way.

The capacity ceiling and accept-creates-membership invariants remain in the
database triggers (see ``triggers.py``); this module is the Python interface over
that behaviour, not a reimplementation of it.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Application, Membership, Project, ProjectSkill, Skill, User
from .schemas import ProjectOut, ProjectSkillOut

OPEN, FORMING, ACTIVE, CLOSED = "OPEN", "FORMING", "ACTIVE", "CLOSED"

# What a caller can be to a project, in precedence order.
LEADER = "LEADER"
MEMBER = "MEMBER"
APPLICANT = "APPLICANT"
INVITEE = "INVITEE"
OUTSIDER = "OUTSIDER"


@dataclass(frozen=True)
class Relationship:
    """A person's standing on one project, derived once.

    Callers read named facts instead of composing owner/member/application
    checks themselves. This is the module's smallest interface: one call, one
    object, every question answered.
    """

    is_leader: bool
    is_member: bool
    is_applicant: bool
    is_invitee: bool
    status: str  # LEADER | MEMBER | APPLICANT | INVITEE | OUTSIDER

    @property
    def is_outsider(self) -> bool:
        return self.status == OUTSIDER

    @property
    def is_on_team(self) -> bool:
        return self.is_leader or self.is_member

    @property
    def can_see_applicants(self) -> bool:
        """Only the leader sees who has applied."""
        return self.is_leader


def member_count(db: Session, project_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(Membership.project_id == project_id)
        )
        or 0
    )


def required_skills(db: Session, project_id: int) -> list[ProjectSkillOut]:
    rows = db.execute(
        select(ProjectSkill, Skill)
        .join(Skill, Skill.id == ProjectSkill.skill_id)
        .where(ProjectSkill.project_id == project_id)
        .order_by(Skill.name)
    ).all()
    return [
        ProjectSkillOut(skill_id=s.id, name=s.name, min_level=ps.min_level)
        for ps, s in rows
    ]


def recompute_status(db: Session, project: Project) -> None:
    """Derive FORMING/ACTIVE from roster fullness; never touch CLOSED.

    The one place the OPEN -> FORMING -> ACTIVE rule lives. Called after any
    membership change rather than set by hand.
    """
    if project.status == CLOSED:
        return
    count = member_count(db, project.id)
    if count >= project.capacity:
        project.status = ACTIVE
    elif count > 1:
        project.status = FORMING
    else:
        project.status = OPEN


def relationship_for(
    db: Session, project: Project, user: User | None
) -> Relationship:
    """Derive one person's standing on one project.

    The single seam every router crosses to answer "what can this person do
    here?". Precedence: a team role beats a pending row.
    """
    if user is None:
        return Relationship(False, False, False, False, OUTSIDER)

    membership = db.get(Membership, (project.id, user.id))
    if membership is not None:
        if membership.role == LEADER or project.owner_id == user.id:
            return Relationship(True, False, False, False, LEADER)
        return Relationship(False, True, False, False, MEMBER)

    application = db.scalar(
        select(Application).where(
            Application.project_id == project.id,
            Application.applicant_id == user.id,
        )
    )
    if application is not None and application.status == "PENDING":
        if application.initiated_by == "OWNER":
            return Relationship(False, False, False, True, INVITEE)
        return Relationship(False, False, True, False, APPLICANT)

    return Relationship(False, False, False, False, OUTSIDER)


def to_out(db: Session, project: Project) -> ProjectOut:
    """Project row as the summary shape every list and detail reuses."""
    owner = db.get(User, project.owner_id)
    return ProjectOut(
        id=project.id,
        owner_id=project.owner_id,
        owner_username=owner.username if owner else "?",
        title=project.title,
        description=project.description,
        capacity=project.capacity,
        status=project.status,
        created_at=project.created_at,
        member_count=member_count(db, project.id),
        required_skills=required_skills(db, project.id),
    )


def set_required_skills(db: Session, project_id: int, entries: list) -> None:
    """Replace a project's required skills atomically.

    Duplicate names collapse to one row, since the join table's primary key
    forbids two rows for one (project, skill) pair.
    """
    from .skills_service import get_or_create_skill  # local: avoids an import cycle

    db.execute(
        ProjectSkill.__table__.delete().where(ProjectSkill.project_id == project_id)
    )
    seen: set[int] = set()
    for entry in entries:
        skill = get_or_create_skill(db, entry.name)
        if skill.id in seen:
            continue
        seen.add(skill.id)
        db.add(
            ProjectSkill(
                project_id=project_id, skill_id=skill.id, min_level=entry.min_level
            )
        )
    db.flush()


def visible_project_ids(db: Session, user_id: int) -> list[int]:
    """Projects the user can see: led, on the team, or applied to.

    The scope of a person's world, used by the activity feed and the unread
    count. One definition rather than two.
    """
    ids: set[int] = set(
        db.scalars(select(Project.id).where(Project.owner_id == user_id)).all()
    )
    ids.update(
        db.scalars(
            select(Membership.project_id).where(Membership.user_id == user_id)
        ).all()
    )
    ids.update(
        db.scalars(
            select(Application.project_id).where(Application.applicant_id == user_id)
        ).all()
    )
    return list(ids)


def require_member(db: Session, project_id: int, user_id: int) -> Membership:
    """Fetch a membership or raise the shared 403.

    One copy of the guard, not one per router.
    """
    from fastapi import HTTPException

    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="No such project")
    membership = db.get(Membership, (project_id, user_id))
    if membership is None:
        raise HTTPException(status_code=403, detail="Only team members can do that")
    return membership


__all__ = [
    "ACTIVE",
    "APPLICANT",
    "CLOSED",
    "FORMING",
    "INVITEE",
    "LEADER",
    "MEMBER",
    "OPEN",
    "OUTSIDER",
    "Relationship",
    "member_count",
    "recompute_status",
    "relationship_for",
    "require_member",
    "required_skills",
    "set_required_skills",
    "to_out",
    "visible_project_ids",
]
