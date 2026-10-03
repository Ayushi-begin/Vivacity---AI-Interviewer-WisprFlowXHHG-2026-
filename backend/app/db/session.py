from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


def build_async_url(raw_url: str) -> tuple[URL, dict[str, Any]]:
    """Turn a Neon/libpq connection string into an asyncpg URL plus connect_args.

    asyncpg rejects libpq-only params like `sslmode` and `channel_binding`, so
    they are stripped from the URL and SSL is passed as a connect arg instead.
    """
    url = make_url(raw_url)
    query = dict(url.query)
    sslmode = query.pop("sslmode", None)
    query.pop("channel_binding", None)

    connect_args: dict[str, Any] = {}
    if sslmode and sslmode != "disable":
        connect_args["ssl"] = "require"

    # Neon's pooled endpoint runs PgBouncer in transaction mode, which does not
    # play well with asyncpg's statement caches.
    if url.host and "-pooler" in url.host:
        connect_args["statement_cache_size"] = 0
        query["prepared_statement_cache_size"] = "0"

    url = url.set(drivername="postgresql+asyncpg", query=query)
    return url, connect_args


DATABASE_URL, CONNECT_ARGS = build_async_url(settings.DATABASE_URL)

engine = create_async_engine(
    DATABASE_URL,
    connect_args=CONNECT_ARGS,
    echo=settings.DB_ECHO,
    # Neon scales to zero and drops idle connections; check before use.
    pool_pre_ping=True,
    pool_recycle=300,
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """For work that outlives the request (background tasks), which opens its own session."""
    return AsyncSessionLocal
