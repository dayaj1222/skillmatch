"""Project comments. Team members can read and post; the thread is one level deep."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Membership, Project, ProjectComment, User
from ..schemas import CommentIn, CommentOut

router = APIRouter(prefix="/api/projects/{project_id}/comments", tags=["comments"])


def _require_member(db: Session, project_id: int, user_id: int) -> None:
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="No such project")
    if db.get(Membership, (project_id, user_id)) is None:
        raise HTTPException(status_code=403, detail="Only team members can do that")


def _build_thread(db: Session, project_id: int) -> list[CommentOut]:
    rows = db.execute(
        select(ProjectComment, User)
        .join(User, User.id == ProjectComment.author_id)
        .where(ProjectComment.project_id == project_id)
        .order_by(ProjectComment.created_at)
    ).all()

    roots: dict[int, CommentOut] = {}
    ordered: list[CommentOut] = []
    for comment, author in rows:
        node = CommentOut(
            id=comment.id,
            project_id=comment.project_id,
            author_id=comment.author_id,
            author_username=author.username,
            parent_id=comment.parent_id,
            body=comment.body,
            created_at=comment.created_at,
            replies=[],
        )
        if comment.parent_id is None:
            roots[comment.id] = node
            ordered.append(node)
        else:
            parent = roots.get(comment.parent_id)
            if parent is not None:
                parent.replies.append(node)
    return ordered


@router.get("", response_model=list[CommentOut])
def list_comments(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CommentOut]:
    _require_member(db, project_id, user.id)
    return _build_thread(db, project_id)


@router.post("", response_model=list[CommentOut], status_code=status.HTTP_201_CREATED)
def post_comment(
    project_id: int,
    payload: CommentIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CommentOut]:
    _require_member(db, project_id, user.id)

    if payload.parent_id is not None:
        parent = db.get(ProjectComment, payload.parent_id)
        if parent is None or parent.project_id != project_id:
            raise HTTPException(status_code=404, detail="No such comment to reply to")

    db.add(
        ProjectComment(
            project_id=project_id,
            author_id=user.id,
            parent_id=payload.parent_id,
            body=payload.body,
        )
    )
    try:
        db.commit()
    except Exception as exc:  # noqa: BLE001 - the flat-thread trigger speaks here
        db.rollback()
        raise HTTPException(
            status_code=400, detail="Replies cannot be nested more than one level"
        ) from exc
    return _build_thread(db, project_id)
