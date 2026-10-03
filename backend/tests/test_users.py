from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import create_access_token
from app.models import User
from tests.utils import auth_headers


async def test_me_reports_has_password(
    client: AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    headers = await auth_headers(client)
    assert (await client.get("/api/v1/users/me", headers=headers)).json()["has_password"] is True

    async with session_factory() as session:
        oauth_user = User(email="oauth@example.com", hashed_password=None)
        session.add(oauth_user)
        await session.commit()
        token = create_access_token(oauth_user.id)
    resp = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["has_password"] is False


async def test_update_display_name(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    resp = await client.patch("/api/v1/users/me", headers=headers, json={"full_name": "  Ada   King "})
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Ada King"
    assert (await client.get("/api/v1/users/me", headers=headers)).json()["full_name"] == "Ada King"


async def test_blank_name_clears_it(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    resp = await client.patch("/api/v1/users/me", headers=headers, json={"full_name": "   "})
    assert resp.json()["full_name"] is None


async def test_update_validates_and_requires_auth(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    resp = await client.patch("/api/v1/users/me", headers=headers, json={"full_name": "x" * 101})
    assert resp.status_code == 422
    assert (await client.patch("/api/v1/users/me", json={"full_name": "x"})).status_code == 401


async def test_cannot_change_email_through_profile_update(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    await client.patch(
        "/api/v1/users/me", headers=headers, json={"full_name": "Ada", "email": "evil@example.com"}
    )
    assert (await client.get("/api/v1/users/me", headers=headers)).json()["email"] == "ada@example.com"
