import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.resume import Resume
    from app.models.user import User

QUESTIONS_PER_INTERVIEW = 3
MAX_SCORE_PER_QUESTION = 10
MAX_TOTAL_SCORE = QUESTIONS_PER_INTERVIEW * MAX_SCORE_PER_QUESTION


class Interview(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "interviews"
    __table_args__ = (
        CheckConstraint(
            "status IN ('in_progress', 'completed')", name="status_valid"
        ),
        CheckConstraint(
            f"total_score BETWEEN 0 AND {MAX_TOTAL_SCORE}", name="total_score_range"
        ),
        Index("ix_interviews_status_total_score", "status", "total_score"),
        Index("ix_interviews_user_id_completed_at", "user_id", "completed_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Kept nullable so interview history survives a resume being deleted.
    resume_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("resumes.id", ondelete="SET NULL")
    )
    role: Mapped[str] = mapped_column(String(255))
    company: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), server_default="in_progress")
    total_score: Mapped[int | None] = mapped_column(Integer)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="interviews")
    resume: Mapped["Resume | None"] = relationship(back_populates="interviews")
    questions: Mapped[list["Question"]] = relationship(
        back_populates="interview",
        cascade="all, delete-orphan",
        order_by="Question.position",
    )
    roadmap: Mapped["Roadmap | None"] = relationship(
        back_populates="interview", cascade="all, delete-orphan"
    )


class Question(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "questions"
    __table_args__ = (
        UniqueConstraint("interview_id", "position"),
        CheckConstraint(
            f"position BETWEEN 1 AND {QUESTIONS_PER_INTERVIEW}", name="position_range"
        ),
    )

    interview_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interviews.id", ondelete="CASCADE")
    )
    position: Mapped[int] = mapped_column(SmallInteger)
    question_text: Mapped[str] = mapped_column(Text)
    # The topic label, e.g. "System Design". Analytics group by this.
    focus_area: Mapped[str | None] = mapped_column(String(255))
    what_it_tests: Mapped[str | None] = mapped_column(Text)

    interview: Mapped[Interview] = relationship(back_populates="questions")
    answer: Mapped["Answer | None"] = relationship(
        back_populates="question", cascade="all, delete-orphan"
    )


class Answer(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "answers"
    __table_args__ = (
        CheckConstraint(
            f"score BETWEEN 0 AND {MAX_SCORE_PER_QUESTION}", name="score_range"
        ),
    )

    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), unique=True
    )
    answer_text: Mapped[str] = mapped_column(Text)
    # Evaluation fields stay null until all answers are in and scored together.
    score: Mapped[int | None] = mapped_column(SmallInteger)
    what_was_good: Mapped[str | None] = mapped_column(Text)
    what_was_missing: Mapped[str | None] = mapped_column(Text)
    better_answer: Mapped[str | None] = mapped_column(Text)
    weak_topics: Mapped[list[str] | None] = mapped_column(JSONB)
    evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    question: Mapped[Question] = relationship(back_populates="answer")


class Roadmap(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "roadmaps"

    interview_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interviews.id", ondelete="CASCADE"), unique=True
    )
    summary: Mapped[str | None] = mapped_column(Text)
    weak_areas: Mapped[list[str]] = mapped_column(JSONB)
    # Each item: {topic, priority, why, study_steps, resources, estimated_hours}.
    items: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)

    interview: Mapped[Interview] = relationship(back_populates="roadmap")
