"""Ajout osv_ecosystem + osv_package sur software_details (source CVE réactive OSV)

Revision ID: aa34p5q6r7s8
Revises: z23n4o5p6q7r
Create Date: 2026-06-23

"""
from alembic import op
import sqlalchemy as sa

revision = 'aa34p5q6r7s8'
down_revision = 'b45p6q7r8s9t'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('software_details', sa.Column('osv_ecosystem', sa.String(50),  nullable=True))
    op.add_column('software_details', sa.Column('osv_package',   sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('software_details', 'osv_package')
    op.drop_column('software_details', 'osv_ecosystem')
