"""add ci_key_users table

Revision ID: 4b7d3e9f2a1c
Revises: 3a9c2e7f1b8d
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = '4b7d3e9f2a1c'
down_revision = '3a9c2e7f1b8d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'ci_key_users',
        sa.Column('id',                 sa.UUID(),                  nullable=False),
        sa.Column('ci_id',              sa.UUID(),                  nullable=False),
        sa.Column('user_type',          sa.String(10),              nullable=False),
        sa.Column('local_user_id',      sa.UUID(),                  nullable=True),
        sa.Column('entra_oid',          sa.String(36),              nullable=True),
        sa.Column('entra_email',        sa.String(200),             nullable=True),
        sa.Column('entra_display_name', sa.String(200),             nullable=True),
        sa.Column('entra_job_title',    sa.String(200),             nullable=True),
        sa.Column('entra_department',   sa.String(200),             nullable=True),
        sa.Column('role',               sa.String(20),              nullable=False, server_default='key_user'),
        sa.Column('notes',              sa.Text(),                  nullable=True),
        sa.Column('created_at',         sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at',         sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['ci_id'],         ['cis.id'],   ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['local_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("user_type IN ('local','entra')",                          name='ck_ku_user_type'),
        sa.CheckConstraint("role IN ('key_user','owner','referent','local_admin')",   name='ck_ku_role'),
    )
    op.create_index('ix_ci_key_users_ci_id', 'ci_key_users', ['ci_id'])


def downgrade():
    op.drop_index('ix_ci_key_users_ci_id', table_name='ci_key_users')
    op.drop_table('ci_key_users')
