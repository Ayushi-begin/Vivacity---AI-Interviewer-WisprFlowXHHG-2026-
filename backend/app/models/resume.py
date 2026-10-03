import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.interview import Interview
    from app.models.user import User


class Resume(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "resumes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(1024))
    parsed_text: Mapped[str | None] = mapped_column(Text)
    # Structured extraction: skills, experience, projects.
    parsed_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    user: Mapped["User"] = relationship(back_populates="resumes")
    interviews: Mapped[list["Interview"]] = relationship(back_populates="resume")
