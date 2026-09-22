"""connectors: retirer les types bases de données (postgresql/mysql/mssql/oracle/mongodb)

Revision ID: y12m3n4o5p6q
Revises: x01l2m3n4o5p
Create Date: 2026-06-17
"""
import sqlalchemy as sa
from alembic import op

revision = 'y12m3n4o5p6q'
down_revision = 'x01l2m3n4o5p'
branch_labels = None
depends_on = None

DB_TYPES = ('postgresql', 'mysql', 'mssql', 'oracle', 'mongodb')


def upgrade() -> None:
    # Supprimer les connecteurs DB existants
    op.execute(
        "DELETE FROM connector_sync_logs WHERE connector_id IN "
        "(SELECT id FROM connectors WHERE connector_type IN "
        "('postgresql','mysql','mssql','oracle','mongodb'))"
    )
    op.execute(
        "DELETE FROM connectors WHERE connector_type IN "
        "('postgresql','mysql','mssql','oracle','mongodb')"
    )

    # Mettre à jour la contrainte CHECK
    op.drop_constraint('ck_connector_type', 'connectors', type_='check')
    op.create_check_constraint(
        'ck_connector_type',
        'connectors',
        "connector_type IN ('ldap','glpi','servicenow','jira','atera',"
        "'freshservice','zendesk','intune','entra','custom',"
        "'smtp','ssh','saml','m365_calendar')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_connector_type', 'connectors', type_='check')
    op.create_check_constraint(
        'ck_connector_type',
        'connectors',
        "connector_type IN ('ldap','glpi','servicenow','jira','atera',"
        "'freshservice','zendesk','intune','entra','custom',"
        "'postgresql','mysql','mssql','oracle','mongodb','smtp','ssh')",
    )
