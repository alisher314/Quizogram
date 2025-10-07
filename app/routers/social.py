from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from .. import models
from ..deps import get_db, get_current_user
from ..schemas import FeedItem

router = APIRouter(prefix="/api/v1/social", tags=["social"])

# ---------- FOLLOW / UNFOLLOW ----------

@router.post("/follow/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def follow_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")

    # проверим, что пользователь существует
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # idempotent: если уже есть запись — ок
    exists = (
        db.query(models.Follow)
        .filter(models.Follow.follower_id == current_user.id, models.Follow.following_id == user_id)
        .first()
    )
    if not exists:
        db.add(models.Follow(follower_id=current_user.id, following_id=user_id))
        db.commit()

@router.delete("/follow/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    row = (
        db.query(models.Follow)
        .filter(models.Follow.follower_id == current_user.id, models.Follow.following_id == user_id)
        .first()
    )
    if row:
        db.delete(row)
        db.commit()

# ---------- LIKE / UNLIKE ----------

@router.post("/like/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
def like_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz = db.query(models.Quiz).filter(models.Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    exists = (
        db.query(models.Like)
        .filter(models.Like.user_id == current_user.id, models.Like.quiz_id == quiz_id)
        .first()
    )
    if not exists:
        db.add(models.Like(user_id=current_user.id, quiz_id=quiz_id))
        db.commit()

@router.delete("/like/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlike_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    row = (
        db.query(models.Like)
        .filter(models.Like.user_id == current_user.id, models.Like.quiz_id == quiz_id)
        .first()
    )
    if row:
        db.delete(row)
        db.commit()

# ---------- FEED ----------

@router.get("/feed", response_model=List[FeedItem])
def feed(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """
    Лента = квизы от людей, на кого ты подписан, + твои собственные.
    Сортировка простая: по id убыв. (можно заменить на created_at, если добавишь поле)
    """

    # 1) кого я читаю
    following_ids = [
        f.following_id
        for f in db.query(models.Follow).filter(models.Follow.follower_id == current_user.id).all()
    ]
    # добавим себя, чтобы видеть свои квизы
    author_ids = set(following_ids + [current_user.id])

    if not author_ids:
        return []

    # 2) субзапрос: количество лайков по квизу
    like_counts_subq = (
        db.query(
            models.Like.quiz_id.label("quiz_id"),
            func.count(models.Like.id).label("like_count"),
        )
        .group_by(models.Like.quiz_id)
        .subquery()
    )

    # 3) субзапрос: лайкал ли текущий пользователь
    liked_by_me_subq = (
        db.query(
            models.Like.quiz_id.label("quiz_id"),
            func.count(models.Like.id).label("cnt"),
        )
        .filter(models.Like.user_id == current_user.id)
        .group_by(models.Like.quiz_id)
        .subquery()
    )

    # 4) сами квизы авторов, с лефт-джойнами на лайки
    q = (
        db.query(
            models.Quiz.id.label("quiz_id"),
            models.Quiz.title,
            models.Quiz.description,
            models.Quiz.owner_id,
            models.User.username.label("owner_username"),
            func.coalesce(like_counts_subq.c.like_count, 0).label("like_count"),
            func.coalesce(liked_by_me_subq.c.cnt, 0).label("is_liked_by_me_raw"),
        )
        .join(models.User, models.User.id == models.Quiz.owner_id)
        .outerjoin(like_counts_subq, like_counts_subq.c.quiz_id == models.Quiz.id)
        .outerjoin(liked_by_me_subq, liked_by_me_subq.c.quiz_id == models.Quiz.id)
        .filter(models.Quiz.owner_id.in_(author_ids))
        .order_by(models.Quiz.id.desc())
        .offset(skip)
        .limit(limit)
    )

    rows = q.all()

    return [
        FeedItem(
            quiz_id=r.quiz_id,
            title=r.title,
            description=r.description,
            owner_id=r.owner_id,
            owner_username=r.owner_username,
            like_count=int(r.like_count or 0),
            is_liked_by_me=bool(r.is_liked_by_me_raw),
        )
        for r in rows
    ]
