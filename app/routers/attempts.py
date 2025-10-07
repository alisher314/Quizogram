from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict

from .. import models
from ..deps import get_db, get_current_user
from ..schemas import AttemptCreate, AttemptOut, AttemptAnswerOut, LeaderboardRow

router = APIRouter(prefix="/api/v1/attempts", tags=["attempts"])

@router.post("/{quiz_id}", response_model=AttemptOut, status_code=status.HTTP_201_CREATED)
def attempt_quiz(
    quiz_id: int,
    payload: AttemptCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 1) Проверим, что квиз существует
    quiz = db.query(models.Quiz).filter(models.Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # 2) Подтянем все вопросы и их правильные ответы
    questions = (
        db.query(models.Question)
          .filter(models.Question.quiz_id == quiz_id)
          .all()
    )
    if not questions:
        raise HTTPException(status_code=400, detail="Quiz has no questions")

    correct_by_qid: Dict[int, int] = {q.id: q.correct_option_index for q in questions}
    options_count_by_qid: Dict[int, int] = {}
    # заранее подготовим кол-во опций на вопрос, чтобы валидировать индекс
    for q in questions:
        options_count_by_qid[q.id] = db.query(models.AnswerOption).filter(models.AnswerOption.question_id == q.id).count()

    # 3) Валидация входных ответов
    seen = set()
    for a in payload.answers:
        if a.question_id not in correct_by_qid:
            raise HTTPException(status_code=400, detail=f"Question {a.question_id} doesn't belong to quiz {quiz_id}")
        if a.selected_option_index < 0 or a.selected_option_index >= options_count_by_qid[a.question_id]:
            raise HTTPException(status_code=400, detail=f"Question {a.question_id}: selected_option_index out of range")
        if a.question_id in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate answer for question {a.question_id}")
        seen.add(a.question_id)

    # 4) Подсчёт результата
    score = 0
    answers_out: List[AttemptAnswerOut] = []
    for a in payload.answers:
        is_correct = int(a.selected_option_index == correct_by_qid[a.question_id])
        score += is_correct
        answers_out.append(AttemptAnswerOut(
            question_id=a.question_id,
            selected_option_index=a.selected_option_index,
            is_correct=bool(is_correct),
        ))

    total = len(questions)

    # 5) Сохраняем попытку
    attempt = models.Attempt(
        user_id=current_user.id,
        quiz_id=quiz_id,
        score=score,
        total=total,
    )
    db.add(attempt)
    db.flush()

    for ans in answers_out:
        db.add(models.AttemptAnswer(
            attempt_id=attempt.id,
            question_id=ans.question_id,
            selected_option_index=ans.selected_option_index,
            is_correct=1 if ans.is_correct else 0
        ))

    db.commit()
    db.refresh(attempt)

    # 6) Вернём вместе с ответами
    return AttemptOut(
        id=attempt.id,
        quiz_id=attempt.quiz_id,
        user_id=attempt.user_id,
        score=attempt.score,
        total=attempt.total,
        created_at=str(attempt.created_at) if attempt.created_at else None,
        answers=answers_out
    )

@router.get("/my", response_model=List[AttemptOut])
def my_attempts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    attempts = (
        db.query(models.Attempt)
          .filter(models.Attempt.user_id == current_user.id)
          .order_by(models.Attempt.created_at.desc())
          .all()
    )
    # Подтянуть ответы
    result: List[AttemptOut] = []
    for at in attempts:
        raw_answers = db.query(models.AttemptAnswer).filter(models.AttemptAnswer.attempt_id == at.id).all()
        result.append(AttemptOut(
            id=at.id,
            quiz_id=at.quiz_id,
            user_id=at.user_id,
            score=at.score,
            total=at.total,
            created_at=str(at.created_at) if at.created_at else None,
            answers=[
                AttemptAnswerOut(
                    question_id=ra.question_id,
                    selected_option_index=ra.selected_option_index,
                    is_correct=bool(ra.is_correct),
                ) for ra in raw_answers
            ]
        ))
    return result

@router.get("/leaderboard/{quiz_id}", response_model=List[LeaderboardRow])
def leaderboard(
    quiz_id: int,
    db: Session = Depends(get_db),
):
    # Возвращаем лучший результат каждого пользователя по этому квизу
    subq = (
        db.query(
            models.Attempt.user_id.label("user_id"),
            func.max(models.Attempt.score).label("best_score"),
            func.max(models.Attempt.total).label("total"),
        )
        .filter(models.Attempt.quiz_id == quiz_id)
        .group_by(models.Attempt.user_id)
        .subquery()
    )

    rows = db.query(subq.c.user_id, subq.c.best_score, subq.c.total)\
             .order_by(subq.c.best_score.desc()).all()

    return [LeaderboardRow(user_id=r.user_id, best_score=r.best_score, total=r.total) for r in rows]
