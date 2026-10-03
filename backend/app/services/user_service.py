from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.repositories import user_repo
from app.schemas.user import UserUpdate


async def update_profile(session: AsyncSession, user: User, data: UserUpdate) -> User:
    await user_repo.update_fields(session, user, full_name=data.full_name)
    await session.commit()
    return user
