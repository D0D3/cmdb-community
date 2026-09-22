"""users: ajout last_active_at pour indicateur de présence

Revision ID: a34o5p6q7r8s
Revises: z23n4o5p6q7r
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

revision = 'a34o5p6q7r8s'
down_revision = 'z23n4o5p6q7r'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column(
        'last_active_at',
        sa.DateTime(timezone=True),
        nullable=True,
    ))


def downgrade() -> None:
    op.drop_column('users', 'last_active_at')
