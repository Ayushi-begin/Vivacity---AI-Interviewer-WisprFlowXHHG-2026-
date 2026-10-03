import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OAuthAccount


async def get(
    session: AsyncSession, provider: str, provider_user_id: str
) -> OAuthAccount | None:
    result = await session.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_user_id == provider_user_id,
        )
    )
    return result.scalar_one_or_none()


async def create(
    session: AsyncSession, *, user_id: uuid.UUID, provider: str, provider_user_id: str
) -> OAuthAccount:
    account = OAuthAccount(
        user_id=user_id, provider=provider, provider_user_id=provider_user_id
    )
    session.add(account)
    await session.flush()
    return account
