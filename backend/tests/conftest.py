"""Test setup: an in-memory SQLite database per test, swapped in for the Neon
session via a FastAPI dependency override. Nothing touches .env or Neon."""
import os

# Must be set before the app is imported; real env vars override .env values.
os.environ.update(
    {
        # Never connected to: get_session is overridden below.
        "DATABASE_URL": "postgresql://test:test@127.0.0.1:1/test",
        "JWT_SECRET_KEY": "test-secret-key-that-is-long-enough-for-hs256",
        "FRONTEND_URL": "http://frontend.test",
        "OAUTH_REDIRECT_BASE_URL": "http://testserver/api/v1",
        "GOOGLE_CLIENT_ID": "google-client-id",
        "GOOGLE_CLIENT_SECRET": "google-client-secret",
        "GITHUB_CLIENT_ID": "github-client-id",
        "GITHUB_CLIENT_SECRET": "github-client-secret",
        # Tests must never reach OpenAI. The LLM is always the FakeLLM.
        "OPENAI_API_KEY": "",
    }
)

from collections.abc import AsyncIterator  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402

import app.models  # noqa: E402, F401
from app.agents.interview_graph import build_interview_graph  # noqa: E402
from app.api.deps import get_interview_graph  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_session  # noqa: E402
from app.main import app  # noqa: E402
from tests.fakes import FakeLLM  # noqa: E402


@compiles(JSONB, "sqlite")
def _jsonb_as_sqlite_json(type_, compiler, **kw):  # noqa: ANN001, ARG001
    return "JSON"


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_foreign_keys(dbapi_conn, _):  # noqa: ANN001
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
async def client(session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncClient]:
    async def _get_test_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = _get_test_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):  # noqa: ANN001, ANN201
    """Resume uploads go to a temp dir, never backend/uploads."""
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path / "uploads"))
    return tmp_path / "uploads"


@pytest.fixture
def fake_llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def checkpointer() -> InMemorySaver:
    """Stands in for the Postgres checkpointer. Same LangGraph interface, kept in memory."""
    return InMemorySaver()


@pytest.fixture
def interview_graph(client: AsyncClient, fake_llm: FakeLLM, checkpointer: InMemorySaver):  # noqa: ANN201
    """Serve a graph backed by the fake LLM. The same instance is used for the whole test."""
    graph = build_interview_graph(fake_llm, checkpointer)
    app.dependency_overrides[get_interview_graph] = lambda: graph
    return graph
