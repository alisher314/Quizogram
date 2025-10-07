from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List

from .. import models
from ..deps import get_db, get_current_user
from ..schemas import QuizCreate, QuizOut, QuizUpdate

router = APIRouter(prefix="/api/v1/quizzes", tags=["quizzes"])

def _get_quiz_or_404(db: Session, quiz_id: int) -> models.Quiz:
    quiz = db.query(models.Quiz).filter(models.Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz

def _ensure_owner(quiz: models.Quiz, user_id: int):
    if quiz.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Only owner can modify this quiz")

@router.post("/", response_model=QuizOut, status_code=status.HTTP_201_CREATED)
def create_quiz(
    payload: QuizCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Валидация correct_option_index в пределах options
    for i, q in enumerate(payload.questions):
        if not (0 <= q.correct_option_index < len(q.options)):
            raise HTTPException(
                status_code=400,
                detail=f"Question #{i+1}: correct_option_index is out of range"
            )

    quiz = models.Quiz(
        title=payload.title,
        description=payload.description,
        owner_id=current_user.id,
    )
    db.add(quiz)
    db.flush()  # получим quiz.id без полного commit

    for q in payload.questions:
        question = models.Question(
            quiz_id=quiz.id,
            text=q.text,
            correct_option_index=q.correct_option_index,
        )
        db.add(question)
        db.flush()
        for opt in q.options:
            db.add(models.AnswerOption(question_id=question.id, text=opt.text))

    db.commit()
    db.refresh(quiz)
    return quiz

@router.get("/", response_model=List[QuizOut])
def list_quizzes(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    # Публичный список (в будущем добавим фиды/подписки)
    quizzes = db.query(models.Quiz).offset(skip).limit(limit).all()
    return quizzes

@router.get("/{quiz_id}", response_model=QuizOut)
def get_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
):
    quiz = db.query(models.Quiz).filter(models.Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz

@router.get("/mine", response_model=List[QuizOut])
def list_my_quizzes(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    return (
        db.query(models.Quiz)
          .filter(models.Quiz.owner_id == current_user.id)
          .order_by(models.Quiz.id.desc())
          .offset(skip).limit(limit).all()
    )

@router.patch("/{quiz_id}", response_model=QuizOut)
def update_quiz(
    quiz_id: int,
    payload: QuizUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz = _get_quiz_or_404(db, quiz_id)
    _ensure_owner(quiz, current_user.id)

    updated = False
    if payload.title is not None:
        quiz.title = payload.title
        updated = True
    if payload.description is not None:
        quiz.description = payload.description
        updated = True

    if not updated:
        # Нечего менять — вернем как есть (или 400 по желанию)
        return quiz

    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz

@router.delete("/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz = _get_quiz_or_404(db, quiz_id)
    _ensure_owner(quiz, current_user.id)

    db.delete(quiz)   # каскадно удалит вопросы/варианты/попытки только если настроим каскады
    db.commit()
