from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import create_access_token, utcnow
from app.models import RefreshToken, User
from tests.utils import PASSWORD, login, me, register

# --- Signup ---

async def test_register_returns_tokens_and_me_works(client: AsyncClient) -> None:
    resp = await register(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"] and body["refresh_token"]
    assert body["expires_in"] == 30 * 60

    me_resp = await me(client, body["access_token"])
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "ada@example.com"
    assert me_resp.json()["full_name"] == "Ada Lovelace"
    assert "hashed_password" not in me_resp.json()


async def test_register_duplicate_email_is_case_insensitive(client: AsyncClient) -> None:
    assert (await register(client, email="ada@example.com")).status_code == 201
    resp = await register(client, email="  ADA@Example.com ")
    assert resp.status_code == 409


async def test_register_rejects_short_password_and_bad_email(client: AsyncClient) -> None:
    assert (await register(client, password="short")).status_code == 422
    assert (await register(client, email="not-an-email")).status_code == 422


async def test_password_is_stored_hashed(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await register(client)
    async with session_factory() as session:
        user = (await session.execute(User.__table__.select())).one()
    assert user.hashed_password != PASSWORD
    assert user.hashed_password.startswith("$argon2")


# --- Login ---

async def test_login_success(client: AsyncClient) -> None:
    await register(client)
    resp = await login(client, email="Ada@Example.com")
    assert resp.status_code == 200
    assert (await me(client, resp.json()["access_token"])).status_code == 200


async def test_login_wrong_password_and_unknown_email_look_the_same(client: AsyncClient) -> None:
    await register(client)
    wrong_pw = await login(client, password="wrong-password")
    unknown = await login(client, email="nobody@example.com")
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json() == {"detail": "Incorrect email or password"}


async def test_login_rejected_for_oauth_only_user(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    async with session_factory() as session:
        session.add(User(email="oauth@example.com", hashed_password=None))
        await session.commit()
    assert (await login(client, email="oauth@example.com")).status_code == 401


async def test_login_rejected_for_inactive_user(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await register(client)
    async with session_factory() as session:
        await session.execute(update(User).values(is_active=False))
        await session.commit()
    assert (await login(client)).status_code == 401


# --- /users/me ---

async def test_me_requires_a_valid_access_token(client: AsyncClient) -> None:
    tokens = (await register(client)).json()

    no_header = await client.get("/api/v1/users/me")
    assert no_header.status_code == 401
    assert no_header.headers["www-authenticate"] == "Bearer"

    assert (await me(client, "garbage")).status_code == 401
    # A refresh token is not an access token.
    assert (await me(client, tokens["refresh_token"])).status_code == 401


async def test_me_rejects_token_for_deleted_user(client: AsyncClient) -> None:
    import uuid

    assert (await me(client, create_access_token(uuid.uuid4()))).status_code == 401


# --- Refresh & logout ---

async def test_refresh_rotates_tokens(client: AsyncClient) -> None:
    tokens = (await register(client)).json()
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 200
    new = resp.json()
    assert new["refresh_token"] != tokens["refresh_token"]
    assert (await me(client, new["access_token"])).status_code == 200


async def test_reusing_a_rotated_refresh_token_revokes_all_sessions(client: AsyncClient) -> None:
    old = (await register(client)).json()["refresh_token"]
    new = (await client.post("/api/v1/auth/refresh", json={"refresh_token": old})).json()["refresh_token"]

    replay = await client.post("/api/v1/auth/refresh", json={"refresh_token": old})
    assert replay.status_code == 401
    # The legitimately rotated token is now revoked too.
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": new})).status_code == 401


async def test_expired_refresh_token_is_rejected(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    token = (await register(client)).json()["refresh_token"]
    async with session_factory() as session:
        await session.execute(update(RefreshToken).values(expires_at=utcnow() - timedelta(seconds=1)))
        await session.commit()
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": token})).status_code == 401


async def test_unknown_refresh_token_is_rejected(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": "nope"})
    assert resp.status_code == 401


async def test_logout_revokes_refresh_token(client: AsyncClient) -> None:
    token = (await register(client)).json()["refresh_token"]
    assert (await client.post("/api/v1/auth/logout", json={"refresh_token": token})).status_code == 204
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": token})).status_code == 401
    # Logging out twice is harmless.
    assert (await client.post("/api/v1/auth/logout", json={"refresh_token": token})).status_code == 204
