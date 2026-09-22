"""branding: login_bg_enabled

Revision ID: m90b1c2d3e4f
Revises: k78f9a0b1c2d
Create Date: 2026-06-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'm90b1c2d3e4f'
down_revision = 'k78f9a0b1c2d'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('branding_settings',
        sa.Column('login_bg_enabled', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade():
    op.drop_column('branding_settings', 'login_bg_enabled')
