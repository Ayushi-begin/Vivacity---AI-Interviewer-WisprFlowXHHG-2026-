from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.integrations import oauth_providers
from app.integrations.oauth_providers import OAuthProfile, OAuthProviderError
from app.models import OAuthAccount, User
from tests.utils import me, register

PROFILE = OAuthProfile(
    provider_user_id="google-123",
    email="grace@example.com",
    email_verified=True,
    full_name="Grace Hopper",
    avatar_url="https://example.com/grace.png",
)


@pytest.fixture
def provider_profile(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Stub the Google/GitHub HTTP calls. Tests set `holder["profile"]` (or an error)."""
    holder: dict = {"profile": PROFILE, "error": None, "calls": []}

    async def fake_fetch_profile(provider, *, code, client_id, client_secret, redirect_uri):
        holder["calls"].append(
            {"provider": provider, "code": code, "client_id": client_id, "redirect_uri": redirect_uri}
        )
        if holder["error"]:
            raise holder["error"]
        return holder["profile"]

    monkeypatch.setattr(oauth_providers, "fetch_profile", fake_fetch_profile)
    return holder


def fragment(resp: Response) -> dict[str, str]:
    location = resp.headers["location"]
    assert location.startswith("http://frontend.test/oauth/callback#")
    return {k: v[0] for k, v in parse_qs(urlparse(location).fragment).items()}


async def start(client: AsyncClient, provider: str = "google") -> str:
    """Hit /login and return the state the provider would echo back."""
    resp = await client.get(f"/api/v1/auth/{provider}/login")
    assert resp.status_code == 302
    return parse_qs(urlparse(resp.headers["location"]).query)["state"][0]


async def callback(client: AsyncClient, state: str, provider: str = "google", **params: str) -> Response:
    return await client.get(
        f"/api/v1/auth/{provider}/callback", params={"code": "auth-code", "state": state, **params}
    )


# --- /login ---

@pytest.mark.parametrize(
    ("provider", "host", "client_id"),
    [("google", "accounts.google.com", "google-client-id"), ("github", "github.com", "github-client-id")],
)
async def test_login_redirects_to_provider_with_state_cookie(
    client: AsyncClient, provider: str, host: str, client_id: str
) -> None:
    resp = await client.get(f"/api/v1/auth/{provider}/login")
    assert resp.status_code == 302
    url = urlparse(resp.headers["location"])
    query = parse_qs(url.query)
    assert url.hostname == host
    assert query["client_id"] == [client_id]
    assert query["redirect_uri"] == [f"http://testserver/api/v1/auth/{provider}/callback"]

    set_cookie = resp.headers["set-cookie"]
    assert f"oauth_state={query['state'][0]}" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie


async def test_unknown_provider_is_rejected(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/auth/facebook/login")
    assert resp.status_code == 422


async def test_unconfigured_provider_returns_503(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "")
    resp = await client.get("/api/v1/auth/github/login")
    assert resp.status_code == 503
    assert resp.json() == {"detail": "Github sign-in is not configured"}


# --- /callback ---

async def test_callback_creates_user_and_redirects_with_tokens(
    client: AsyncClient, provider_profile: dict
) -> None:
    state = await start(client)
    resp = await callback(client, state)

    assert resp.status_code == 302
    params = fragment(resp)
    assert params["token_type"] == "bearer"
    assert params["refresh_token"]
    # State cookie is cleared after use.
    assert 'oauth_state=""' in resp.headers["set-cookie"]

    me_resp = await me(client, params["access_token"])
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "grace@example.com"
    assert me_resp.json()["full_name"] == "Grace Hopper"
    assert me_resp.json()["avatar_url"] == "https://example.com/grace.png"

    call = provider_profile["calls"][0]
    assert call["code"] == "auth-code"
    assert call["redirect_uri"] == "http://testserver/api/v1/auth/google/callback"


async def test_repeat_login_reuses_the_same_user(
    client: AsyncClient, provider_profile: dict, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    first = fragment(await callback(client, await start(client)))
    second = fragment(await callback(client, await start(client)))
    id1 = (await me(client, first["access_token"])).json()["id"]
    id2 = (await me(client, second["access_token"])).json()["id"]
    assert id1 == id2

    async with session_factory() as session:
        assert await session.scalar(select(func.count()).select_from(User)) == 1
        assert await session.scalar(select(func.count()).select_from(OAuthAccount)) == 1


async def test_verified_email_links_to_existing_password_account(
    client: AsyncClient, provider_profile: dict
) -> None:
    registered = (await register(client, email="Grace@Example.com")).json()
    existing_id = (await me(client, registered["access_token"])).json()["id"]

    params = fragment(await callback(client, await start(client)))
    assert (await me(client, params["access_token"])).json()["id"] == existing_id


async def test_github_and_google_link_to_one_user(
    client: AsyncClient, provider_profile: dict
) -> None:
    google = fragment(await callback(client, await start(client, "google")))
    provider_profile["profile"] = OAuthProfile(
        provider_user_id="gh-42", email="grace@example.com", email_verified=True,
        full_name="grace", avatar_url=None,
    )
    github = fragment(await callback(client, await start(client, "github"), provider="github"))
    google_id = (await me(client, google["access_token"])).json()["id"]
    assert (await me(client, github["access_token"])).json()["id"] == google_id


async def test_unverified_email_cannot_take_over_existing_account(
    client: AsyncClient, provider_profile: dict
) -> None:
    await register(client, email="grace@example.com")
    provider_profile["profile"] = OAuthProfile(
        provider_user_id="attacker", email="grace@example.com", email_verified=False,
        full_name=None, avatar_url=None,
    )
    params = fragment(await callback(client, await start(client)))
    assert "access_token" not in params
    assert params["error"] == "Your Google account has no verified email address"


async def test_state_mismatch_is_rejected(client: AsyncClient, provider_profile: dict) -> None:
    await start(client)
    params = fragment(await callback(client, "forged-state"))
    assert "access_token" not in params
    assert "expired" in params["error"]
    assert provider_profile["calls"] == []  # never talked to the provider


async def test_missing_state_cookie_is_rejected(client: AsyncClient, provider_profile: dict) -> None:
    state = await start(client)
    client.cookies.clear()
    params = fragment(await callback(client, state))
    assert "access_token" not in params
    assert provider_profile["calls"] == []


async def test_user_cancelled_at_provider(client: AsyncClient, provider_profile: dict) -> None:
    state = await start(client)
    resp = await client.get(
        "/api/v1/auth/google/callback", params={"state": state, "error": "access_denied"}
    )
    assert fragment(resp)["error"] == "Google sign-in was cancelled"


async def test_provider_failure_redirects_with_error(
    client: AsyncClient, provider_profile: dict
) -> None:
    provider_profile["error"] = OAuthProviderError("boom")
    params = fragment(await callback(client, await start(client)))
    assert params["error"] == "Could not sign in with Google"
