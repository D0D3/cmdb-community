"""monitoring: ajout type kuma (Uptime Kuma)

Revision ID: u78i9j0k1l2m
Revises: t67h8i9j0k1l
Create Date: 2026-06-16
"""
from alembic import op

revision = 'u78i9j0k1l2m'
down_revision = 't67h8i9j0k1l'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE monitoring_connectors DROP CONSTRAINT IF EXISTS ck_monitoring_connector_type")
    op.execute(
        "ALTER TABLE monitoring_connectors ADD CONSTRAINT ck_monitoring_connector_type "
        "CHECK (connector_type IN ('zabbix','alertmanager','grafana','prtg','snmp','kuma','generic'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE monitoring_connectors DROP CONSTRAINT IF EXISTS ck_monitoring_connector_type")
    op.execute(
        "ALTER TABLE monitoring_connectors ADD CONSTRAINT ck_monitoring_connector_type "
        "CHECK (connector_type IN ('zabbix','alertmanager','grafana','prtg','snmp','generic'))"
    )
