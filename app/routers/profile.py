from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from typing import List

from .. import models
from ..deps import get_db, get_current_user
from ..schemas import ProfileOut, ProfileUpdate, AvatarOption

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])

# Доступные 8-битные аватарки (должны лежать в app/static/avatars)
ALLOWED_AVATARS = [
    "8bit_default.png",
    "8bit_knight.png",
    "8bit_mage.png",
    "8bit_archer.png",
    "8bit_robot.png",
    "8bit_alien.png",
]


def avatar_url(request: Request, key: str) -> str:
    base = str(request.base_url).rstrip("/")
    return f"{base}/static/avatars/{key}"


def get_or_create_profile(db: Session, user_id: int) -> models.Profile:
    prof = db.query(models.Profile).filter(models.Profile.user_id == user_id).first()
    if prof:
        return prof
    prof = models.Profile(user_id=user_id, avatar_key="8bit_default.png", bio=None)
    db.add(prof)
    db.commit()
    db.refresh(prof)
    return prof


@router.get("/me")
def get_my_profile(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Возвращает профиль текущего пользователя в «инста»-формате:
    - username
    - bio
    - avatar_url
    - quiz_count
    - followers / following (пока заглушки = 0)
    - quizzes: список моих квизов (id, title, description)
    """
    prof = get_or_create_profile(db, current_user.id)

    # Кол-во созданных квизов
    quiz_count = (
        db.query(models.Quiz)
        .filter(models.Quiz.owner_id == current_user.id)
        .count()
    )

    followers = db.query(models.Follow).filter(models.Follow.following_id == current_user.id).count()
    following = db.query(models.Follow).filter(models.Follow.follower_id == current_user.id).count()

    # Список моих квизов
    my_quizzes = (
        db.query(models.Quiz)
        .filter(models.Quiz.owner_id == current_user.id)
        .order_by(models.Quiz.id.desc())
        .all()
    )

    return {
        "username": current_user.username,
        "bio": prof.bio,
        "avatar_url": avatar_url(request, prof.avatar_key),
        "quiz_count": quiz_count,
        "followers": followers,
        "following": following,
        "quizzes": [
            {
                "id": q.id,
                "title": q.title,
                "description": q.description or "",
            }
            for q in my_quizzes
        ],
    }


@router.patch("/me", response_model=ProfileOut)
def update_my_profile(
    request: Request,
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Обновление био и аватарки (из ALLOWED_AVATARS).
    Возвращает компактную модель ProfileOut, которую уже использует фронт.
    """
    prof = get_or_create_profile(db, current_user.id)

    if payload.bio is not None:
        prof.bio = payload.bio.strip() if payload.bio else None

    if payload.avatar_key is not None:
        if payload.avatar_key not in ALLOWED_AVATARS:
            raise HTTPException(status_code=400, detail="Invalid avatar_key")
        prof.avatar_key = payload.avatar_key

    db.add(prof)
    db.commit()
    db.refresh(prof)

    return ProfileOut(
        user_id=current_user.id,
        bio=prof.bio,
        avatar_url=avatar_url(request, prof.avatar_key),
    )


@router.get("/avatars", response_model=List[AvatarOption])
def list_avatars(request: Request) -> List[AvatarOption]:
    """
    Возвращает список доступных встроенных 8-битных аватаров.
    """
    return [AvatarOption(key=k, url=avatar_url(request, k)) for k in ALLOWED_AVATARS]

@router.get("/search_users")
def search_users(
    request: Request,
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Кейс-инсensitive поиск (ilike эмулируется SQLAlchemy и на SQLite)
    users = (
        db.query(models.User)
        .filter(models.User.username.ilike(f"%{q}%"))
        .order_by(models.User.username.asc())
        .limit(20)
        .all()
    )
    results = []
    for u in users:
        p = get_or_create_profile(db, u.id)
        results.append({
            "username": u.username,
            "avatar_url": avatar_url(request, p.avatar_key),
        })
    return {"results": results}

@router.get("/user/{username}")
def get_user_profile_public(
    username: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    prof = get_or_create_profile(db, user.id)

    quiz_count = db.query(models.Quiz).filter(models.Quiz.owner_id == user.id).count()
    followers = db.query(models.Follow).filter(models.Follow.following_id == user.id).count()
    following = db.query(models.Follow).filter(models.Follow.follower_id == user.id).count()

    quizzes = (
        db.query(models.Quiz)
        .filter(models.Quiz.owner_id == user.id)
        .order_by(models.Quiz.id.desc())
        .all()
    )

    is_following = False
    if current_user.id != user.id:
        is_following = db.query(models.Follow).filter(
            models.Follow.follower_id == current_user.id,
            models.Follow.following_id == user.id
        ).first() is not None

    return {
        "username": user.username,
        "bio": prof.bio,
        "avatar_url": avatar_url(request, prof.avatar_key),
        "quiz_count": quiz_count,
        "followers": followers,
        "following": following,
        "quizzes": [
            {"id": q.id, "title": q.title, "description": q.description or ""}
            for q in quizzes
        ],
        "is_me": (user.id == current_user.id),
        "is_following": is_following,
    }