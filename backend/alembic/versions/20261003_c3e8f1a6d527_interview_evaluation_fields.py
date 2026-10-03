"""interview evaluation fields

Answers are now stored before scoring and evaluated together after the last one,
with structured feedback instead of a single text blob.

Revision ID: c3e8f1a6d527
Revises: b7d24e5a9c13
Create Date: 2026-10-03 18:00:00.000000+00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3e8f1a6d527"
down_revision: str | None = "b7d24e5a9c13"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("questions", sa.Column("what_it_tests", sa.Text(), nullable=True))

    op.alter_column("answers", "score", existing_type=sa.SmallInteger(), nullable=True)
    op.drop_column("answers", "feedback")
    op.alter_column("answers", "weak_areas", new_column_name="weak_topics")
    op.add_column("answers", sa.Column("what_was_good", sa.Text(), nullable=True))
    op.add_column("answers", sa.Column("what_was_missing", sa.Text(), nullable=True))
    op.add_column("answers", sa.Column("better_answer", sa.Text(), nullable=True))
    op.add_column("answers", sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("roadmaps", sa.Column("summary", sa.Text(), nullable=True))

    op.create_index(
        "ix_interviews_user_id_completed_at", "interviews", ["user_id", "completed_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_interviews_user_id_completed_at", table_name="interviews")

    op.drop_column("roadmaps", "summary")

    op.drop_column("answers", "evaluated_at")
    op.drop_column("answers", "better_answer")
    op.drop_column("answers", "what_was_missing")
    op.drop_column("answers", "what_was_good")
    op.alter_column("answers", "weak_topics", new_column_name="weak_areas")
    # Unscored answers can't satisfy the old NOT NULL columns.
    op.execute("DELETE FROM answers WHERE score IS NULL")
    op.add_column("answers", sa.Column("feedback", sa.Text(), nullable=False, server_default=""))
    op.alter_column("answers", "feedback", server_default=None)
    op.alter_column("answers", "score", existing_type=sa.SmallInteger(), nullable=False)

    op.drop_column("questions", "what_it_tests")
