"""initial schema

Revision ID: a1f3c9e27b40
Revises:
Create Date: 2026-10-03 00:00:00.000000+00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1f3c9e27b40"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("avatar_url", sa.String(length=1024), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("provider_user_id", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("provider IN ('google', 'github')", name=op.f("ck_oauth_accounts_provider_valid")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_oauth_accounts_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_oauth_accounts")),
        sa.UniqueConstraint("provider", "provider_user_id", name=op.f("uq_oauth_accounts_provider")),
    )
    op.create_index(op.f("ix_oauth_accounts_user_id"), "oauth_accounts", ["user_id"], unique=False)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_refresh_tokens_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
    )
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False)

    op.create_table(
        "resumes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("parsed_text", sa.Text(), nullable=True),
        sa.Column("parsed_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_resumes_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_resumes")),
    )
    op.create_index(op.f("ix_resumes_user_id"), "resumes", ["user_id"], unique=False)

    op.create_table(
        "interviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("resume_id", sa.Uuid(), nullable=True),
        sa.Column("role", sa.String(length=255), nullable=False),
        sa.Column("company", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="in_progress", nullable=False),
        sa.Column("total_score", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('in_progress', 'completed')", name=op.f("ck_interviews_status_valid")),
        sa.CheckConstraint("total_score BETWEEN 0 AND 30", name=op.f("ck_interviews_total_score_range")),
        sa.ForeignKeyConstraint(["resume_id"], ["resumes.id"], name=op.f("fk_interviews_resume_id_resumes"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_interviews_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_interviews")),
    )
    op.create_index("ix_interviews_status_total_score", "interviews", ["status", "total_score"], unique=False)
    op.create_index(op.f("ix_interviews_user_id"), "interviews", ["user_id"], unique=False)

    op.create_table(
        "questions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("focus_area", sa.String(length=255), nullable=True),
        sa.CheckConstraint("position BETWEEN 1 AND 3", name=op.f("ck_questions_position_range")),
        sa.ForeignKeyConstraint(["interview_id"], ["interviews.id"], name=op.f("fk_questions_interview_id_interviews"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_questions")),
        sa.UniqueConstraint("interview_id", "position", name=op.f("uq_questions_interview_id")),
    )

    op.create_table(
        "answers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("answer_text", sa.Text(), nullable=False),
        sa.Column("score", sa.SmallInteger(), nullable=False),
        sa.Column("feedback", sa.Text(), nullable=False),
        sa.Column("weak_areas", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("score BETWEEN 0 AND 10", name=op.f("ck_answers_score_range")),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], name=op.f("fk_answers_question_id_questions"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_answers")),
        sa.UniqueConstraint("question_id", name=op.f("uq_answers_question_id")),
    )

    op.create_table(
        "roadmaps",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("weak_areas", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("items", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["interview_id"], ["interviews.id"], name=op.f("fk_roadmaps_interview_id_interviews"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roadmaps")),
        sa.UniqueConstraint("interview_id", name=op.f("uq_roadmaps_interview_id")),
    )


def downgrade() -> None:
    op.drop_table("roadmaps")
    op.drop_table("answers")
    op.drop_table("questions")
    op.drop_index(op.f("ix_interviews_user_id"), table_name="interviews")
    op.drop_index("ix_interviews_status_total_score", table_name="interviews")
    op.drop_table("interviews")
    op.drop_index(op.f("ix_resumes_user_id"), table_name="resumes")
    op.drop_table("resumes")
    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index(op.f("ix_oauth_accounts_user_id"), table_name="oauth_accounts")
    op.drop_table("oauth_accounts")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
