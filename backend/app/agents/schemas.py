"""Structured-output schemas the LLM must fill.

These go to OpenAI as strict JSON schemas, so every field is required and there are
no defaults or numeric bounds. Ranges are enforced in the graph after parsing.
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GeneratedQuestion(_Strict):
    question: str
    topic: str
    what_it_tests: str


class QuestionSet(_Strict):
    questions: list[GeneratedQuestion]


class AnswerEvaluation(_Strict):
    score: int
    what_was_good: str
    what_was_missing: str
    better_answer: str
    weak_topics: list[str]


class RoadmapItem(_Strict):
    topic: str
    priority: Literal["high", "medium", "low"]
    why: str
    study_steps: list[str]
    resources: list[str]
    estimated_hours: int


class StudyRoadmap(_Strict):
    summary: str
    items: list[RoadmapItem]
