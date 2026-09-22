"""add smtp connector type

Revision ID: 8b2c3d4e5f6a
Revises: 7a1b2c3d4e5f
Create Date: 2026-06-13 00:00:00.000000
"""
from alembic import op

revision = '8b2c3d4e5f6a'
down_revision = '7a1b2c3d4e5f'
branch_labels = None
depends_on = None

_OLD = (
    "connector_type IN ('ldap','glpi','servicenow','jira','atera',"
    "'freshservice','zendesk','intune','entra','custom',"
    "'postgresql','mysql','mssql','oracle','mongodb')"
)
_NEW = (
    "connector_type IN ('ldap','glpi','servicenow','jira','atera',"
    "'freshservice','zendesk','intune','entra','custom',"
    "'postgresql','mysql','mssql','oracle','mongodb','smtp')"
)


def upgrade() -> None:
    with op.batch_alter_table('connectors') as batch_op:
        batch_op.drop_constraint('ck_connector_type', type_='check')
        batch_op.create_check_constraint('ck_connector_type', _NEW)


def downgrade() -> None:
    with op.batch_alter_table('connectors') as batch_op:
        batch_op.drop_constraint('ck_connector_type', type_='check')
        batch_op.create_check_constraint('ck_connector_type', _OLD)
