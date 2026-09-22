"""backup: schedule_hour / schedule_weekday / schedule_monthday

Revision ID: z23n4o5p6q7r
Revises: x01l2m3n4o5p
Create Date: 2026-06-18

Ajout de trois colonnes sur backup_jobs pour permettre à l'utilisateur
de choisir l'heure de déclenchement et, selon la fréquence, le jour de
la semaine (hebdo) ou le jour du mois (mensuel).
"""
from alembic import op
import sqlalchemy as sa

revision = 'z23n4o5p6q7r'
down_revision = 'y12m3n4o5p6q'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('backup_jobs', sa.Column('schedule_hour',     sa.Integer(), nullable=True))
    op.add_column('backup_jobs', sa.Column('schedule_weekday',  sa.Integer(), nullable=True))
    op.add_column('backup_jobs', sa.Column('schedule_monthday', sa.Integer(), nullable=True))
    # Valeur par défaut rétroactive : 2h du matin
    op.execute("UPDATE backup_jobs SET schedule_hour = 2 WHERE schedule_hour IS NULL")


def downgrade() -> None:
    op.drop_column('backup_jobs', 'schedule_monthday')
    op.drop_column('backup_jobs', 'schedule_weekday')
    op.drop_column('backup_jobs', 'schedule_hour')
