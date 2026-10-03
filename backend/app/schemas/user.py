import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    avatar_url: str | None
    # False for accounts created through Google/GitHub that never set a password.
    has_password: bool
    created_at: datetime

    @classmethod
    def from_user(cls, user: Any) -> "UserRead":
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            avatar_url=user.avatar_url,
            has_password=user.hashed_password is not None,
            created_at=user.created_at,
        )


class UserUpdate(BaseModel):
    # Shown on the leaderboard. Blank clears it (the leaderboard then shows "Anonymous").
    full_name: str | None = Field(default=None, max_length=100)

    @field_validator("full_name")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = " ".join(value.split())
        return value or None
