from fastapi import APIRouter, status

from app.api.deps import DBSession
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


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, session: DBSession) -> TokenPair:
    return await auth_service.register(session, data)


@router.post("/login", response_model=TokenPair)
async def login(data: LoginRequest, session: DBSession) -> TokenPair:
    return await auth_service.login(session, data)


@router.post("/refresh", response_model=TokenPair)
async def refresh(data: RefreshRequest, session: DBSession) -> TokenPair:
    return await auth_service.refresh(session, data.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(data: RefreshRequest, session: DBSession) -> None:
    await auth_service.logout(session, data.refresh_token)


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def forgot_password(data: ForgotPasswordRequest, session: DBSession) -> MessageResponse:
    await auth_service.request_password_reset(session, data.email)
    return MessageResponse(message="If that email is registered, a reset code has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(data: ResetPasswordRequest, session: DBSession) -> MessageResponse:
    await auth_service.reset_password(session, data)
    return MessageResponse(message="Password updated. Please sign in again.")
