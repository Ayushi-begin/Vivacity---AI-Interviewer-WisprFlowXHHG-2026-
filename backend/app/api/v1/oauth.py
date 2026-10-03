from typing import Annotated

from fastapi import APIRouter, Cookie
from fastapi.responses import RedirectResponse

from app.api.deps import DBSession
from app.api.rate_limits import per_ip
from app.core.config import settings
from app.integrations.oauth_providers import OAuthProvider
from app.services import oauth_service
from app.services.oauth_service import STATE_COOKIE, STATE_MAX_AGE_SECONDS

router = APIRouter(prefix="/auth", tags=["oauth"])

_COOKIE_PATH = "/api/v1/auth"


@router.get("/{provider}/login", dependencies=[per_ip("oauth_login", 30, 60)])
async def oauth_login(provider: OAuthProvider) -> RedirectResponse:
    url, state = oauth_service.start_login(provider)
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        STATE_COOKIE,
        state,
        max_age=STATE_MAX_AGE_SECONDS,
        path=_COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=settings.OAUTH_REDIRECT_BASE_URL.startswith("https://"),
    )
    return response


@router.get("/{provider}/callback", dependencies=[per_ip("oauth_callback", 30, 60)])
async def oauth_callback(
    provider: OAuthProvider,
    session: DBSession,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    expected_state: Annotated[str | None, Cookie(alias=STATE_COOKIE)] = None,
) -> RedirectResponse:
    redirect_url = await oauth_service.complete_login(
        session,
        provider,
        code=code,
        state=state,
        expected_state=expected_state,
        error=error,
    )
    response = RedirectResponse(redirect_url, status_code=302)
    response.delete_cookie(STATE_COOKIE, path=_COOKIE_PATH)
    return response
