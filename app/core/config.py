import secrets
from datetime import timedelta

# В реальном проекте SECRET_KEY храним в .env
SECRET_KEY = secrets.token_hex(32)  # временно сгенерируем
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 1 час

def get_access_token_timedelta() -> timedelta:
    return timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
