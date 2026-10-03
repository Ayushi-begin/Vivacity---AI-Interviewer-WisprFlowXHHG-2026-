from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from langgraph.graph.state import CompiledStateGraph
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, ServiceUnavailableError
from app.core.security import decode_access_token
from app.db.session import get_session
from app.models import User
from app.services import auth_service

DBSession = Annotated[AsyncSession, Depends(get_session)]

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    session: DBSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise AuthenticationError("Not authenticated")
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise AuthenticationError("Could not validate credentials")
    return await auth_service.get_active_user(session, user_id)


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_interview_graph(request: Request) -> CompiledStateGraph:
    """The compiled interview graph, built once at startup (see app.main.lifespan)."""
    graph = getattr(request.app.state, "interview_graph", None)
    if graph is None:
        raise ServiceUnavailableError("The AI interviewer is not configured (OPENAI_API_KEY)")
    return graph


InterviewGraph = Annotated[CompiledStateGraph, Depends(get_interview_graph)]
