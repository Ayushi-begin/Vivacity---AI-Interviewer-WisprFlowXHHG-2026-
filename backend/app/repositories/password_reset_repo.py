import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PasswordResetOTP


async def create(
    session: AsyncSession, *, user_id: uuid.UUID, otp_hash: str, expires_at: datetime
) -> PasswordResetOTP:
    otp = PasswordResetOTP(user_id=user_id, otp_hash=otp_hash, expires_at=expires_at)
    session.add(otp)
    await session.flush()
    return otp


async def get_active(session: AsyncSession, user_id: uuid.UUID) -> PasswordResetOTP | None:
    """The user's current unused OTP. At most one exists, since issuing a new one
    invalidates the rest."""
    result = await session.execute(
        select(PasswordResetOTP).where(
            PasswordResetOTP.user_id == user_id, PasswordResetOTP.used_at.is_(None)
        )
    )
    return result.scalars().first()


async def increment_attempts(session: AsyncSession, otp_id: uuid.UUID) -> int:
    """Atomically bump the attempt counter and return the new value, so parallel
    guesses can't slip past the limit."""
    result = await session.execute(
        update(PasswordResetOTP)
        .where(PasswordResetOTP.id == otp_id)
        .values(attempts=PasswordResetOTP.attempts + 1)
        .returning(PasswordResetOTP.attempts)
    )
    return result.scalar_one()


async def mark_used(session: AsyncSession, otp_id: uuid.UUID, at: datetime) -> None:
    await session.execute(
        update(PasswordResetOTP)
        .where(PasswordResetOTP.id == otp_id)
        .values(used_at=at)
        .execution_options(synchronize_session="fetch")
    )


async def invalidate_all_for_user(
    session: AsyncSession, user_id: uuid.UUID, at: datetime
) -> None:
    await session.execute(
        update(PasswordResetOTP)
        .where(PasswordResetOTP.user_id == user_id, PasswordResetOTP.used_at.is_(None))
        .values(used_at=at)
        .execution_options(synchronize_session="fetch")
    )
