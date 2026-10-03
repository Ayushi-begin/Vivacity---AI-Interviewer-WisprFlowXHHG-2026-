import logging

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import health_repo
from app.schemas.health import HealthResponse

logger = logging.getLogger(__name__)


async def check(session: AsyncSession) -> HealthResponse:
    try:
        await health_repo.ping(session)
    except (SQLAlchemyError, OSError):
        logger.exception("Database health check failed")
        return HealthResponse(status="degraded", database="unreachable")
    return HealthResponse(status="ok", database="ok")
