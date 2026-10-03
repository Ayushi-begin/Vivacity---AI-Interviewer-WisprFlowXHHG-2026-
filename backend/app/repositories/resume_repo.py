import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Resume


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
