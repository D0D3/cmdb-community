"""M52 — avatar utilisateur (avatar_data, avatar_mime sur users)

Revision ID: s56g7h8i9j0k
Revises: r45f6a7b8c9d
Create Date: 2026-06-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision      = 's56g7h8i9j0k'
down_revision = 'r45f6a7b8c9d'
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_data", sa.Text,         nullable=True))
    op.add_column("users", sa.Column("avatar_mime", sa.String(50),   nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_data")
    op.drop_column("users", "avatar_mime")
