from fastapi import APIRouter, status

from app.api.deps import DBSession
from app.api.rate_limits import per_email, per_ip
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenPair,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=TokenPair,
    status_code=status.HTTP_201_CREATED,
    dependencies=[per_ip("register", 10, 3600)],
)
async def register(data: RegisterRequest, session: DBSession) -> TokenPair:
    return await auth_service.register(session, data)


@router.post("/login", response_model=TokenPair, dependencies=[per_ip("login", 10, 60)])
async def login(data: LoginRequest, session: DBSession) -> TokenPair:
    per_email("login", data.email, 10, 900)
    return await auth_service.login(session, data)


@router.post("/refresh", response_model=TokenPair, dependencies=[per_ip("refresh", 30, 60)])
async def refresh(data: RefreshRequest, session: DBSession) -> TokenPair:
    return await auth_service.refresh(session, data.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(data: RefreshRequest, session: DBSession) -> None:
    await auth_service.logout(session, data.refresh_token)


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[per_ip("forgot_password", 5, 900)],
)
async def forgot_password(data: ForgotPasswordRequest, session: DBSession) -> MessageResponse:
    # Also stops anyone flooding a person's inbox with reset codes.
    per_email("forgot_password", data.email, 3, 900)
    await auth_service.request_password_reset(session, data.email)
    return MessageResponse(message="If that email is registered, a reset code has been sent.")


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    dependencies=[per_ip("reset_password", 10, 900)],
)
async def reset_password(data: ResetPasswordRequest, session: DBSession) -> MessageResponse:
    per_email("reset_password", data.email, 10, 900)
    await auth_service.reset_password(session, data)
    return MessageResponse(message="Password updated. Please sign in again.")
