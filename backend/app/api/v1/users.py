from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.user import UserRead, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_me(user: CurrentUser) -> UserRead:
    return UserRead.from_user(user)


@router.patch("/me", response_model=UserRead)
async def update_me(data: UserUpdate, session: DBSession, user: CurrentUser) -> UserRead:
    return UserRead.from_user(await user_service.update_profile(session, user, data))
