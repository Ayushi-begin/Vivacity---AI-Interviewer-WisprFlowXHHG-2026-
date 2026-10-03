import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.interview import MAX_TOTAL_SCORE

InterviewStatus = Literal["in_progress", "completed"]


class AnswerSubmit(BaseModel):
    question_id: uuid.UUID
    answer: str = Field(min_length=1, max_length=5000)


class AnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    answer_text: str
    # Null until all answers are in and the interview has been evaluated.
    score: int | None
    what_was_good: str | None
    what_was_missing: str | None
    better_answer: str | None
    weak_topics: list[str] | None


class QuestionOut(BaseModel):
    id: uuid.UUID
    position: int
    question: str
    topic: str | None
    # Revealed only after evaluation, so it can't hint at the answer.
    what_it_tests: str | None
    answer: AnswerOut | None


class NextQuestion(BaseModel):
    id: uuid.UUID
    position: int
    question: str


class RoadmapItemOut(BaseModel):
    topic: str
    priority: Literal["high", "medium", "low"]
    why: str
    study_steps: list[str]
    resources: list[str]
    estimated_hours: int


class RoadmapOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    summary: str | None
    weak_areas: list[str]
    items: list[RoadmapItemOut]
    created_at: datetime


class InterviewDetail(BaseModel):
    id: uuid.UUID
    role: str
    company: str
    status: InterviewStatus
    total_score: int | None
    max_score: int = MAX_TOTAL_SCORE
    created_at: datetime
    completed_at: datetime | None
    next_question: NextQuestion | None
    questions: list[QuestionOut]
    roadmap: RoadmapOut | None

    @classmethod
    def from_model(cls, interview: Any) -> "InterviewDetail":
        completed = interview.status == "completed"
        questions = sorted(interview.questions, key=lambda q: q.position)
        pending = next((q for q in questions if q.answer is None), None)
        return cls(
            id=interview.id,
            role=interview.role,
            company=interview.company,
            status=interview.status,
            total_score=interview.total_score,
            created_at=interview.created_at,
            completed_at=interview.completed_at,
            next_question=(
                NextQuestion(id=pending.id, position=pending.position, question=pending.question_text)
                if pending
                else None
            ),
            questions=[
                QuestionOut(
                    id=q.id,
                    position=q.position,
                    question=q.question_text,
                    topic=q.focus_area,
                    what_it_tests=q.what_it_tests if completed else None,
                    answer=AnswerOut.model_validate(q.answer) if q.answer else None,
                )
                for q in questions
            ],
            roadmap=RoadmapOut.model_validate(interview.roadmap) if interview.roadmap else None,
        )


class InterviewSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    company: str
    status: InterviewStatus
    total_score: int | None
    max_score: int = MAX_TOTAL_SCORE
    answered_count: int
    created_at: datetime
    completed_at: datetime | None


class InterviewList(BaseModel):
    items: list[InterviewSummary]
    total: int
    limit: int
    offset: int
