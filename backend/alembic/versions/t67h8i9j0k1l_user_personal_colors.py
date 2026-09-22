"""M53 — couleurs personnelles par utilisateur (personal_primary_color, personal_sidebar_color)

Revision ID: t67h8i9j0k1l
Revises: s56g7h8i9j0k
Create Date: 2026-06-16 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision      = 't67h8i9j0k1l'
down_revision = 's56g7h8i9j0k'
branch_labels = None
depends_on    = None


def upgrade():
    op.add_column('users', sa.Column('personal_primary_color', sa.String(7), nullable=True))
    op.add_column('users', sa.Column('personal_sidebar_color', sa.String(7), nullable=True))


def downgrade():
    op.drop_column('users', 'personal_primary_color')
    op.drop_column('users', 'personal_sidebar_color')
