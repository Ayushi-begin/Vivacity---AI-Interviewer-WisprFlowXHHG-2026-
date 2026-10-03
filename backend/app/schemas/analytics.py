import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.interview import MAX_SCORE_PER_QUESTION, MAX_TOTAL_SCORE

_FROM_ROWS = ConfigDict(from_attributes=True)


class AnalyticsSummary(BaseModel):
    model_config = _FROM_ROWS

    interviews_completed: int
    interviews_in_progress: int
    average_total: float | None
    best_total: int | None
    max_total: int = MAX_TOTAL_SCORE
    average_answer_score: float | None
    max_answer_score: int = MAX_SCORE_PER_QUESTION


class ScorePoint(BaseModel):
    model_config = _FROM_ROWS

    interview_id: uuid.UUID
    role: str
    company: str
    completed_at: datetime
    total_score: int
    percentage: float


class TopicStat(BaseModel):
    model_config = _FROM_ROWS

    topic: str
    answers: int
    average_score: float


class AnalyticsOut(BaseModel):
    summary: AnalyticsSummary
    score_history: list[ScorePoint]
    strong_topics: list[TopicStat]
    weak_topics: list[TopicStat]


LeaderboardPeriod = Literal["week", "month", "all"]


class LeaderboardEntry(BaseModel):
    model_config = _FROM_ROWS

    rank: int
    name: str
    best_score: int
    average_score: float
    interviews_completed: int
    is_you: bool


class LeaderboardOut(BaseModel):
    period: LeaderboardPeriod
    role: str | None
    company: str | None
    max_score: int = MAX_TOTAL_SCORE
    entries: list[LeaderboardEntry]
    you: LeaderboardEntry | None
