"""add agent tokens table and hw_subtype / os fields on hardware_details

Revision ID: 3a9c2e7f1b8d
Revises: 2f8a1b3c4d5e
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = '3a9c2e7f1b8d'
down_revision = '2f8a1b3c4d5e'
branch_labels = None
depends_on = None


def upgrade():
    # Nouvelles colonnes sur hardware_details
    op.add_column('hardware_details', sa.Column('hw_subtype',  sa.String(30),  nullable=True))
    op.add_column('hardware_details', sa.Column('os_name',     sa.String(50),  nullable=True))
    op.add_column('hardware_details', sa.Column('os_version',  sa.String(100), nullable=True))
    op.add_column('hardware_details', sa.Column('os_build',    sa.String(200), nullable=True))

    # Table des tokens d'agent
    op.create_table(
        'agent_tokens',
        sa.Column('id',                  sa.UUID(),                          nullable=False),
        sa.Column('name',                sa.String(100),                     nullable=False),
        sa.Column('description',         sa.String(300),                     nullable=True),
        sa.Column('token_hash',          sa.String(64),                      nullable=False),
        sa.Column('revoked',             sa.Boolean(),                       nullable=False, server_default='0'),
        sa.Column('last_seen_at',        sa.DateTime(timezone=True),         nullable=True),
        sa.Column('last_seen_hostname',  sa.String(200),                     nullable=True),
        sa.Column('created_by_id',       sa.UUID(),                          nullable=True),
        sa.Column('created_at',          sa.DateTime(timezone=True),         nullable=False),
        sa.Column('updated_at',          sa.DateTime(timezone=True),         nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash', name='uq_agent_token_hash'),
    )
    op.create_index('ix_agent_tokens_token_hash', 'agent_tokens', ['token_hash'])


def downgrade():
    op.drop_index('ix_agent_tokens_token_hash', table_name='agent_tokens')
    op.drop_table('agent_tokens')
    op.drop_column('hardware_details', 'os_build')
    op.drop_column('hardware_details', 'os_version')
    op.drop_column('hardware_details', 'os_name')
    op.drop_column('hardware_details', 'hw_subtype')
