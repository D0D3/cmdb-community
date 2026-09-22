"""add branding settings

Revision ID: e12f3a4b5c6d
Revises: d01e2f3a4b5c
Create Date: 2026-06-13 23:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision      = 'e12f3a4b5c6d'
down_revision = 'd01e2f3a4b5c'
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        'branding_settings',
        sa.Column('id',            sa.Integer(),    nullable=False, primary_key=True),
        sa.Column('app_name',      sa.String(100),  nullable=False, server_default='Capybara CMDB'),
        sa.Column('primary_color', sa.String(7),    nullable=False, server_default='#6d28d9'),
        sa.Column('sidebar_color', sa.String(7),    nullable=False, server_default='#0f172a'),
        sa.Column('logo_data',     sa.Text(),       nullable=True),
        sa.Column('logo_mime',     sa.String(50),   nullable=True),
        sa.Column('updated_at',    sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('branding_settings')
