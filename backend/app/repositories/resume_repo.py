import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Interview, Resume


async def create(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    filename: str,
    storage_path: str,
    parsed_text: str,
) -> Resume:
    resume = Resume(
        user_id=user_id, filename=filename, storage_path=storage_path, parsed_text=parsed_text
    )
    session.add(resume)
    await session.flush()
    return resume


async def get(session: AsyncSession, resume_id: uuid.UUID) -> Resume | None:
    return await session.get(Resume, resume_id)


async def count_interviews(session: AsyncSession, resume_id: uuid.UUID) -> int:
    count = await session.scalar(
        select(func.count()).select_from(Interview).where(Interview.resume_id == resume_id)
    )
    return count or 0


async def delete(session: AsyncSession, resume: Resume) -> None:
    await session.delete(resume)
    await session.flush()
