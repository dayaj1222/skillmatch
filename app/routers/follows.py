from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..follows_service import follow, followers, following, unfollow
from ..models import User
from ..schemas import FollowOut

router = APIRouter(prefix="/api/follows", tags=["follows"])


@router.post("/{username}", status_code=status.HTTP_204_NO_CONTENT)
def follow_user(
    username: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    follow(db, user, username)


@router.delete("/{username}", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_user(
    username: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    unfollow(db, user, username)


@router.get("/{username}/followers", response_model=list[FollowOut])
def list_followers(
    username: str,
    db: Session = Depends(get_db),
) -> list[FollowOut]:
    return [FollowOut(username=u.username) for u in followers(db, username)]


@router.get("/{username}/following", response_model=list[FollowOut])
def list_following(
    username: str,
    db: Session = Depends(get_db),
) -> list[FollowOut]:
    return [FollowOut(username=u.username) for u in following(db, username)]
