"""M39 paramètres globaux, M40 licences avancées, M41 IP/hôte/intégrateur

Revision ID: h45c6d7e8f9a
Revises: g34b5c6d7e8f
Create Date: 2026-06-14 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision      = 'h45c6d7e8f9a'
down_revision = 'g34b5c6d7e8f'
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ── M39 : Paramètres globaux ──────────────────────────────────────────────
    op.create_table(
        'app_settings',
        sa.Column('key',        sa.String(100), nullable=False, primary_key=True),
        sa.Column('value',      sa.Text(),       nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_table(
        'reference_list_items',
        sa.Column('id',         sa.UUID(),       nullable=False, primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('category',   sa.String(50),   nullable=False),
        sa.Column('value',      sa.String(200),  nullable=False),
        sa.Column('sort_order', sa.Integer(),    nullable=False, server_default='0'),
        sa.Column('active',     sa.Boolean(),    nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index('ix_reflist_category', 'reference_list_items', ['category'])
    op.create_unique_constraint('uq_reflist_cat_value', 'reference_list_items', ['category', 'value'])

    # ── M40 : Packs de licences ───────────────────────────────────────────────
    op.create_table(
        'license_packs',
        sa.Column('id',          sa.UUID(),      nullable=False, primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('name',        sa.String(200), nullable=False),
        sa.Column('license_key', sa.String(500), nullable=True),
        sa.Column('total_seats', sa.Integer(),   nullable=True),
        sa.Column('notes',       sa.Text(),      nullable=True),
        sa.Column('created_at',  sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at',  sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )

    # Colonnes M40 sur software_details
    op.add_column('software_details', sa.Column('license_subtype', sa.String(30), nullable=True))
    op.add_column('software_details', sa.Column('license_key',     sa.String(500), nullable=True))
    op.add_column('software_details', sa.Column('pack_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_sd_pack_id', 'software_details', 'license_packs',
        ['pack_id'], ['id'], ondelete='SET NULL'
    )

    # ── M41 : IP + hôte VM + intégrateur ─────────────────────────────────────
    op.add_column('hardware_details', sa.Column('ip_address',        sa.String(45),     nullable=True))
    op.add_column('hardware_details', sa.Column('host_ci_id',        sa.UUID(),         nullable=True))
    op.add_column('hardware_details', sa.Column('acquisition_type',  sa.String(30),     nullable=True))
    op.add_column('hardware_details', sa.Column('leasing_provider',  sa.String(200),    nullable=True))
    op.add_column('hardware_details', sa.Column('leasing_start_date',sa.Date(),         nullable=True))
    op.add_column('hardware_details', sa.Column('leasing_end_date',  sa.Date(),         nullable=True))
    op.add_column('hardware_details', sa.Column('monthly_cost',      sa.Numeric(12, 2), nullable=True))
    op.create_foreign_key(
        'fk_hw_host_ci_id', 'hardware_details', 'cis',
        ['host_ci_id'], ['id'], ondelete='SET NULL'
    )

    op.add_column('software_details', sa.Column('integrator_name',    sa.String(200), nullable=True))
    op.add_column('software_details', sa.Column('integrator_contact', sa.String(200), nullable=True))
    op.add_column('software_details', sa.Column('integrator_phone',   sa.String(50),  nullable=True))
    op.add_column('software_details', sa.Column('integrator_email',   sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('software_details', 'integrator_email')
    op.drop_column('software_details', 'integrator_phone')
    op.drop_column('software_details', 'integrator_contact')
    op.drop_column('software_details', 'integrator_name')
    op.drop_constraint('fk_hw_host_ci_id', 'hardware_details', type_='foreignkey')
    op.drop_column('hardware_details', 'monthly_cost')
    op.drop_column('hardware_details', 'leasing_end_date')
    op.drop_column('hardware_details', 'leasing_start_date')
    op.drop_column('hardware_details', 'leasing_provider')
    op.drop_column('hardware_details', 'acquisition_type')
    op.drop_column('hardware_details', 'host_ci_id')
    op.drop_column('hardware_details', 'ip_address')
    op.drop_constraint('fk_sd_pack_id', 'software_details', type_='foreignkey')
    op.drop_column('software_details', 'pack_id')
    op.drop_column('software_details', 'license_key')
    op.drop_column('software_details', 'license_subtype')
    op.drop_table('license_packs')
    op.drop_index('ix_reflist_category', 'reference_list_items')
    op.drop_constraint('uq_reflist_cat_value', 'reference_list_items', type_='unique')
    op.drop_table('reference_list_items')
    op.drop_table('app_settings')
