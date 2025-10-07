from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import List

from .. import models
from ..deps import get_db, get_current_user
from ..schemas import ProfileOut, ProfileUpdate, AvatarOption

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])

# Набор допустимых аватаров (ключ = имя файла в app/static/avatars)
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

@router.get("/me", response_model=ProfileOut)
def get_my_profile(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    prof = get_or_create_profile(db, current_user.id)
    return ProfileOut(
        user_id=current_user.id,
        bio=prof.bio,
        avatar_url=avatar_url(request, prof.avatar_key),
    )

@router.patch("/me", response_model=ProfileOut)
def update_my_profile(
    request: Request,
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
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
    return [AvatarOption(key=k, url=avatar_url(request, k)) for k in ALLOWED_AVATARS]
