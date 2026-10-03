import hmac
from urllib.parse import urlencode

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError
from app.core.security import generate_state
from app.integrations import oauth_providers
from app.integrations.oauth_providers import OAuthProfile, OAuthProvider, OAuthProviderError
from app.models import User
from app.repositories import oauth_account_repo, user_repo
from app.services import auth_service

STATE_COOKIE = "oauth_state"
STATE_MAX_AGE_SECONDS = 600


class _LoginFailed(Exception):
    """Ends the callback with an error redirect to the frontend."""


def _credentials(provider: OAuthProvider) -> tuple[str, str]:
    if provider is OAuthProvider.GOOGLE:
        client_id, secret = settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET
    else:
        client_id, secret = settings.GITHUB_CLIENT_ID, settings.GITHUB_CLIENT_SECRET
    if not client_id or not secret:
        raise ServiceUnavailableError(f"{provider.value.title()} sign-in is not configured")
    return client_id, secret


def _callback_url(provider: OAuthProvider) -> str:
    return f"{settings.OAUTH_REDIRECT_BASE_URL.rstrip('/')}/auth/{provider.value}/callback"


def _frontend_redirect(params: dict[str, str | int]) -> str:
    # Tokens go in the URL fragment, which browsers never send to servers or logs.
    return f"{settings.FRONTEND_URL.rstrip('/')}/oauth/callback#{urlencode(params)}"


def start_login(provider: OAuthProvider) -> tuple[str, str]:
    """Return (provider authorize URL, state). The route stores the state in a cookie."""
    client_id, _ = _credentials(provider)
    state = generate_state()
    url = oauth_providers.build_authorize_url(
        provider, client_id=client_id, redirect_uri=_callback_url(provider), state=state
    )
    return url, state


async def complete_login(
    session: AsyncSession,
    provider: OAuthProvider,
    *,
    code: str | None,
    state: str | None,
    expected_state: str | None,
    error: str | None,
) -> str:
    """Handle the provider callback and return the frontend URL to redirect to:
    tokens on success, an `error` message otherwise."""
    client_id, secret = _credentials(provider)
    name = provider.value.title()
    try:
        if error:
            raise _LoginFailed(f"{name} sign-in was cancelled")
        if not (code and state and expected_state and hmac.compare_digest(state, expected_state)):
            raise _LoginFailed("Sign-in session expired. Please try again.")
        try:
            profile = await oauth_providers.fetch_profile(
                provider,
                code=code,
                client_id=client_id,
                client_secret=secret,
                redirect_uri=_callback_url(provider),
            )
        except OAuthProviderError:
            raise _LoginFailed(f"Could not sign in with {name}") from None

        user = await _find_or_create_user(session, provider, profile)
        tokens = await auth_service.issue_tokens(session, user)
        await session.commit()
    except _LoginFailed as exc:
        return _frontend_redirect({"error": str(exc)})

    return _frontend_redirect(tokens.model_dump())


async def _find_or_create_user(
    session: AsyncSession, provider: OAuthProvider, profile: OAuthProfile
) -> User:
    name = provider.value.title()
    account = await oauth_account_repo.get(session, provider.value, profile.provider_user_id)
    if account is not None:
        user = await user_repo.get_by_id(session, account.user_id)
        if user is None or not user.is_active:
            raise _LoginFailed("This account is disabled")
        return user

    # Only link or create by email when the provider vouches for it; otherwise anyone
    # could claim an existing account by adding its email to their provider profile.
    if not profile.email or not profile.email_verified:
        raise _LoginFailed(f"Your {name} account has no verified email address")

    email = auth_service.normalize_email(profile.email)
    user = await user_repo.get_by_email(session, email)
    if user is None:
        user = await user_repo.create(
            session, email=email, full_name=profile.full_name, avatar_url=profile.avatar_url
        )
    elif not user.is_active:
        raise _LoginFailed("This account is disabled")
    else:
        await user_repo.update_fields(
            session,
            user,
            full_name=user.full_name or profile.full_name,
            avatar_url=user.avatar_url or profile.avatar_url,
        )

    await oauth_account_repo.create(
        session,
        user_id=user.id,
        provider=provider.value,
        provider_user_id=profile.provider_user_id,
    )
    return user
