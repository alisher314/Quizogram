from fastapi import APIRouter, Depends
from ..deps import get_current_user
from ..schemas import UserOut
from .. import models

router = APIRouter(prefix="/api/v1/users", tags=["users"])

@router.get("/me", response_model=UserOut)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user
