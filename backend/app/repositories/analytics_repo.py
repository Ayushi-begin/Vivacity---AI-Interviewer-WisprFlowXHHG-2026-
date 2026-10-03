"""Read-only aggregate queries. All the maths (averages, sums, ranks) runs in SQL.

The queries stick to portable SQL (aggregates, CASE, window functions), so they run
unchanged on Postgres and on the SQLite test database.
"""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Numeric, Row, case, cast, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Answer, Interview, Question, User
from app.models.interview import MAX_TOTAL_SCORE

COMPLETED = Interview.status == "completed"


def _round(expr, places: int):  # noqa: ANN001, ANN202
    # Postgres only has round(numeric, int); a float input (e.g. x * 100.0) would error.
    return func.round(cast(expr, Numeric), places)


async def summary(session: AsyncSession, user_id: uuid.UUID) -> Row[Any]:
    answer_avg = (
        select(_round(func.avg(Answer.score), 2))
        .join(Question, Question.id == Answer.question_id)
        .join(Interview, Interview.id == Question.interview_id)
        .where(Interview.user_id == user_id, COMPLETED)
        .scalar_subquery()
    )
    result = await session.execute(
        select(
            func.count().filter(COMPLETED).label("interviews_completed"),
            func.count().filter(Interview.status == "in_progress").label("interviews_in_progress"),
            _round(func.avg(case((COMPLETED, Interview.total_score))), 2).label("average_total"),
            func.max(case((COMPLETED, Interview.total_score))).label("best_total"),
            answer_avg.label("average_answer_score"),
        ).where(Interview.user_id == user_id)
    )
    return result.one()


async def score_history(session: AsyncSession, user_id: uuid.UUID) -> list[Row[Any]]:
    result = await session.execute(
        select(
            Interview.id.label("interview_id"),
            Interview.role,
            Interview.company,
            Interview.completed_at,
            Interview.total_score,
            _round(Interview.total_score * literal(100.0) / MAX_TOTAL_SCORE, 1).label(
                "percentage"
            ),
        )
        .where(Interview.user_id == user_id, COMPLETED)
        .order_by(Interview.completed_at, Interview.id)
    )
    return list(result.all())


async def topic_stats(session: AsyncSession, user_id: uuid.UUID) -> list[Row[Any]]:
    """Average answer score per topic, across all the user's completed interviews."""
    topic_key = func.lower(func.trim(Question.focus_area))
    avg_score = func.avg(Answer.score)
    result = await session.execute(
        select(
            func.min(Question.focus_area).label("topic"),
            func.count(Answer.id).label("answers"),
            _round(avg_score, 2).label("average_score"),
        )
        .join(Answer, Answer.question_id == Question.id)
        .join(Interview, Interview.id == Question.interview_id)
        .where(
            Interview.user_id == user_id,
            COMPLETED,
            Answer.score.is_not(None),
            Question.focus_area.is_not(None),
        )
        .group_by(topic_key)
        .order_by(avg_score.desc(), func.count(Answer.id).desc(), topic_key)
    )
    return list(result.all())


async def leaderboard(
    session: AsyncSession,
    *,
    current_user_id: uuid.UUID,
    since: datetime | None,
    role: str | None,
    company: str | None,
    limit: int,
) -> tuple[list[Row[Any]], Row[Any] | None]:
    """Rank users by their best completed score (ties broken by average score).
    Returns the top `limit` rows and the current user's own row, even if outside the top."""
    filters = [COMPLETED]
    if since is not None:
        filters.append(Interview.completed_at >= since)
    if role:
        filters.append(func.lower(Interview.role) == role.strip().lower())
    if company:
        filters.append(func.lower(Interview.company) == company.strip().lower())

    per_user = (
        select(
            Interview.user_id,
            func.max(Interview.total_score).label("best_score"),
            func.avg(Interview.total_score).label("avg_score"),
            func.count().label("interviews_completed"),
        )
        .where(*filters)
        .group_by(Interview.user_id)
        .subquery()
    )
    ranked = (
        select(
            per_user.c.user_id,
            func.rank()
            .over(order_by=(per_user.c.best_score.desc(), per_user.c.avg_score.desc()))
            .label("rank"),
            # Names only. Emails never leave this query.
            func.coalesce(func.nullif(func.trim(User.full_name), ""), "Anonymous").label("name"),
            per_user.c.best_score,
            _round(per_user.c.avg_score, 2).label("average_score"),
            per_user.c.interviews_completed,
        )
        .join(User, User.id == per_user.c.user_id)
        .where(User.is_active.is_(True))
        .subquery()
    )
    columns = [
        ranked.c.rank,
        ranked.c.name,
        ranked.c.best_score,
        ranked.c.average_score,
        ranked.c.interviews_completed,
        (ranked.c.user_id == current_user_id).label("is_you"),
    ]
    top = await session.execute(
        select(*columns).order_by(ranked.c.rank, ranked.c.name).limit(limit)
    )
    you = await session.execute(select(*columns).where(ranked.c.user_id == current_user_id))
    return list(top.all()), you.one_or_none()
