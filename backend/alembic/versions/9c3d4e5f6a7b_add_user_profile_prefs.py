"""add user profile prefs

Revision ID: 9c3d4e5f6a7b
Revises: 8b2c3d4e5f6a
Create Date: 2026-06-13 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '9c3d4e5f6a7b'
down_revision = '8b2c3d4e5f6a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column(
        'notify_critical_alerts',
        sa.Boolean(),
        nullable=False,
        server_default='true',
    ))


def downgrade() -> None:
    op.drop_column('users', 'notify_critical_alerts')
