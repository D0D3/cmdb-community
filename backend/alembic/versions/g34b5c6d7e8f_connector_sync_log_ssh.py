"""connector sync log + SSH type + sync_interval_hours

Revision ID: g34b5c6d7e8f
Revises: f23a4b5c6d7e
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa

revision = 'g34b5c6d7e8f'
down_revision = 'f23a4b5c6d7e'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('connectors',
        sa.Column('sync_interval_hours', sa.Integer(), nullable=True))

    # Mettre à jour la contrainte CHECK pour inclure 'ssh'
    op.drop_constraint('ck_connector_type', 'connectors', type_='check')
    op.create_check_constraint(
        'ck_connector_type',
        'connectors',
        "connector_type IN ('ldap','glpi','servicenow','jira','atera',"
        "'freshservice','zendesk','intune','entra','custom',"
        "'postgresql','mysql','mssql','oracle','mongodb','smtp','ssh')",
    )

    op.create_table(
        'connector_sync_logs',
        sa.Column('id',           sa.UUID(),          nullable=False),
        sa.Column('connector_id', sa.UUID(),          nullable=False),
        sa.Column('started_at',   sa.DateTime(timezone=True), nullable=False),
        sa.Column('finished_at',  sa.DateTime(timezone=True), nullable=True),
        sa.Column('status',       sa.String(20),      nullable=False),
        sa.Column('result',       sa.JSON(),          nullable=True),
        sa.Column('error',        sa.Text(),          nullable=True),
        sa.Column('triggered_by', sa.String(30),      nullable=False, server_default='auto'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['connector_id'], ['connectors.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_connector_sync_logs_connector_id',
                    'connector_sync_logs', ['connector_id'])


def downgrade():
    op.drop_table('connector_sync_logs')
    op.drop_constraint('ck_connector_type', 'connectors', type_='check')
    op.create_check_constraint(
        'ck_connector_type',
        'connectors',
        "connector_type IN ('ldap','glpi','servicenow','jira','atera',"
        "'freshservice','zendesk','intune','entra','custom',"
        "'postgresql','mysql','mssql','oracle','mongodb','smtp')",
    )
    op.drop_column('connectors', 'sync_interval_hours')
