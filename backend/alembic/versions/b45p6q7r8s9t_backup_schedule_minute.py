"""backup_jobs: ajout schedule_minute pour planification HH:mm

Revision ID: b45p6q7r8s9t
Revises: a34o5p6q7r8s
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

revision = 'b45p6q7r8s9t'
down_revision = 'a34o5p6q7r8s'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('backup_jobs', sa.Column(
        'schedule_minute',
        sa.Integer(),
        nullable=True,
        server_default='0',
    ))


def downgrade() -> None:
    op.drop_column('backup_jobs', 'schedule_minute')
