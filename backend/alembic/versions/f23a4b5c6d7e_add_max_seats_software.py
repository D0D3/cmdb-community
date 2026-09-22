"""add max_seats to software_details

Revision ID: f23a4b5c6d7e
Revises: e12f3a4b5c6d
Create Date: 2026-06-13 23:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f23a4b5c6d7e'
down_revision = 'e12f3a4b5c6d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('software_details', sa.Column('max_seats', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('software_details', 'max_seats')
