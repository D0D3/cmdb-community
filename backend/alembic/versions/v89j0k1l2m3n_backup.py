"""backup: tables backup_jobs et backup_runs

Revision ID: v89j0k1l2m3n
Revises: u78i9j0k1l2m
Create Date: 2026-06-16
"""
import sqlalchemy as sa
from alembic import op

revision = 'v89j0k1l2m3n'
down_revision = 'u78i9j0k1l2m'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "backup_jobs",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("schedule", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("retention_count", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("include_uploads", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("schedule IN ('manual','daily','weekly','monthly')", name="ck_backup_schedule"),
    )

    op.create_table(
        "backup_runs",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("job_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("filename", sa.String(300), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("error_msg", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["job_id"], ["backup_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("status IN ('running','success','error')", name="ck_backup_run_status"),
    )
    op.create_index("ix_backup_runs_job_id", "backup_runs", ["job_id"])


def downgrade():
    op.drop_index("ix_backup_runs_job_id", table_name="backup_runs")
    op.drop_table("backup_runs")
    op.drop_table("backup_jobs")
