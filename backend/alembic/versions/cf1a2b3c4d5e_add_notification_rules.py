"""add notification rules

Revision ID: cf1a2b3c4d5e
Revises: be5f6a7b8c9d
Create Date: 2026-06-13 20:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'cf1a2b3c4d5e'
down_revision = 'be5f6a7b8c9d'
branch_labels = None
depends_on = None

_DEFAULTS = [
    ('alert_critical',   True),
    ('incident_critical', True),
    ('incident_open',    False),
    ('rfc_submitted',    True),
    ('rfc_decision',     True),
    ('rfc_completed',    False),
]


def upgrade() -> None:
    op.create_table(
        'notification_rules',
        sa.Column('id',               sa.UUID(),     nullable=False, primary_key=True),
        sa.Column('event_type',       sa.String(50), nullable=False),
        sa.Column('enabled',          sa.Boolean(),  nullable=False, server_default='false'),
        sa.Column('recipient_emails', sa.JSON(),     nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('event_type', name='uq_notif_event_type'),
    )
    for event_type, enabled in _DEFAULTS:
        op.execute(
            f"INSERT INTO notification_rules (id, event_type, enabled, recipient_emails) "
            f"VALUES (gen_random_uuid(), '{event_type}', {'true' if enabled else 'false'}, '[]')"
        )


def downgrade() -> None:
    op.drop_table('notification_rules')
