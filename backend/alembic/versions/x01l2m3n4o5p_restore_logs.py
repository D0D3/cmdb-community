"""backup: table restore_logs

Revision ID: x01l2m3n4o5p
Revises: w90k1l2m3n4o
Create Date: 2026-06-16
"""
import sqlalchemy as sa
from alembic import op

revision = 'x01l2m3n4o5p'
down_revision = 'w90k1l2m3n4o'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "restore_logs",
        sa.Column("id",          sa.UUID(),              nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("source_type", sa.String(20),          nullable=False, server_default="local"),
        sa.Column("source_ref",  sa.String(500),         nullable=True),
        sa.Column("run_id",      sa.UUID(),              nullable=True),
        sa.Column("status",      sa.String(20),          nullable=False, server_default="success"),
        sa.Column("error_msg",   sa.Text(),              nullable=True),
        sa.Column("started_at",  sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["backup_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_restore_logs_started_at", "restore_logs", ["started_at"])


def downgrade():
    op.drop_index("ix_restore_logs_started_at", table_name="restore_logs")
    op.drop_table("restore_logs")
