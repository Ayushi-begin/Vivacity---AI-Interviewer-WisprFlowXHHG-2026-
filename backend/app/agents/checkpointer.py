"""Postgres checkpointer for the interview graph.

langgraph-checkpoint-postgres talks to Postgres through psycopg 3, not asyncpg.
It creates and migrates its own tables (checkpoints, checkpoint_blobs,
checkpoint_writes, checkpoint_migrations) through `setup()`. Alembic is
configured to ignore them.
"""
import asyncio
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

CHECKPOINT_TABLES = frozenset(
    {"checkpoints", "checkpoint_blobs", "checkpoint_writes", "checkpoint_migrations"}
)


def _libpq_url(database_url: str) -> str:
    # The app accepts SQLAlchemy-style URLs too; libpq only knows plain postgresql://.
    for prefix in ("postgresql+asyncpg://", "postgresql+psycopg://"):
        if database_url.startswith(prefix):
            return "postgresql://" + database_url.removeprefix(prefix)
    return database_url


def _check_event_loop() -> None:
    if sys.platform == "win32" and isinstance(
        asyncio.get_running_loop(), asyncio.ProactorEventLoop
    ):
        raise RuntimeError(
            "psycopg (used by the LangGraph checkpointer) can't run on Windows' default "
            "ProactorEventLoop. Start the server with `uvicorn app.main:app --reload` "
            "or add `--loop asyncio:SelectorEventLoop`."
        )


@asynccontextmanager
async def open_postgres_checkpointer(database_url: str) -> AsyncIterator[AsyncPostgresSaver]:
    _check_event_loop()
    pool = AsyncConnectionPool(
        conninfo=_libpq_url(database_url),
        min_size=1,
        max_size=5,
        open=False,
        # Neon drops idle connections, so check each one before handing it out.
        check=AsyncConnectionPool.check_connection,
        kwargs={
            "autocommit": True,
            "row_factory": dict_row,
            # Server-side prepared statements break behind Neon's PgBouncer pooler.
            "prepare_threshold": None,
        },
    )
    await pool.open()
    try:
        checkpointer = AsyncPostgresSaver(pool)  # type: ignore[arg-type]
        await checkpointer.setup()
        yield checkpointer
    finally:
        await pool.close()
