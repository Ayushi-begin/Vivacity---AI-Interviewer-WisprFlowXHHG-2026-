from typing import Any, TypedDict


class InterviewState(TypedDict, total=False):
    """Checkpointed graph state. Only plain JSON-like values, so it serialises cleanly."""

    # Inputs
    resume_text: str
    role: str
    company: str
    # Produced as the interview runs
    questions: list[dict[str, Any]]  # GeneratedQuestion dumps, in order
    answers: list[str]  # aligned with questions
    evaluations: list[dict[str, Any]]  # AnswerEvaluation dumps, aligned with questions
    weak_areas: list[str]
    roadmap: dict[str, Any]  # StudyRoadmap dump
