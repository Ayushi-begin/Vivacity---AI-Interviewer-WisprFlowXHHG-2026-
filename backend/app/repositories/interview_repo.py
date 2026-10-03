import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Row, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models import Answer, Interview, Question, Roadmap


async def create(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    resume_id: uuid.UUID,
    role: str,
    company: str,
) -> Interview:
    interview = Interview(user_id=user_id, resume_id=resume_id, role=role, company=company)
    session.add(interview)
    await session.flush()
    return interview


async def get_for_user(
    session: AsyncSession, interview_id: uuid.UUID, user_id: uuid.UUID
) -> Interview | None:
    """Load an interview with its questions, answers and roadmap, but only if `user_id`
    owns it. Every interview lookup goes through here."""
    result = await session.execute(
        select(Interview)
        .where(Interview.id == interview_id, Interview.user_id == user_id)
        # Two queries in all: interview + roadmap, then questions + answers.
        .options(
            selectinload(Interview.questions).joinedload(Question.answer),
            joinedload(Interview.roadmap),
        )
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def delete(session: AsyncSession, interview: Interview) -> None:
    """Delete the interview. Questions, answers and the roadmap go with it (cascade)."""
    await session.delete(interview)
    await session.flush()


async def list_for_user(
    session: AsyncSession, user_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[Row[Any]], int]:
    answered = (
        select(func.count(Answer.id))
        .join(Question, Question.id == Answer.question_id)
        .where(Question.interview_id == Interview.id)
        .correlate(Interview)
        .scalar_subquery()
    )
    rows = await session.execute(
        select(
            Interview.id,
            Interview.role,
            Interview.company,
            Interview.status,
            Interview.total_score,
            Interview.created_at,
            Interview.completed_at,
            answered.label("answered_count"),
        )
        .where(Interview.user_id == user_id)
        .order_by(Interview.created_at.desc(), Interview.id)
        .limit(limit)
        .offset(offset)
    )
    total = await session.scalar(
        select(func.count()).select_from(Interview).where(Interview.user_id == user_id)
    )
    return list(rows.all()), total or 0


async def add_questions(
    session: AsyncSession, interview_id: uuid.UUID, questions: list[dict[str, Any]]
) -> None:
    session.add_all(
        Question(
            interview_id=interview_id,
            position=position,
            question_text=q["question"],
            focus_area=q["topic"],
            what_it_tests=q["what_it_tests"],
        )
        for position, q in enumerate(questions, start=1)
    )
    await session.flush()


async def add_answer(session: AsyncSession, question_id: uuid.UUID, answer_text: str) -> Answer:
    answer = Answer(question_id=question_id, answer_text=answer_text)
    session.add(answer)
    await session.flush()
    return answer


async def get_answer_text(
    session: AsyncSession, interview_id: uuid.UUID, position: int
) -> str | None:
    return await session.scalar(
        select(Answer.answer_text)
        .join(Question, Question.id == Answer.question_id)
        .where(Question.interview_id == interview_id, Question.position == position)
    )


async def save_evaluation(
    session: AsyncSession,
    interview_id: uuid.UUID,
    position: int,
    evaluation: dict[str, Any],
    at: datetime,
) -> None:
    """Store the evaluation for the answer at `position`. Already-evaluated answers are left alone."""
    question_id = (
        select(Question.id)
        .where(Question.interview_id == interview_id, Question.position == position)
        .scalar_subquery()
    )
    await session.execute(
        update(Answer)
        .where(Answer.question_id == question_id, Answer.evaluated_at.is_(None))
        .values(
            score=evaluation["score"],
            what_was_good=evaluation["what_was_good"],
            what_was_missing=evaluation["what_was_missing"],
            better_answer=evaluation["better_answer"],
            weak_topics=evaluation["weak_topics"],
            evaluated_at=at,
        )
        .execution_options(synchronize_session=False)
    )


async def create_roadmap(
    session: AsyncSession,
    interview_id: uuid.UUID,
    *,
    summary: str,
    weak_areas: list[str],
    items: list[dict[str, Any]],
) -> None:
    session.add(
        Roadmap(interview_id=interview_id, summary=summary, weak_areas=weak_areas, items=items)
    )
    await session.flush()


async def mark_completed(session: AsyncSession, interview_id: uuid.UUID, at: datetime) -> None:
    """Complete the interview, with total_score summed from its answers in SQL."""
    total = (
        select(func.coalesce(func.sum(Answer.score), 0))
        .join(Question, Question.id == Answer.question_id)
        .where(Question.interview_id == interview_id)
        .scalar_subquery()
    )
    await session.execute(
        update(Interview)
        .where(Interview.id == interview_id, Interview.status != "completed")
        .values(status="completed", completed_at=at, total_score=total)
        .execution_options(synchronize_session=False)
    )
