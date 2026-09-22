"""add connectors table

Revision ID: 2f8a1b3c4d5e
Revises: adbdffe6c3a2
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = '2f8a1b3c4d5e'
down_revision = 'adbdffe6c3a2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'connectors',
        sa.Column('id',               sa.UUID(),          nullable=False),
        sa.Column('name',             sa.String(100),     nullable=False),
        sa.Column('connector_type',   sa.String(30),      nullable=False),
        sa.Column('config_encrypted', sa.Text(),          nullable=True),
        sa.Column('enabled',          sa.Boolean(),       nullable=False, server_default='false'),
        sa.Column('last_test_at',     sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_test_ok',     sa.Boolean(),       nullable=True),
        sa.Column('last_test_message',sa.String(500),     nullable=True),
        sa.Column('last_sync_at',     sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_sync_result', sa.JSON(),          nullable=True),
        sa.Column('created_at',       sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at',       sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='uq_connector_name'),
        sa.CheckConstraint(
            "connector_type IN ('ldap','glpi','servicenow','jira','atera',"
            "'freshservice','zendesk','intune','entra','custom')",
            name='ck_connector_type',
        ),
    )
    op.create_index('ix_connectors_connector_type', 'connectors', ['connector_type'])


def downgrade():
    op.drop_index('ix_connectors_connector_type', table_name='connectors')
    op.drop_table('connectors')
