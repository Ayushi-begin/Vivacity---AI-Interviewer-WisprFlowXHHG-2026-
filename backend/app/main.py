import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI, Request, Response
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


app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
    docs_url="/docs" if settings.DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.DOCS_ENABLED else None,
)
register_exception_handlers(app)

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


@app.middleware("http")
async def security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    for name, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    if request.url.path.startswith("/api/"):
        # Responses carry tokens and private interview data: never cache them.
        response.headers.setdefault("Cache-Control", "no-store")
    return response


# Added last, so it runs first and CORS headers are present even on errors.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Auth uses bearer tokens, not cookies, so credentialed CORS isn't needed.
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

app.include_router(api_router, prefix="/api/v1")
