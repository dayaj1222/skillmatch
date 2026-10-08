"""Home dashboard, activity feed, my-stuff, and direct invites.

Everything here reads the ``activity`` table that database triggers populate, so
the feed cannot drift from reality: if an application was accepted, the trigger
wrote the row.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import applications_service as applications
from ..auth import get_current_user
from ..database import get_db
from ..models import (
    Activity,
    Application,
    Endorsement,
    Membership,
    Profile,
    Project,
    Task,
    User,
    UserSkill,
)
from ..projects_service import visible_project_ids
from ..schemas import (
    ActivityOut,
    DashboardOut,
    InviteIn,
    MyApplicationOut,
    MyProjectOut,
    StatsOut,
)

router = APIRouter(prefix="/api", tags=["dashboard"])


def _activity_out(db: Session, row: Activity) -> ActivityOut:
    actor = db.get(User, row.actor_id) if row.actor_id else None
    subject = db.get(User, row.subject_user_id) if row.subject_user_id else None
    project = db.get(Project, row.project_id) if row.project_id else None
    return ActivityOut(
        id=row.id,
        kind=row.kind,
        actor_id=row.actor_id,
        actor_username=actor.username if actor else None,
        subject_user_id=row.subject_user_id,
        subject_username=subject.username if subject else None,
        project_id=row.project_id,
        project_title=project.title if project else None,
        detail=row.detail,
        created_at=row.created_at,
    )


@router.get("/activity", response_model=list[ActivityOut])
def activity_feed(
    limit: int = 30,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ActivityOut]:
    """Everything happening in the user's world.

    An event is visible when the user is involved in it: they acted, they are the
    subject, or it happened on a project they lead, joined, or applied to.
    """
    project_ids = visible_project_ids(db, user.id)
    conditions = [Activity.actor_id == user.id, Activity.subject_user_id == user.id]
    if project_ids:
        conditions.append(Activity.project_id.in_(project_ids))

    rows = db.scalars(
        select(Activity)
        .where(or_(*conditions))
        .order_by(Activity.created_at.desc())
        .limit(min(limit, 100))
    ).all()
    return [_activity_out(db, a) for a in rows]


@router.get("/me/projects", response_model=list[MyProjectOut])
def my_projects(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MyProjectOut]:
    """Projects the user leads or is a member of, with task counts for the card."""
    rows = db.execute(
        select(Membership, Project)
        .join(Project, Project.id == Membership.project_id)
        .where(Membership.user_id == user.id)
        .order_by(Project.created_at.desc())
    ).all()

    out: list[MyProjectOut] = []
    for membership, project in rows:
        total = (
            db.scalar(select(func.count()).select_from(Task).where(Task.project_id == project.id))
            or 0
        )
        open_tasks = (
            db.scalar(
                select(func.count())
                .select_from(Task)
                .where(Task.project_id == project.id, Task.status != "DONE")
            )
            or 0
        )
        member_count = (
            db.scalar(
                select(func.count())
                .select_from(Membership)
                .where(Membership.project_id == project.id)
            )
            or 0
        )
        out.append(
            MyProjectOut(
                id=project.id,
                title=project.title,
                status=project.status,
                role=membership.role,
                member_count=member_count,
                capacity=project.capacity,
                open_tasks=open_tasks,
                total_tasks=total,
            )
        )
    return out


@router.get("/me/applications", response_model=list[MyApplicationOut])
def my_applications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MyApplicationOut]:
    rows = db.execute(
        select(Application, Project)
        .join(Project, Project.id == Application.project_id)
        .where(Application.applicant_id == user.id)
        .order_by(Application.created_at.desc())
    ).all()
    return [
        MyApplicationOut(
            application_id=a.id,
            project_id=p.id,
            project_title=p.title,
            status=a.status,
            created_at=a.created_at,
        )
        for a, p in rows
    ]


def _stats(db: Session, user: User) -> StatsOut:
    projects_led = (
        db.scalar(select(func.count()).select_from(Project).where(Project.owner_id == user.id)) or 0
    )
    teams_joined = (
        db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(Membership.user_id == user.id, Membership.role == "MEMBER")
        )
        or 0
    )
    pending = (
        db.scalar(
            select(func.count())
            .select_from(Application)
            .where(Application.applicant_id == user.id, Application.status == "PENDING")
        )
        or 0
    )
    endorsements = (
        db.scalar(
            select(func.count())
            .select_from(Endorsement)
            .where(Endorsement.user_id == user.id)
        )
        or 0
    )
    open_assigned = (
        db.scalar(
            select(func.count())
            .select_from(Task)
            .where(Task.assignee_id == user.id, Task.status != "DONE")
        )
        or 0
    )

    profile = db.get(Profile, user.id)
    filled = 0
    if profile:
        filled = sum(
            1
            for v in (
                profile.full_name,
                profile.headline,
                profile.branch,
                profile.year,
                profile.bio,
            )
            if v
        )
    skill_count = (
        db.scalar(select(func.count()).select_from(UserSkill).where(UserSkill.user_id == user.id))
        or 0
    )
    skill_bonus = 20 if skill_count >= 3 else int((skill_count / 3) * 20)
    completeness = int((filled / 5) * 80) + skill_bonus

    since = datetime.now(UTC) - timedelta(days=7)
    project_ids = visible_project_ids(db, user.id)
    unread_conditions = [Activity.subject_user_id == user.id]
    if project_ids:
        unread_conditions.append(Activity.project_id.in_(project_ids))
    unread = (
        db.scalar(
            select(func.count())
            .select_from(Activity)
            .where(
                Activity.created_at >= since,
                Activity.actor_id != user.id,
                or_(*unread_conditions),
            )
        )
        or 0
    )

    return StatsOut(
        projects_led=projects_led,
        teams_joined=teams_joined,
        applications_pending=pending,
        endorsements_received=endorsements,
        tasks_assigned_open=open_assigned,
        profile_completeness=min(completeness, 100),
        unread_activity=unread,
    )


@router.get("/me/stats", response_model=StatsOut)
def my_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StatsOut:
    return _stats(db, user)


@router.get("/me/dashboard", response_model=DashboardOut)
def dashboard(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DashboardOut:
    stats = _stats(db, user)

    led_ids = list(db.scalars(select(Project.id).where(Project.owner_id == user.id)).all())
    attention: list[ActivityOut] = []
    if led_ids:
        rows = db.scalars(
            select(Activity)
            .where(Activity.project_id.in_(led_ids), Activity.kind == "APPLIED")
            .order_by(Activity.created_at.desc())
            .limit(10)
        ).all()
        attention = [_activity_out(db, a) for a in rows]

    recent = activity_feed(limit=20, user=user, db=db)
    return DashboardOut(stats=stats, needs_attention=attention, recent_activity=recent)


@router.post("/projects/{project_id}/invite", status_code=status.HTTP_201_CREATED)
def invite(
    project_id: int,
    payload: InviteIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Owner invites a named person. The inverse of applying.

    Stored as an application so there is one state machine, not two. The invitee
    sees it and can accept it through the normal decide path.
    """
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="No such project")

    # Stored as a PENDING, owner-initiated application so the activity trigger
    # announces it as INVITED rather than APPLIED. The module owns the row.
    application = applications.invite(db, project, user, payload.username, payload.message)
    return {"ok": True, "application_id": application.id}
