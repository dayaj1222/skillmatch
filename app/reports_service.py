"""Reports for users/projects."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Report, User


def create(
    db: Session,
    reporter: User,
    reported_username: str | None,
    project_id: int | None,
    reason: str,
    details: str | None,
) -> Report:
    reported_id = None
    if reported_username:
        u = db.scalar(select(User).where(User.username == reported_username))
        if u is None:
            raise HTTPException(status_code=404, detail="No such user")
        reported_id = u.id
        if reported_id == reporter.id:
            raise HTTPException(status_code=400, detail="You cannot report yourself")
    if project_id is not None:
        from .models import Project

        if db.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="No such project")
    report = Report(
        reporter_id=reporter.id,
        reported_user_id=reported_id,
        project_id=project_id,
        reason=reason,
        details=details,
        status="OPEN",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def list_mine(db: Session, user_id: int) -> list[Report]:
    stmt = select(Report).where(Report.reporter_id == user_id).order_by(Report.created_at.desc())
    return list(db.scalars(stmt).all())


__all__ = ["create", "list_mine"]
