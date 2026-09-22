"""M44 — incident_history + external_ticket_url

Revision ID: j67e8f9a0b1c
Revises: i56d7e8f9a0b
Create Date: 2026-06-15 12:00:00.000000
"""
import uuid
import sqlalchemy as sa
from alembic import op

revision      = 'j67e8f9a0b1c'
down_revision = 'i56d7e8f9a0b'
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column('incidents',
        sa.Column('external_ticket_url', sa.String(500), nullable=True)
    )
    op.create_table(
        'incident_history',
        sa.Column('id', sa.UUID(), nullable=False, default=uuid.uuid4),
        sa.Column('incident_id', sa.UUID(), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('author_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('from_status', sa.String(30), nullable=False),
        sa.Column('to_status', sa.String(30), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_incident_history_incident_id', 'incident_history', ['incident_id'])


def downgrade() -> None:
    op.drop_index('ix_incident_history_incident_id', table_name='incident_history')
    op.drop_table('incident_history')
    op.drop_column('incidents', 'external_ticket_url')
