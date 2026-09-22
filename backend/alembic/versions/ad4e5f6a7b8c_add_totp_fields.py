"""add totp fields to users

Revision ID: ad4e5f6a7b8c
Revises: 9c3d4e5f6a7b
Create Date: 2026-06-13 15:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'ad4e5f6a7b8c'
down_revision = '9c3d4e5f6a7b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('totp_secret', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('totp_enabled', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('users', 'totp_enabled')
    op.drop_column('users', 'totp_secret')
