"""add change management (RFC)

Revision ID: 7a1b2c3d4e5f
Revises: 6e3f9a2b1c0d
Create Date: 2026-06-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '7a1b2c3d4e5f'
down_revision = '6e3f9a2b1c0d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'change_requests',
        sa.Column('id',           sa.UUID(), primary_key=True),
        sa.Column('title',        sa.String(300), nullable=False),
        sa.Column('description',  sa.Text,        nullable=True),
        sa.Column('change_type',  sa.String(20),  nullable=False, server_default='normal'),
        sa.Column('status',       sa.String(30),  nullable=False, server_default='draft'),
        sa.Column('priority',     sa.String(20),  nullable=False, server_default='medium'),
        sa.Column('risk',         sa.String(20),  nullable=False, server_default='medium'),
        sa.Column('requester_id', sa.UUID(),      nullable=True),
        sa.Column('approver_id',  sa.UUID(),      nullable=True),
        sa.Column('planned_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('planned_end',   sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_start',  sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_end',    sa.DateTime(timezone=True), nullable=True),
        sa.Column('rollback_plan', sa.Text, nullable=True),
        sa.Column('notes',         sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['approver_id'],  ['users.id'], ondelete='SET NULL'),
        sa.CheckConstraint("change_type IN ('normal','standard','emergency')",   name='ck_change_type'),
        sa.CheckConstraint(
            "status IN ('draft','pending_approval','approved','in_progress','completed','rejected','cancelled')",
            name='ck_change_status'
        ),
        sa.CheckConstraint("priority IN ('low','medium','high','critical')", name='ck_change_priority'),
        sa.CheckConstraint("risk IN ('low','medium','high')",                name='ck_change_risk'),
    )
    op.create_index('ix_change_requests_status', 'change_requests', ['status'])
    op.create_index('ix_change_requests_requester_id', 'change_requests', ['requester_id'])

    op.create_table(
        'change_cis',
        sa.Column('id',        sa.UUID(), primary_key=True),
        sa.Column('change_id', sa.UUID(), nullable=False),
        sa.Column('ci_id',     sa.UUID(), nullable=False),
        sa.Column('impact',    sa.String(20), nullable=False, server_default='affected'),
        sa.ForeignKeyConstraint(['change_id'], ['change_requests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['ci_id'],     ['cis.id'],             ondelete='CASCADE'),
        sa.CheckConstraint("impact IN ('info','affected','critical')", name='ck_change_ci_impact'),
    )
    op.create_index('ix_change_cis_change_id', 'change_cis', ['change_id'])
    op.create_index('ix_change_cis_ci_id',     'change_cis', ['ci_id'])

    op.create_table(
        'change_comments',
        sa.Column('id',          sa.UUID(),       primary_key=True),
        sa.Column('change_id',   sa.UUID(),       nullable=False),
        sa.Column('author_id',   sa.UUID(),       nullable=True),
        sa.Column('author_name', sa.String(255),  nullable=True),
        sa.Column('content',     sa.Text,         nullable=False),
        sa.Column('created_at',  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['change_id'], ['change_requests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'],           ondelete='SET NULL'),
    )
    op.create_index('ix_change_comments_change_id', 'change_comments', ['change_id'])


def downgrade() -> None:
    op.drop_table('change_comments')
    op.drop_table('change_cis')
    op.drop_table('change_requests')
