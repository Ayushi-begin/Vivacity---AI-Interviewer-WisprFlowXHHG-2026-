"""The Google/GitHub HTTP exchange itself, against a mocked transport (no network).

test_oauth.py covers the login flow with the whole provider call stubbed out; these
cover what that stub hides: the token exchange, the profile parsing and the error cases.
"""
import json
from urllib.parse import parse_qs

import httpx
import pytest

from app.integrations import oauth_providers
from app.integrations.oauth_providers import OAuthProvider, OAuthProviderError

REDIRECT = "http://testserver/api/v1/auth/x/callback"


@pytest.fixture
def mock_http(monkeypatch: pytest.MonkeyPatch):  # noqa: ANN201
    """Route the module's httpx client through a handler; returns the list of requests seen."""
    routes: dict[tuple[str, str], httpx.Response] = {}
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        key = (request.method, str(request.url).split("?")[0])
        return routes.get(key, httpx.Response(404, json={"error": "not mocked"}))

    real_client = httpx.AsyncClient

    def client_factory(**kwargs):  # noqa: ANN003, ANN202
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(oauth_providers.httpx, "AsyncClient", client_factory)
    return routes, seen


async def _fetch(provider: OAuthProvider) -> oauth_providers.OAuthProfile:
    return await oauth_providers.fetch_profile(
        provider, code="the-code", client_id="cid", client_secret="secret", redirect_uri=REDIRECT
    )


def test_authorize_urls_carry_state_scope_and_redirect() -> None:
    google = oauth_providers.build_authorize_url(
        OAuthProvider.GOOGLE, client_id="cid", redirect_uri=REDIRECT, state="xyz"
    )
    query = parse_qs(google.split("?", 1)[1])
    assert google.startswith("https://accounts.google.com/")
    assert query["state"] == ["xyz"] and query["redirect_uri"] == [REDIRECT]
    assert query["response_type"] == ["code"] and "email" in query["scope"][0]

    github = oauth_providers.build_authorize_url(
        OAuthProvider.GITHUB, client_id="cid", redirect_uri=REDIRECT, state="xyz"
    )
    assert github.startswith("https://github.com/login/oauth/authorize?")
    assert parse_qs(github.split("?", 1)[1])["scope"] == ["read:user user:email"]


async def test_google_exchanges_code_and_reads_profile(mock_http) -> None:  # noqa: ANN001
    routes, seen = mock_http
    routes[("POST", "https://oauth2.googleapis.com/token")] = httpx.Response(
        200, json={"access_token": "g-token"}
    )
    routes[("GET", "https://openidconnect.googleapis.com/v1/userinfo")] = httpx.Response(
        200,
        json={
            "sub": "1234",
            "email": "ada@example.com",
            "email_verified": True,
            "name": "Ada Lovelace",
            "picture": "https://example.com/ada.png",
        },
    )

    profile = await _fetch(OAuthProvider.GOOGLE)

    assert profile.provider_user_id == "1234"
    assert profile.email == "ada@example.com" and profile.email_verified
    assert profile.full_name == "Ada Lovelace"
    token_form = parse_qs(seen[0].content.decode())
    assert token_form["code"] == ["the-code"]
    assert token_form["client_secret"] == ["secret"]
    assert token_form["redirect_uri"] == [REDIRECT]
    assert token_form["grant_type"] == ["authorization_code"]
    assert seen[1].headers["Authorization"] == "Bearer g-token"


async def test_google_unverified_email_is_reported_as_unverified(mock_http) -> None:  # noqa: ANN001
    routes, _ = mock_http
    routes[("POST", "https://oauth2.googleapis.com/token")] = httpx.Response(
        200, json={"access_token": "g-token"}
    )
    routes[("GET", "https://openidconnect.googleapis.com/v1/userinfo")] = httpx.Response(
        200, json={"sub": "1", "email": "x@example.com"}
    )
    assert not (await _fetch(OAuthProvider.GOOGLE)).email_verified


async def test_github_uses_the_verified_primary_email(mock_http) -> None:  # noqa: ANN001
    routes, seen = mock_http
    routes[("POST", "https://github.com/login/oauth/access_token")] = httpx.Response(
        200, json={"access_token": "gh-token"}
    )
    routes[("GET", "https://api.github.com/user")] = httpx.Response(
        200, json={"id": 42, "login": "ada", "name": None, "email": None, "avatar_url": "a.png"}
    )
    routes[("GET", "https://api.github.com/user/emails")] = httpx.Response(
        200,
        json=[
            {"email": "old@example.com", "primary": False, "verified": True},
            {"email": "ada@example.com", "primary": True, "verified": True},
        ],
    )

    profile = await _fetch(OAuthProvider.GITHUB)

    assert profile.provider_user_id == "42"
    assert profile.email == "ada@example.com" and profile.email_verified
    assert profile.full_name == "ada"  # falls back to the login
    assert seen[0].headers["Accept"] == "application/json"
    assert all(r.headers["Authorization"] == "Bearer gh-token" for r in seen[1:])


async def test_github_unverified_primary_email_is_ignored(mock_http) -> None:  # noqa: ANN001
    routes, _ = mock_http
    routes[("POST", "https://github.com/login/oauth/access_token")] = httpx.Response(
        200, json={"access_token": "gh-token"}
    )
    routes[("GET", "https://api.github.com/user")] = httpx.Response(200, json={"id": 7, "login": "x"})
    routes[("GET", "https://api.github.com/user/emails")] = httpx.Response(
        200, json=[{"email": "x@example.com", "primary": True, "verified": False}]
    )
    profile = await _fetch(OAuthProvider.GITHUB)
    assert profile.email is None and not profile.email_verified


async def test_github_error_inside_a_200_is_a_failure(mock_http) -> None:  # noqa: ANN001
    routes, _ = mock_http
    # GitHub reports a bad or reused code as 200 with an "error" field.
    routes[("POST", "https://github.com/login/oauth/access_token")] = httpx.Response(
        200, content=json.dumps({"error": "bad_verification_code"})
    )
    with pytest.raises(OAuthProviderError):
        await _fetch(OAuthProvider.GITHUB)


async def test_provider_http_errors_become_oauth_errors(mock_http) -> None:  # noqa: ANN001
    routes, _ = mock_http
    routes[("POST", "https://oauth2.googleapis.com/token")] = httpx.Response(
        400, json={"error": "invalid_grant"}
    )
    with pytest.raises(OAuthProviderError):
        await _fetch(OAuthProvider.GOOGLE)
