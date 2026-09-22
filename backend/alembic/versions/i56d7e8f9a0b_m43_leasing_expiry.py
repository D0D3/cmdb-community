"""M43 — ajout leasing_expiry à la contrainte ck_alert_kind

Revision ID: i56d7e8f9a0b
Revises: h45c6d7e8f9a
Create Date: 2026-06-15 10:00:00.000000
"""
from alembic import op

revision      = 'i56d7e8f9a0b'
down_revision = 'h45c6d7e8f9a'
branch_labels = None
depends_on    = None

_NEW = (
    "kind IN ('cve_match','warranty_expiry','leasing_expiry','license_expiry',"
    "'eol','sla_expiry','maintenance_due','app_update')"
)
_OLD = (
    "kind IN ('cve_match','warranty_expiry','license_expiry','eol',"
    "'sla_expiry','maintenance_due','app_update')"
)


def upgrade() -> None:
    op.execute("ALTER TABLE alerts DROP CONSTRAINT IF EXISTS ck_alert_kind")
    op.execute(f"ALTER TABLE alerts ADD CONSTRAINT ck_alert_kind CHECK ({_NEW})")


def downgrade() -> None:
    op.execute("ALTER TABLE alerts DROP CONSTRAINT IF EXISTS ck_alert_kind")
    op.execute(f"ALTER TABLE alerts ADD CONSTRAINT ck_alert_kind CHECK ({_OLD})")
