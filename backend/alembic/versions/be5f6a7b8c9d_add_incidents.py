"""add incidents

Revision ID: be5f6a7b8c9d
Revises: ad4e5f6a7b8c
Create Date: 2026-06-13 17:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'be5f6a7b8c9d'
down_revision = 'ad4e5f6a7b8c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'incidents',
        sa.Column('id',          sa.UUID(),      nullable=False, primary_key=True),
        sa.Column('title',       sa.String(300), nullable=False),
        sa.Column('description', sa.Text(),      nullable=True),
        sa.Column('severity',    sa.String(20),  nullable=False, server_default='medium'),
        sa.Column('status',      sa.String(30),  nullable=False, server_default='open'),
        sa.Column('reporter_id', sa.UUID(),      nullable=True),
        sa.Column('assignee_id', sa.UUID(),      nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_at',   sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at',  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at',  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], ondelete='SET NULL'),
        sa.CheckConstraint("severity IN ('low','medium','high','critical')", name='ck_incident_severity'),
        sa.CheckConstraint("status IN ('open','investigating','resolved','closed')",  name='ck_incident_status'),
    )

    op.create_table(
        'incident_cis',
        sa.Column('incident_id', sa.UUID(), nullable=False),
        sa.Column('ci_id',       sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['ci_id'],       ['cis.id'],       ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('incident_id', 'ci_id'),
    )

    op.create_table(
        'incident_comments',
        sa.Column('id',          sa.UUID(),     nullable=False, primary_key=True),
        sa.Column('incident_id', sa.UUID(),     nullable=False),
        sa.Column('author_id',   sa.UUID(),     nullable=True),
        sa.Column('body',        sa.Text(),     nullable=False),
        sa.Column('created_at',  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['author_id'],   ['users.id'],     ondelete='SET NULL'),
    )

    # Lien RFC → Incident
    op.add_column('change_requests', sa.Column('incident_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_change_incident', 'change_requests', 'incidents', ['incident_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_change_incident', 'change_requests', type_='foreignkey')
    op.drop_column('change_requests', 'incident_id')
    op.drop_table('incident_comments')
    op.drop_table('incident_cis')
    op.drop_table('incidents')
