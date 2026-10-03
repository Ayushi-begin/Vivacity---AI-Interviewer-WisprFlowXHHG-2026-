from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DBSession
from app.schemas.analytics import AnalyticsOut, LeaderboardOut, LeaderboardPeriod
from app.services import analytics_service

router = APIRouter(tags=["analytics"])


@router.get("/analytics/me", response_model=AnalyticsOut)
async def my_analytics(session: DBSession, user: CurrentUser) -> AnalyticsOut:
    return await analytics_service.get_my_analytics(session, user)


@router.get("/leaderboard", response_model=LeaderboardOut)
async def leaderboard(
    session: DBSession,
    user: CurrentUser,
    period: LeaderboardPeriod = "all",
    role: Annotated[str | None, Query(max_length=100)] = None,
    company: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> LeaderboardOut:
    return await analytics_service.get_leaderboard(
        session, user, period=period, role=role, company=company, limit=limit
    )
