"""add report jobs

Revision ID: d01e2f3a4b5c
Revises: cf1a2b3c4d5e
Create Date: 2026-06-13 22:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'd01e2f3a4b5c'
down_revision = 'cf1a2b3c4d5e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'report_jobs',
        sa.Column('id',          sa.UUID(),      nullable=False, primary_key=True),
        sa.Column('name',        sa.String(200), nullable=False),
        sa.Column('report_type', sa.String(50),  nullable=False),
        sa.Column('format',      sa.String(10),  nullable=False, server_default='csv'),
        sa.Column('schedule',    sa.String(20),  nullable=False, server_default='manual'),
        sa.Column('recipients',  sa.JSON(),      nullable=False, server_default='[]'),
        sa.Column('is_active',   sa.Boolean(),   nullable=False, server_default='true'),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by',  sa.UUID(),      nullable=True),
        sa.Column('created_at',  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at',  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.CheckConstraint(
            "report_type IN ('inventory','hardware','software','cves','deadlines','incidents','changes')",
            name='ck_rj_report_type'
        ),
        sa.CheckConstraint("format IN ('csv','pdf')", name='ck_rj_format'),
        sa.CheckConstraint(
            "schedule IN ('manual','daily','weekly','monthly')",
            name='ck_rj_schedule'
        ),
    )


def downgrade() -> None:
    op.drop_table('report_jobs')
