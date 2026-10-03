import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def get_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def get_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def create(
    session: AsyncSession,
    *,
    email: str,
    hashed_password: str | None = None,
    full_name: str | None = None,
    avatar_url: str | None = None,
) -> User:
    user = User(
        email=email,
        hashed_password=hashed_password,
        full_name=full_name,
        avatar_url=avatar_url,
    )
    session.add(user)
    await session.flush()
    return user


async def update_fields(session: AsyncSession, user: User, **fields: object) -> User:
    for name, value in fields.items():
        setattr(user, name, value)
    await session.flush()
    return user
