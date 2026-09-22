"""monitoring_connectors + monitoring_alerts

Revision ID: q34e5f6a7b8c
Revises: p23d4e5f6a7b
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'q34e5f6a7b8c'
down_revision = 'p23d4e5f6a7b'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'monitoring_connectors',
        sa.Column('id',           sa.UUID(),      nullable=False),
        sa.Column('name',         sa.String(100), nullable=False),
        sa.Column('connector_type', sa.String(20), nullable=False),
        sa.Column('enabled',      sa.Boolean(),   nullable=False, server_default='true'),
        sa.Column('description',  sa.Text(),      nullable=True),
        sa.Column('ingest_key',   sa.UUID(),      nullable=False),
        # SNMP
        sa.Column('snmp_version',       sa.String(5),   nullable=False, server_default='v2c'),
        sa.Column('snmp_port',          sa.Integer(),   nullable=False, server_default='162'),
        sa.Column('snmp_community',     sa.String(100), nullable=True),
        sa.Column('snmp_v3_user',       sa.String(100), nullable=True),
        sa.Column('snmp_v3_auth_proto', sa.String(10),  nullable=True),
        sa.Column('snmp_v3_auth_key_enc', sa.Text(),    nullable=True),
        sa.Column('snmp_v3_priv_proto', sa.String(10),  nullable=True),
        sa.Column('snmp_v3_priv_key_enc', sa.Text(),    nullable=True),
        # Traitement alertes
        sa.Column('auto_create_incident', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('min_severity',  sa.String(20),  nullable=False, server_default='high'),
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ingest_key', name='uq_monitoring_ingest_key'),
        sa.CheckConstraint(
            "connector_type IN ('zabbix','alertmanager','grafana','prtg','snmp','generic')",
            name='ck_monitoring_connector_type',
        ),
        sa.CheckConstraint("snmp_version IN ('v1','v2c','v3')", name='ck_monitoring_snmp_version'),
        sa.CheckConstraint(
            "min_severity IN ('info','low','medium','high','critical')",
            name='ck_monitoring_min_severity',
        ),
    )

    op.create_table(
        'monitoring_alerts',
        sa.Column('id',           sa.UUID(),      nullable=False),
        sa.Column('connector_id', sa.UUID(),      nullable=False),
        sa.Column('source_id',    sa.String(500), nullable=True),
        sa.Column('title',        sa.String(500), nullable=False),
        sa.Column('body',         sa.Text(),      nullable=True),
        sa.Column('severity',     sa.String(20),  nullable=False, server_default='medium'),
        sa.Column('status',       sa.String(20),  nullable=False, server_default='firing'),
        sa.Column('host_hint',    sa.String(300), nullable=True),
        sa.Column('ci_id',        sa.UUID(),      nullable=True),
        sa.Column('incident_id',  sa.UUID(),      nullable=True),
        sa.Column('raw_payload',  sa.JSON(),      nullable=True),
        sa.Column('received_at',  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('resolved_at',  sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['connector_id'], ['monitoring_connectors.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['ci_id'],        ['cis.id'],                   ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['incident_id'],  ['incidents.id'],             ondelete='SET NULL'),
        sa.CheckConstraint(
            "severity IN ('info','low','medium','high','critical')",
            name='ck_monitoring_alert_severity',
        ),
        sa.CheckConstraint(
            "status IN ('firing','resolved')",
            name='ck_monitoring_alert_status',
        ),
    )
    op.create_index('ix_monitoring_alerts_connector_id', 'monitoring_alerts', ['connector_id'])
    op.create_index('ix_monitoring_alerts_source_id',    'monitoring_alerts', ['source_id'])
    op.create_index('ix_monitoring_alerts_ci_id',        'monitoring_alerts', ['ci_id'])
    op.create_index('ix_monitoring_alerts_incident_id',  'monitoring_alerts', ['incident_id'])


def downgrade():
    op.drop_table('monitoring_alerts')
    op.drop_table('monitoring_connectors')
