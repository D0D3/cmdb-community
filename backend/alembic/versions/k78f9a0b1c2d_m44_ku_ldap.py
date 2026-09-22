"""M44 — Key Users LDAP source + colonnes ldap_*

Revision ID: k78f9a0b1c2d
Revises: j67e8f9a0b1c
Create Date: 2026-06-15 14:00:00.000000
"""
import sqlalchemy as sa
from alembic import op

revision      = 'k78f9a0b1c2d'
down_revision = 'j67e8f9a0b1c'
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column('ci_key_users', sa.Column('ldap_dn',           sa.String(500), nullable=True))
    op.add_column('ci_key_users', sa.Column('ldap_uid',          sa.String(200), nullable=True))
    op.add_column('ci_key_users', sa.Column('ldap_email',        sa.String(200), nullable=True))
    op.add_column('ci_key_users', sa.Column('ldap_display_name', sa.String(200), nullable=True))
    op.add_column('ci_key_users', sa.Column('ldap_job_title',    sa.String(200), nullable=True))
    op.add_column('ci_key_users', sa.Column('ldap_department',   sa.String(200), nullable=True))

    op.execute("ALTER TABLE ci_key_users DROP CONSTRAINT IF EXISTS ck_ku_user_type")
    op.execute("ALTER TABLE ci_key_users ADD CONSTRAINT ck_ku_user_type CHECK (user_type IN ('local','entra','ldap'))")


def downgrade() -> None:
    op.execute("ALTER TABLE ci_key_users DROP CONSTRAINT IF EXISTS ck_ku_user_type")
    op.execute("ALTER TABLE ci_key_users ADD CONSTRAINT ck_ku_user_type CHECK (user_type IN ('local','entra'))")

    for col in ['ldap_dn', 'ldap_uid', 'ldap_email', 'ldap_display_name', 'ldap_job_title', 'ldap_department']:
        op.drop_column('ci_key_users', col)
