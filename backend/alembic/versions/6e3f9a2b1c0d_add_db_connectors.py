"""add db connector types (postgresql, mysql, mssql, oracle, mongodb)

Revision ID: 6e3f9a2b1c0d
Revises: 5d2f8a1e3c4b
Create Date: 2026-06-13 00:00:00.000000

"""
from alembic import op

revision = '6e3f9a2b1c0d'
down_revision = '5d2f8a1e3c4b'
branch_labels = None
depends_on = None

_OLD = (
    "connector_type IN ('ldap','glpi','servicenow','jira','atera',"
    "'freshservice','zendesk','intune','entra','custom')"
)
_NEW = (
    "connector_type IN ('ldap','glpi','servicenow','jira','atera',"
    "'freshservice','zendesk','intune','entra','custom',"
    "'postgresql','mysql','mssql','oracle','mongodb')"
)


def upgrade() -> None:
    with op.batch_alter_table('connectors') as batch_op:
        batch_op.drop_constraint('ck_connector_type', type_='check')
        batch_op.create_check_constraint('ck_connector_type', _NEW)


def downgrade() -> None:
    with op.batch_alter_table('connectors') as batch_op:
        batch_op.drop_constraint('ck_connector_type', type_='check')
        batch_op.create_check_constraint('ck_connector_type', _OLD)
