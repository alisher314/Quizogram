from fastapi import FastAPI
from . import models
from .database import engine
from .routers import auth, users

app = FastAPI(
    title="Quizogram API",
    version="0.4.0",
    description="Соцсеть с квизами вместо фото и видео — с квизами!"
)

models.Base.metadata.create_all(bind=engine)

app.include_router(auth.router)
app.include_router(users.router)

@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}

@app.get("/", tags=["system"])
def root():
    return {"message": "Welcome to Quizogram API"}
