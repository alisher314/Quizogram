from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_user
from .. import models

router = APIRouter(prefix="/api/v1/follow", tags=["follow"])

@router.post("/{username}")
def follow_user(
    username: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.username == username:
        raise HTTPException(status_code=400, detail="Нельзя подписаться на себя")

    target = db.query(models.User).filter(models.User.username == username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    exists = (
        db.query(models.Follow)
        .filter(models.Follow.follower_id == current_user.id,
                models.Follow.following_id == target.id)
        .first()
    )
    if exists:
        return {"status": "already_following"}

    link = models.Follow(follower_id=current_user.id, following_id=target.id)
    db.add(link)
    db.commit()
    return {"status": "ok"}

@router.delete("/{username}")
def unfollow_user(
    username: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    target = db.query(models.User).filter(models.User.username == username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    q = (
        db.query(models.Follow)
        .filter(models.Follow.follower_id == current_user.id,
                models.Follow.following_id == target.id)
    )
    if not q.first():
        return {"status": "not_following"}

    q.delete()
    db.commit()
    return {"status": "ok"}
