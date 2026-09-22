"""network_segments — VLAN/DMZ liés aux CIs

Revision ID: p23d4e5f6a7b
Revises: o12c3d4e5f6a
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'p23d4e5f6a7b'
down_revision = 'o12c3d4e5f6a'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'network_segments',
        sa.Column('id',          sa.UUID(),        nullable=False),
        sa.Column('name',        sa.String(100),   nullable=False),
        sa.Column('seg_type',    sa.String(20),    nullable=False, server_default='vlan'),
        sa.Column('vlan_id',     sa.Integer(),     nullable=True),
        sa.Column('subnet',      sa.String(50),    nullable=True),
        sa.Column('description', sa.String(500),   nullable=True),
        sa.Column('color',       sa.String(7),     nullable=True),
        sa.Column('created_at',  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at',  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='uq_network_segment_name'),
        sa.CheckConstraint(
            "seg_type IN ('vlan','dmz','lan','wan','subnet','other')",
            name='ck_network_segment_type',
        ),
    )
    op.create_table(
        'ci_network_segments',
        sa.Column('ci_id',      sa.UUID(), nullable=False),
        sa.Column('segment_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['ci_id'],      ['cis.id'],              ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['segment_id'], ['network_segments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('ci_id', 'segment_id'),
    )


def downgrade():
    op.drop_table('ci_network_segments')
    op.drop_table('network_segments')
