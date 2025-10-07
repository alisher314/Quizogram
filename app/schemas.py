from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)

class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr

    class Config:
        from_attributes = True  # Pydantic v2

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: str  # username
    exp: Optional[int] = None

# ----- QUIZ SCHEMAS -----
class AnswerOptionCreate(BaseModel):
    text: str = Field(..., min_length=1)

class QuestionCreate(BaseModel):
    text: str = Field(..., min_length=1)
    options: List[AnswerOptionCreate] = Field(..., min_items=2)
    correct_option_index: int = Field(..., ge=0)

class QuizCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    questions: List[QuestionCreate] = Field(..., min_items=1)

# Out-схемы
class AnswerOptionOut(BaseModel):
    id: int
    text: str
    class Config:
        from_attributes = True

class QuestionOut(BaseModel):
    id: int
    text: str
    correct_option_index: int
    options: List[AnswerOptionOut]
    class Config:
        from_attributes = True

class QuizOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    owner_id: int
    questions: List[QuestionOut]
    class Config:
        from_attributes = True


class AttemptAnswerIn(BaseModel):
    question_id: int
    selected_option_index: int = Field(..., ge=0)

class AttemptCreate(BaseModel):
    answers: List[AttemptAnswerIn] = Field(..., min_items=1)

class AttemptAnswerOut(BaseModel):
    question_id: int
    selected_option_index: int
    is_correct: bool

class AttemptOut(BaseModel):
    id: int
    quiz_id: int
    user_id: int
    score: int
    total: int
    created_at: Optional[str] = None
    answers: List[AttemptAnswerOut]

    class Config:
        from_attributes = True

class LeaderboardRow(BaseModel):
    user_id: int
    best_score: int
    total: int

class FeedItem(BaseModel):
    quiz_id: int
    title: str
    description: Optional[str] = None
    owner_id: int
    owner_username: str
    like_count: int
    is_liked_by_me: bool

    class Config:
        from_attributes = True