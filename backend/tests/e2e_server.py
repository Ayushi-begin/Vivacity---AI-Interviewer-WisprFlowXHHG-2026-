"""API server for the frontend's browser tests (frontend/e2e).

The real app, with three swaps: a throwaway SQLite database, the FakeLLM (with short
delays so loading screens are visible) and an in-memory checkpointer. It never
reads Neon or calls OpenAI, and OAuth providers are left unconfigured.

    .venv/Scripts/python -m tests.e2e_server --port 8001 --frontend http://localhost:5174
"""
import argparse
import asyncio
import os
import re
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8001)
parser.add_argument("--frontend", default="http://localhost:5174")
args = parser.parse_args()

workdir = Path(tempfile.mkdtemp(prefix="vivacity-e2e-"))
# Must be set before the app is imported. Real env vars win over .env values.
os.environ.update(
    {
        "DATABASE_URL": "postgresql://unused:unused@127.0.0.1:1/unused",
        "JWT_SECRET_KEY": "e2e-only-secret-key-that-is-long-enough-for-hs256",
        "OPENAI_API_KEY": "",
        "GOOGLE_CLIENT_ID": "",
        "GITHUB_CLIENT_ID": "",
        "FRONTEND_URL": args.frontend,
        "CORS_ORIGINS": args.frontend,
        "UPLOAD_DIR": str(workdir / "uploads"),
    }
)

import uvicorn  # noqa: E402
from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

import app.models  # noqa: E402, F401
from app.agents.interview_graph import build_interview_graph  # noqa: E402
from app.api.deps import get_interview_graph  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_session  # noqa: E402
from app.main import app  # noqa: E402
from tests.fakes import FakeLLM  # noqa: E402


@compiles(JSONB, "sqlite")
def _jsonb_as_sqlite_json(type_, compiler, **kw):  # noqa: ANN001, ANN202, ARG001
    return "JSON"


class SlowFakeLLM(FakeLLM):
    """Waits like a real model, and scores answers by length (longer = better, 2–10),
    so browser tests can produce varied scores and a real trend line."""

    async def generate(self, schema, *, system: str, user: str):  # noqa: ANN001, ANN201
        await asyncio.sleep(1.5)
        if schema.__name__ == "AnswerEvaluation":
            answer = re.search(r"<candidate_answer>\n(.*?)\n</candidate_answer>", user, re.S).group(1)
            topic = re.search(r'<question topic="([^"]+)">', user).group(1)
            self.scores[topic] = max(2, min(10, 2 + len(answer) // 25))
        return await super().generate(schema, system=system, user=user)


engine = create_async_engine(f"sqlite+aiosqlite:///{(workdir / 'e2e.db').as_posix()}", poolclass=NullPool)


@event.listens_for(engine.sync_engine, "connect")
def _foreign_keys(dbapi_conn, _):  # noqa: ANN001
    dbapi_conn.execute("PRAGMA foreign_keys=ON")


async def _create_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def _session():  # noqa: ANN202
    async with SessionLocal() as session:
        yield session


graph = build_interview_graph(SlowFakeLLM(), InMemorySaver())
app.dependency_overrides[get_session] = _session
app.dependency_overrides[get_interview_graph] = lambda: graph

if __name__ == "__main__":
    asyncio.run(_create_schema())
    print(f"[e2e] data in {workdir}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
