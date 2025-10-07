from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from . import models
from .database import engine
from .routers import auth, users, quizzes, attempts, social, profile


app = FastAPI(
    title="Quizogram API",
    version="0.6.0",
    description="Соцсеть с квизами вместо фото и видео — с квизами!"
)


app.mount("/static", StaticFiles(directory="app/static"), name="static")

models.Base.metadata.create_all(bind=engine)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(quizzes.router)
app.include_router(attempts.router)
app.include_router(social.router)
app.include_router(profile.router)

@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}

@app.get("/", tags=["system"])
def root():
    return {"message": "Welcome to Quizogram API"}