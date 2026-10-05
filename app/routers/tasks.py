"""Project tasks and the board.

Membership is checked on every write: only someone on the team may create, move,
assign, or delete a card. The database trigger additionally refuses assigning a
task to a non-member, so a bug here cannot produce an inconsistent board.
"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Membership, Project, Task, User
from ..schemas import BoardOut, TaskIn, TaskOut, TaskUpdateIn

router = APIRouter(prefix="/api/projects/{project_id}/tasks", tags=["tasks"])

TODO, DOING, DONE = "TODO", "DOING", "DONE"


def _require_member(db: Session, project_id: int, user_id: int) -> Membership:
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="No such project")
    membership = db.get(Membership, (project_id, user_id))
    if membership is None:
        raise HTTPException(status_code=403, detail="Only team members can do that")
    return membership


def _task_out(db: Session, task: Task) -> TaskOut:
    assignee = db.get(User, task.assignee_id) if task.assignee_id else None
    return TaskOut(
        id=task.id,
        project_id=task.project_id,
        title=task.title,
        description=task.description,
        status=task.status,
        assignee_id=task.assignee_id,
        assignee_username=assignee.username if assignee else None,
        position=task.position,
        created_by=task.created_by,
        created_at=task.created_at,
        completed_at=task.completed_at,
    )


def _next_position(db: Session, project_id: int, column: str) -> int:
    current = db.scalar(
        select(func.coalesce(func.max(Task.position), -1)).where(
            Task.project_id == project_id, Task.status == column
        )
    )
    return int(current) + 1


@router.get("", response_model=BoardOut)
def get_board(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BoardOut:
    _require_member(db, project_id, user.id)
    board = BoardOut()
    tasks = db.scalars(
        select(Task).where(Task.project_id == project_id).order_by(Task.position, Task.id)
    ).all()
    for t in tasks:
        getattr(board, t.status).append(_task_out(db, t))
    return board


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id: int,
    payload: TaskIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TaskOut:
    _require_member(db, project_id, user.id)
    task = Task(
        project_id=project_id,
        title=payload.title,
        description=payload.description,
        assignee_id=payload.assignee_id,
        status=TODO,
        position=_next_position(db, project_id, TODO),
        created_by=user.id,
    )
    db.add(task)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="That person is not on this team") from exc
    db.refresh(task)
    return _task_out(db, task)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    project_id: int,
    task_id: int,
    payload: TaskUpdateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TaskOut:
    _require_member(db, project_id, user.id)
    task = db.get(Task, task_id)
    if task is None or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="No such task")

    data = payload.model_dump(exclude_unset=True)

    new_status = data.get("status")
    if new_status is not None and new_status != task.status:
        if "position" not in data:
            data["position"] = _next_position(db, project_id, new_status)
        if new_status == DONE:
            task.completed_at = dt.datetime.now(dt.UTC)
        else:
            task.completed_at = None

    for field, value in data.items():
        setattr(task, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="That person is not on this team") from exc
    db.refresh(task)
    return _task_out(db, task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    project_id: int,
    task_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    _require_member(db, project_id, user.id)
    task = db.get(Task, task_id)
    if task is None or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="No such task")
    db.delete(task)
    db.commit()
