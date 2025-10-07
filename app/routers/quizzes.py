from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List

from .. import models
from ..deps import get_db, get_current_user
from ..schemas import QuizCreate, QuizOut

router = APIRouter(prefix="/api/v1/quizzes", tags=["quizzes"])

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
