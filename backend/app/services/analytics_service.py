from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.interview_graph import WEAK_SCORE_THRESHOLD
from app.core.security import utcnow
from app.models import User
from app.repositories import analytics_repo
from app.schemas.analytics import (
    AnalyticsOut,
    AnalyticsSummary,
    LeaderboardEntry,
    LeaderboardOut,
    LeaderboardPeriod,
    ScorePoint,
    TopicStat,
)

_PERIODS = {"week": timedelta(days=7), "month": timedelta(days=30), "all": None}


async def get_my_analytics(session: AsyncSession, user: User) -> AnalyticsOut:
    summary = await analytics_repo.summary(session, user.id)
    history = await analytics_repo.score_history(session, user.id)
    topics = [TopicStat.model_validate(row) for row in await analytics_repo.topic_stats(session, user.id)]
    # Same cut-off the interview graph uses to flag weak areas. The averages come from SQL.
    return AnalyticsOut(
        summary=AnalyticsSummary.model_validate(summary),
        score_history=[ScorePoint.model_validate(row) for row in history],
        strong_topics=[t for t in topics if t.average_score >= WEAK_SCORE_THRESHOLD],
        weak_topics=sorted(
            (t for t in topics if t.average_score < WEAK_SCORE_THRESHOLD),
            key=lambda t: t.average_score,
        ),
    )


async def get_leaderboard(
    session: AsyncSession,
    user: User,
    *,
    period: LeaderboardPeriod,
    role: str | None,
    company: str | None,
    limit: int,
) -> LeaderboardOut:
    window = _PERIODS[period]
    top, you = await analytics_repo.leaderboard(
        session,
        current_user_id=user.id,
        since=utcnow() - window if window else None,
        role=role,
        company=company,
        limit=limit,
    )
    return LeaderboardOut(
        period=period,
        role=role,
        company=company,
        entries=[LeaderboardEntry.model_validate(row) for row in top],
        you=LeaderboardEntry.model_validate(you) if you else None,
    )
