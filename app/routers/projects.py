"""Projects, applications, memberships, and the project lifecycle.

This is where the invariants live in practice:

* Applying is refused if you already have an application (the unique
  constraint would reject it anyway, but a 409 is clearer than a 500).
* Only the owner sees the applicant list.
* Accepting or rejecting sets decided_at/decided_by and, on accept, the
  database trigger creates the membership row and enforces capacity.
* Status transitions follow OPEN -> FORMING -> ACTIVE -> CLOSED. FORMING and
  ACTIVE are derived from how full the roster is, so they are recomputed after
  any membership change rather than set by hand.
"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_current_user_optional
from ..database import get_db
from ..models import (
    Application,
    Membership,
    Project,
    ProjectSkill,
    ProjectUpdate,
    Skill,
    User,
)
from ..schemas import (
    ApplicantOut,
    ApplyIn,
    DecisionIn,
    MemberOut,
    ProjectDetailOut,
    ProjectIn,
    ProjectOut,
    ProjectSkillOut,
    ProjectUpdateIn,
    UpdateBodyIn,
    UpdateOut,
)
from ..skills_service import get_or_create_skill

router = APIRouter(prefix="/api/projects", tags=["projects"])

OPEN, FORMING, ACTIVE, CLOSED = "OPEN", "FORMING", "ACTIVE", "CLOSED"


def _member_count(db: Session, project_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(Membership.project_id == project_id)
        )
        or 0
    )


def _required_skills(db: Session, project_id: int) -> list[ProjectSkillOut]:
    rows = db.execute(
        select(ProjectSkill, Skill)
        .join(Skill, Skill.id == ProjectSkill.skill_id)
        .where(ProjectSkill.project_id == project_id)
        .order_by(Skill.name)
    ).all()
    return [
        ProjectSkillOut(skill_id=s.id, name=s.name, min_level=ps.min_level) for ps, s in rows
    ]


def _recompute_status(db: Session, project: Project) -> None:
    """Derive FORMING/ACTIVE from roster fullness; never touch CLOSED."""
    if project.status == CLOSED:
        return
    count = _member_count(db, project.id)
    if count >= project.capacity:
        project.status = ACTIVE
    elif count > 1:
        project.status = FORMING
    else:
        project.status = OPEN


def _project_out(db: Session, project: Project) -> ProjectOut:
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
        member_count=_member_count(db, project.id),
        required_skills=_required_skills(db, project.id),
    )


def _set_project_skills(db: Session, project_id: int, skills: list) -> None:
    db.execute(ProjectSkill.__table__.delete().where(ProjectSkill.project_id == project_id))
    seen: set[int] = set()
    for entry in skills:
        skill = get_or_create_skill(db, entry.name)
        if skill.id in seen:
            continue
        seen.add(skill.id)
        db.add(ProjectSkill(project_id=project_id, skill_id=skill.id, min_level=entry.min_level))
    db.flush()


@router.get("", response_model=list[ProjectOut])
def list_projects(
    skill: list[str] = Query(default=[]),
    q: str | None = None,
    open_only: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[ProjectOut]:
    stmt = select(Project)
    if open_only:
        stmt = stmt.where(Project.status.in_([OPEN, FORMING]))
    if skill:
        ids = select(Skill.id).where(Skill.name.in_(skill))
        stmt = stmt.where(
            Project.id.in_(select(ProjectSkill.project_id).where(ProjectSkill.skill_id.in_(ids)))
        )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Project.title.ilike(like) | Project.description.ilike(like))
    projects = db.scalars(
        stmt.order_by(Project.created_at.desc()).limit(limit).offset(offset)
    ).all()
    return [_project_out(db, p) for p in projects]


@router.post("", response_model=ProjectDetailOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectDetailOut:
    project = Project(
        owner_id=user.id,
        title=payload.title,
        description=payload.description,
        capacity=payload.capacity,
        status=OPEN,
    )
    db.add(project)
    db.flush()
    _set_project_skills(db, project.id, payload.skills)
    # The poster is the leader; the partial unique index guarantees only one.
    db.add(Membership(project_id=project.id, user_id=user.id, role="LEADER"))
    db.flush()
    _recompute_status(db, project)
    db.commit()
    db.refresh(project)
    return project_detail(project.id, user, db)


@router.get("/{project_id}", response_model=ProjectDetailOut)
def project_detail(
    project_id: int,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ProjectDetailOut:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="No such project")

    base = _project_out(db, project)
    is_owner = user is not None and user.id == project.owner_id

    members_rows = db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.project_id == project_id)
        .order_by(Membership.joined_at)
    ).all()
    members = [
        MemberOut(user_id=m.user_id, username=u.username, role=m.role, joined_at=m.joined_at)
        for m, u in members_rows
    ]

    updates: list[UpdateOut] = []
    for up in db.scalars(
        select(ProjectUpdate)
        .where(ProjectUpdate.project_id == project_id)
        .order_by(ProjectUpdate.created_at.desc())
    ).all():
        author = db.get(User, up.author_id)
        updates.append(
            UpdateOut(
                id=up.id,
                author_id=up.author_id,
                author_username=author.username if author else "?",
                body=up.body,
                created_at=up.created_at,
            )
        )

    applicants: list[ApplicantOut] | None = None
    if is_owner:
        rows = db.execute(
            select(Application, User)
            .join(User, User.id == Application.applicant_id)
            .where(Application.project_id == project_id)
            .order_by(Application.created_at)
        ).all()
        applicants = [
            ApplicantOut(
                application_id=a.id,
                user_id=a.applicant_id,
                username=u.username,
                message=a.message,
                status=a.status,
                created_at=a.created_at,
            )
            for a, u in rows
        ]

    my_application = None
    my_membership = None
    if user is not None:
        app_row = db.scalar(
            select(Application).where(
                Application.project_id == project_id, Application.applicant_id == user.id
            )
        )
        if app_row is not None:
            my_application = ApplicantOut(
                application_id=app_row.id,
                user_id=app_row.applicant_id,
                username=user.username,
                message=app_row.message,
                status=app_row.status,
                created_at=app_row.created_at,
            )
        mem_row = db.get(Membership, (project_id, user.id))
        if mem_row is not None:
            my_membership = MemberOut(
                user_id=mem_row.user_id,
                username=user.username,
                role=mem_row.role,
                joined_at=mem_row.joined_at,
            )

    return ProjectDetailOut(
        **base.model_dump(),
        members=members,
        updates=updates,
        applicants=applicants,
        my_application=my_application,
        my_membership=my_membership,
    )


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="No such project")
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can edit this project")

    data = payload.model_dump(exclude_unset=True)
    skills_given = "skills" in data
    data.pop("skills", None)
    for field, value in data.items():
        setattr(project, field, value)
    if skills_given:
        _set_project_skills(db, project_id, payload.skills or [])
    db.flush()
    _recompute_status(db, project)
    db.commit()
    db.refresh(project)
    return _project_out(db, project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="No such project")
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete this project")
    db.delete(project)
    db.commit()


# ---------- applications ----------


@router.post(
    "/{project_id}/apply",
    response_model=ApplicantOut,
    status_code=status.HTTP_201_CREATED,
)
def apply_to_project(
    project_id: int,
    payload: ApplyIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicantOut:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="No such project")
    if project.status == CLOSED:
        raise HTTPException(status_code=400, detail="This project is closed")
    if project.owner_id == user.id:
        raise HTTPException(status_code=400, detail="You already lead this project")
    if db.get(Membership, (project_id, user.id)) is not None:
        raise HTTPException(status_code=400, detail="You are already on this team")

    application = Application(
        project_id=project_id, applicant_id=user.id, message=payload.message, status="PENDING"
    )
    db.add(application)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="You have already applied to this project"
        ) from exc
    db.refresh(application)
    return ApplicantOut(
        application_id=application.id,
        user_id=user.id,
        username=user.username,
        message=application.message,
        status=application.status,
        created_at=application.created_at,
    )


@router.delete("/{project_id}/apply", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_application(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    application = db.scalar(
        select(Application).where(
            Application.project_id == project_id, Application.applicant_id == user.id
        )
    )
    if application is None:
        raise HTTPException(status_code=404, detail="You have not applied")
    if application.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only a pending application can be withdrawn")
    application.status = "WITHDRAWN"
    application.decided_at = dt.datetime.now(dt.UTC)
    db.commit()


@router.post("/{project_id}/applications/{application_id}/decide", response_model=ApplicantOut)
def decide_application(
    project_id: int,
    application_id: int,
    payload: DecisionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicantOut:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="No such project")
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can decide")

    application = db.get(Application, application_id)
    if application is None or application.project_id != project_id:
        raise HTTPException(status_code=404, detail="No such application")
    if application.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Already {application.status.lower()}")

    application.status = payload.status
    application.decided_at = dt.datetime.now(dt.UTC)
    application.decided_by = user.id
    try:
        # The trigger creates the membership on ACCEPT and enforces capacity,
        # raising a check_violation if the team is already full.
        db.flush()
        _recompute_status(db, project)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="That decision would exceed the team's capacity"
        ) from exc

    applicant = db.get(User, application.applicant_id)
    return ApplicantOut(
        application_id=application.id,
        user_id=application.applicant_id,
        username=applicant.username if applicant else "?",
        message=application.message,
        status=application.status,
        created_at=application.created_at,
    )


# ---------- team ----------


@router.delete("/{project_id}/members/me", status_code=status.HTTP_204_NO_CONTENT)
def leave_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="No such project")
    membership = db.get(Membership, (project_id, user.id))
    if membership is None:
        raise HTTPException(status_code=404, detail="You are not on this team")
    if membership.role == "LEADER":
        raise HTTPException(
            status_code=400,
            detail="The leader cannot leave; transfer leadership or close the project",
        )
    db.delete(membership)
    db.flush()
    _recompute_status(db, project)
    db.commit()


@router.post("/{project_id}/members/{username}/promote", response_model=MemberOut)
def transfer_leadership(
    project_id: int,
    username: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemberOut:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="No such project")
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the leader can transfer leadership")

    target = db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=404, detail="No such user")
    target_membership = db.get(Membership, (project_id, target.id))
    if target_membership is None:
        raise HTTPException(status_code=404, detail="That person is not on this team")

    # Demote the current leader first, otherwise the partial unique index would
    # reject a second LEADER row for this project.
    current = db.get(Membership, (project_id, user.id))
    if current is not None:
        current.role = "MEMBER"
        db.flush()
    target_membership.role = "LEADER"
    project.owner_id = target.id
    db.commit()
    return MemberOut(
        user_id=target.id,
        username=target.username,
        role="LEADER",
        joined_at=target_membership.joined_at,
    )


@router.post("/{project_id}/close", response_model=ProjectOut)
def close_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="No such project")
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the leader can close the project")
    project.status = CLOSED
    project.closed_at = dt.datetime.now(dt.UTC)
    db.commit()
    db.refresh(project)
    return _project_out(db, project)


# ---------- updates ----------


@router.post("/{project_id}/updates", response_model=UpdateOut, status_code=status.HTTP_201_CREATED)
def post_update(
    project_id: int,
    payload: UpdateBodyIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UpdateOut:
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="No such project")
    if db.get(Membership, (project_id, user.id)) is None:
        raise HTTPException(status_code=403, detail="Only team members can post updates")
    update = ProjectUpdate(project_id=project_id, author_id=user.id, body=payload.body)
    db.add(update)
    db.commit()
    db.refresh(update)
    return UpdateOut(
        id=update.id,
        author_id=user.id,
        author_username=user.username,
        body=update.body,
        created_at=update.created_at,
    )
