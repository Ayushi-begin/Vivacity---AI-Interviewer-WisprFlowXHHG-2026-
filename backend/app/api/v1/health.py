from fastapi import APIRouter, Response, status

from app.api.deps import DBSession
from app.schemas.health import HealthResponse
from app.services import health_service

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(session: DBSession, response: Response) -> HealthResponse:
    result = await health_service.check(session)
    if result.status != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return result
