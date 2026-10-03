from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from langgraph.graph.state import CompiledStateGraph
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.exceptions import AuthenticationError, ServiceUnavailableError
from app.core.security import decode_access_token
from app.db.session import get_session, get_session_factory
from app.models import User
from app.services import auth_service

DBSession = Annotated[AsyncSession, Depends(get_session)]
SessionFactory = Annotated[async_sessionmaker[AsyncSession], Depends(get_session_factory)]

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


def get_optional_interview_graph(request: Request) -> CompiledStateGraph | None:
    """The compiled interview graph, built once at startup (see app.main.lifespan),
    or None when OpenAI isn't configured."""
    return getattr(request.app.state, "interview_graph", None)


def get_interview_graph(
    graph: Annotated[CompiledStateGraph | None, Depends(get_optional_interview_graph)],
) -> CompiledStateGraph:
    if graph is None:
        raise ServiceUnavailableError("The AI interviewer is not configured (OPENAI_API_KEY)")
    return graph


InterviewGraph = Annotated[CompiledStateGraph, Depends(get_interview_graph)]
OptionalInterviewGraph = Annotated[
    CompiledStateGraph | None, Depends(get_optional_interview_graph)
]
