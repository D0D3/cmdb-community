"""M51 — ajout m365_calendar connector + m365_event_id sur maintenance_schedules

Revision ID: r45f6a7b8c9d
Revises: q34e5f6a7b8c
Create Date: 2026-06-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision      = 'r45f6a7b8c9d'
down_revision = 'q34e5f6a7b8c'
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # Colonne m365_event_id sur les maintenances
    op.add_column(
        "maintenance_schedules",
        sa.Column("m365_event_id", sa.String(500), nullable=True),
    )

    # Ajouter m365_calendar au type de connecteur autorisé
    op.execute("ALTER TABLE connectors DROP CONSTRAINT IF EXISTS ck_connector_type")
    op.execute(
        "ALTER TABLE connectors ADD CONSTRAINT ck_connector_type "
        "CHECK (connector_type IN ('ldap','glpi','servicenow','jira','atera',"
        "'freshservice','zendesk','intune','entra','custom',"
        "'postgresql','mysql','mssql','oracle','mongodb','smtp','ssh','saml','m365_calendar'))"
    )


def downgrade() -> None:
    op.drop_column("maintenance_schedules", "m365_event_id")
    op.execute("ALTER TABLE connectors DROP CONSTRAINT IF EXISTS ck_connector_type")
    op.execute(
        "ALTER TABLE connectors ADD CONSTRAINT ck_connector_type "
        "CHECK (connector_type IN ('ldap','glpi','servicenow','jira','atera',"
        "'freshservice','zendesk','intune','entra','custom',"
        "'postgresql','mysql','mssql','oracle','mongodb','smtp','ssh','saml'))"
    )
