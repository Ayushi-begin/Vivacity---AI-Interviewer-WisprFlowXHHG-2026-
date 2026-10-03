import logging
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.checkpointer import open_postgres_checkpointer
from app.agents.interview_graph import build_interview_graph
from app.agents.llm import OpenAIStructuredLLM
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.db.session import engine

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    async with AsyncExitStack() as stack:
        app.state.interview_graph = None
        if settings.OPENAI_API_KEY:
            checkpointer = await stack.enter_async_context(
                open_postgres_checkpointer(settings.DATABASE_URL)
            )
            llm = OpenAIStructuredLLM(api_key=settings.OPENAI_API_KEY, model=settings.OPENAI_MODEL)
            app.state.interview_graph = build_interview_graph(llm, checkpointer)
        else:
            logger.warning("OPENAI_API_KEY is not set. Interview endpoints will return 503.")
        yield
    await engine.dispose()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)
register_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
