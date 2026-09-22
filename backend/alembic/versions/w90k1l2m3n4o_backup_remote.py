"""backup: champs destination distante (SFTP / SMB)

Revision ID: w90k1l2m3n4o
Revises: v89j0k1l2m3n
Create Date: 2026-06-16
"""
import sqlalchemy as sa
from alembic import op

revision = 'w90k1l2m3n4o'
down_revision = 'v89j0k1l2m3n'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('backup_jobs', sa.Column('remote_enabled',   sa.Boolean(),     nullable=False, server_default='false'))
    op.add_column('backup_jobs', sa.Column('remote_type',      sa.String(10),    nullable=True))
    op.add_column('backup_jobs', sa.Column('remote_host',      sa.String(255),   nullable=True))
    op.add_column('backup_jobs', sa.Column('remote_port',      sa.Integer(),     nullable=True))
    op.add_column('backup_jobs', sa.Column('remote_user',      sa.String(100),   nullable=True))
    op.add_column('backup_jobs', sa.Column('remote_password',  sa.String(500),   nullable=True))
    op.add_column('backup_jobs', sa.Column('remote_path',      sa.String(500),   nullable=True))
    op.add_column('backup_jobs', sa.Column('remote_ssh_key',   sa.Text(),        nullable=True))
    op.add_column('backup_jobs', sa.Column('remote_smb_share', sa.String(100),   nullable=True))


def downgrade():
    for col in ('remote_smb_share', 'remote_ssh_key', 'remote_path',
                'remote_password', 'remote_user', 'remote_port',
                'remote_host', 'remote_type', 'remote_enabled'):
        op.drop_column('backup_jobs', col)
