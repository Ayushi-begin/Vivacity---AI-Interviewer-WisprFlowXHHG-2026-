"""Request limits for endpoints that can be abused: password guessing, OTP guessing,
signup spam, and anything that spends OpenAI credits.

Use them as route dependencies, e.g. `dependencies=[per_ip("login", 10, 60)]`.
"""
from typing import Any

from fastapi import Depends, Request

from app.api.deps import CurrentUser
from app.core.config import settings
from app.core.rate_limit import limiter


def _client_ip(request: Request) -> str:
    # The direct peer. Behind a reverse proxy, run uvicorn with --proxy-headers
    # (and --forwarded-allow-ips) so this is the real client address.
    return request.client.host if request.client else "unknown"


def per_ip(scope: str, limit: int, window_seconds: int) -> Any:
    async def dependency(request: Request) -> None:
        if settings.RATE_LIMIT_ENABLED:
            limiter.hit(
                f"{scope}:ip:{_client_ip(request)}", limit=limit, window_seconds=window_seconds
            )

    return Depends(dependency)


def per_user(scope: str, limit: int, window_seconds: int) -> Any:
    async def dependency(user: CurrentUser) -> None:
        if settings.RATE_LIMIT_ENABLED:
            limiter.hit(f"{scope}:user:{user.id}", limit=limit, window_seconds=window_seconds)

    return Depends(dependency)


def per_email(scope: str, email: str, limit: int, window_seconds: int) -> None:
    """Limit by the account being targeted. Unlike IPs (which a client can disguise
    behind a forged X-Forwarded-For), this caps guessing against any one account."""
    if settings.RATE_LIMIT_ENABLED:
        key = f"{scope}:email:{email.strip().lower()}"
        limiter.hit(key, limit=limit, window_seconds=window_seconds)
