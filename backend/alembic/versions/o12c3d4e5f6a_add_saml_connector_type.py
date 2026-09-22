"""add saml to connector_type constraint

Revision ID: o12c3d4e5f6a
Revises: n01b2c3d4e5f
Create Date: 2026-06-15 00:00:00.000000
"""
from alembic import op

revision = 'o12c3d4e5f6a'
down_revision = 'n01b2c3d4e5f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE connectors DROP CONSTRAINT IF EXISTS ck_connector_type")
    op.execute(
        "ALTER TABLE connectors ADD CONSTRAINT ck_connector_type "
        "CHECK (connector_type IN ('ldap','glpi','servicenow','jira','atera',"
        "'freshservice','zendesk','intune','entra','custom',"
        "'postgresql','mysql','mssql','oracle','mongodb','smtp','ssh','saml'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE connectors DROP CONSTRAINT IF EXISTS ck_connector_type")
    op.execute(
        "ALTER TABLE connectors ADD CONSTRAINT ck_connector_type "
        "CHECK (connector_type IN ('ldap','glpi','servicenow','jira','atera',"
        "'freshservice','zendesk','intune','entra','custom',"
        "'postgresql','mysql','mssql','oracle','mongodb','smtp','ssh'))"
    )
