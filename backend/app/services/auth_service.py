import uuid
from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AuthenticationError, BadRequestError, ConflictError
from app.core.security import (
    as_utc,
    create_access_token,
    generate_otp,
    generate_refresh_token,
    hash_otp,
    hash_password,
    hash_token,
    otp_matches,
    utcnow,
    verify_password,
)
from app.models import User
from app.repositories import password_reset_repo, refresh_token_repo, user_repo
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenPair,
)
from app.services import notification_service

INVALID_CREDENTIALS = "Incorrect email or password"
INVALID_REFRESH_TOKEN = "Invalid or expired refresh token"
INVALID_OTP = "Invalid or expired code"


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def issue_tokens(session: AsyncSession, user: User) -> TokenPair:
    """Create an access/refresh pair. The caller commits."""
    refresh_token = generate_refresh_token()
    await refresh_token_repo.create(
        session,
        user_id=user.id,
        token_hash=hash_token(refresh_token),
        expires_at=utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


async def register(session: AsyncSession, data: RegisterRequest) -> TokenPair:
    email = normalize_email(data.email)
    if await user_repo.get_by_email(session, email):
        raise ConflictError("An account with this email already exists")
    try:
        user = await user_repo.create(
            session,
            email=email,
            hashed_password=hash_password(data.password),
            full_name=data.full_name,
        )
    except IntegrityError:  # lost a race with a concurrent signup
        await session.rollback()
        raise ConflictError("An account with this email already exists") from None
    tokens = await issue_tokens(session, user)
    await session.commit()
    return tokens


async def login(session: AsyncSession, data: LoginRequest) -> TokenPair:
    user = await user_repo.get_by_email(session, normalize_email(data.email))
    # Always run a hash check so response time doesn't reveal whether the email exists.
    password_ok = verify_password(data.password, user.hashed_password if user else None)
    if user is None or not password_ok or not user.is_active:
        raise AuthenticationError(INVALID_CREDENTIALS)
    tokens = await issue_tokens(session, user)
    await session.commit()
    return tokens


async def refresh(session: AsyncSession, refresh_token: str) -> TokenPair:
    """Rotate a refresh token: the old one is revoked and a new pair is issued."""
    token = await refresh_token_repo.get_by_hash(session, hash_token(refresh_token))
    if token is None:
        raise AuthenticationError(INVALID_REFRESH_TOKEN)

    now = utcnow()
    if token.revoked_at is not None:
        # A rotated token was replayed, so it may have been stolen.
        # Sign the user out everywhere.
        await refresh_token_repo.revoke_all_for_user(session, token.user_id, now)
        await session.commit()
        raise AuthenticationError(INVALID_REFRESH_TOKEN)
    if as_utc(token.expires_at) <= now:
        raise AuthenticationError(INVALID_REFRESH_TOKEN)

    user = await user_repo.get_by_id(session, token.user_id)
    if user is None or not user.is_active:
        raise AuthenticationError(INVALID_REFRESH_TOKEN)

    await refresh_token_repo.revoke(session, token, now)
    tokens = await issue_tokens(session, user)
    await session.commit()
    return tokens


async def logout(session: AsyncSession, refresh_token: str) -> None:
    """Revoke the given refresh token. Unknown or already-revoked tokens are a no-op."""
    token = await refresh_token_repo.get_by_hash(session, hash_token(refresh_token))
    if token is not None and token.revoked_at is None:
        await refresh_token_repo.revoke(session, token, utcnow())
        await session.commit()


async def get_active_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await user_repo.get_by_id(session, user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("Could not validate credentials")
    return user


async def request_password_reset(session: AsyncSession, email: str) -> None:
    """Send a reset OTP if the account exists. Callers always get the same response,
    so this can't be used to discover registered emails."""
    user = await user_repo.get_by_email(session, normalize_email(email))
    if user is None or not user.is_active:
        return

    now = utcnow()
    await password_reset_repo.invalidate_all_for_user(session, user.id, now)
    otp = generate_otp()
    await password_reset_repo.create(
        session,
        user_id=user.id,
        otp_hash=hash_otp(otp),
        expires_at=now + timedelta(minutes=settings.PASSWORD_RESET_OTP_EXPIRE_MINUTES),
    )
    await session.commit()
    notification_service.send_password_reset_otp(
        user.email, otp, settings.PASSWORD_RESET_OTP_EXPIRE_MINUTES
    )


async def reset_password(session: AsyncSession, data: ResetPasswordRequest) -> None:
    user = await user_repo.get_by_email(session, normalize_email(data.email))
    if user is None or not user.is_active:
        raise BadRequestError(INVALID_OTP)

    otp = await password_reset_repo.get_active(session, user.id)
    now = utcnow()
    if otp is None or as_utc(otp.expires_at) <= now:
        raise BadRequestError(INVALID_OTP)

    # Count the attempt before checking, so the limit holds under parallel requests.
    max_attempts = settings.PASSWORD_RESET_OTP_MAX_ATTEMPTS
    attempts = await password_reset_repo.increment_attempts(session, otp.id)
    if attempts > max_attempts or not otp_matches(data.otp, otp.otp_hash):
        if attempts >= max_attempts:
            await password_reset_repo.mark_used(session, otp.id, now)
        await session.commit()
        raise BadRequestError(INVALID_OTP)

    await password_reset_repo.mark_used(session, otp.id, now)
    await user_repo.update_fields(session, user, hashed_password=hash_password(data.new_password))
    # A password reset signs out every existing session.
    await refresh_token_repo.revoke_all_for_user(session, user.id, now)
    await session.commit()
