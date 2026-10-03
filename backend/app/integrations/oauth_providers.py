"""HTTP calls to Google and GitHub for the OAuth authorization-code flow.

No database access and no business rules: the service decides what to do with
the profile returned here.
"""
from dataclasses import dataclass
from enum import StrEnum
from typing import Any
from urllib.parse import urlencode

import httpx

_TIMEOUT = httpx.Timeout(10.0)


class OAuthProvider(StrEnum):
    GOOGLE = "google"
    GITHUB = "github"


@dataclass(frozen=True)
class OAuthProfile:
    provider_user_id: str
    email: str | None
    email_verified: bool
    full_name: str | None
    avatar_url: str | None


class OAuthProviderError(Exception):
    pass


_AUTHORIZE_URLS = {
    OAuthProvider.GOOGLE: "https://accounts.google.com/o/oauth2/v2/auth",
    OAuthProvider.GITHUB: "https://github.com/login/oauth/authorize",
}
_SCOPES = {
    OAuthProvider.GOOGLE: "openid email profile",
    OAuthProvider.GITHUB: "read:user user:email",
}


def build_authorize_url(
    provider: OAuthProvider, *, client_id: str, redirect_uri: str, state: str
) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": _SCOPES[provider],
        "state": state,
    }
    if provider is OAuthProvider.GOOGLE:
        params |= {"response_type": "code", "prompt": "select_account"}
    return f"{_AUTHORIZE_URLS[provider]}?{urlencode(params)}"


async def fetch_profile(
    provider: OAuthProvider,
    *,
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> OAuthProfile:
    """Exchange the authorization code for an access token and load the user's profile."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            if provider is OAuthProvider.GOOGLE:
                return await _google_profile(client, code, client_id, client_secret, redirect_uri)
            return await _github_profile(client, code, client_id, client_secret, redirect_uri)
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise OAuthProviderError(f"{provider} sign-in failed") from exc


async def _google_profile(
    client: httpx.AsyncClient, code: str, client_id: str, client_secret: str, redirect_uri: str
) -> OAuthProfile:
    token_resp = await client.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    token_resp.raise_for_status()
    access_token = token_resp.json()["access_token"]

    info_resp = await client.get(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    info_resp.raise_for_status()
    info: dict[str, Any] = info_resp.json()
    return OAuthProfile(
        provider_user_id=str(info["sub"]),
        email=info.get("email"),
        email_verified=bool(info.get("email_verified")),
        full_name=info.get("name"),
        avatar_url=info.get("picture"),
    )


async def _github_profile(
    client: httpx.AsyncClient, code: str, client_id: str, client_secret: str, redirect_uri: str
) -> OAuthProfile:
    token_resp = await client.post(
        "https://github.com/login/oauth/access_token",
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        },
        headers={"Accept": "application/json"},
    )
    token_resp.raise_for_status()
    # GitHub returns 200 with an "error" field on failure, so a missing key raises.
    access_token = token_resp.json()["access_token"]

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
    }
    user_resp = await client.get("https://api.github.com/user", headers=headers)
    user_resp.raise_for_status()
    user: dict[str, Any] = user_resp.json()

    # The public profile email may be hidden; /user/emails says which is verified.
    emails_resp = await client.get("https://api.github.com/user/emails", headers=headers)
    emails_resp.raise_for_status()
    primary = next(
        (e for e in emails_resp.json() if e.get("primary") and e.get("verified")), None
    )
    return OAuthProfile(
        provider_user_id=str(user["id"]),
        email=primary["email"] if primary else None,
        email_verified=primary is not None,
        full_name=user.get("name") or user.get("login"),
        avatar_url=user.get("avatar_url"),
    )
