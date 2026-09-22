"""add is_locked to users

Revision ID: n01b2c3d4e5f
Revises: m90b1c2d3e4f
Create Date: 2026-06-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'n01b2c3d4e5f'
down_revision = 'm90b1c2d3e4f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_locked', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('users', 'is_locked')
