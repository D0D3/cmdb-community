"""add audit_logs

Revision ID: 5d2f8a1e3c4b
Revises: 4b7d3e9f2a1c
Create Date: 2026-06-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '5d2f8a1e3c4b'
down_revision = '4b7d3e9f2a1c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(30), nullable=False),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("entity_name", sa.String(300), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("changes", sa.JSON(), nullable=True),
        sa.Column("performed_by_id", sa.Uuid(), nullable=True),
        sa.Column("performed_by_name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["performed_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"])
    op.create_index("ix_audit_logs_entity_id",   "audit_logs", ["entity_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_entity_id",   table_name="audit_logs")
    op.drop_index("ix_audit_logs_entity_type", table_name="audit_logs")
    op.drop_table("audit_logs")
