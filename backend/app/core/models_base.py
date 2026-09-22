"""
Helpers partagés pour les modèles SQLAlchemy.
  uuid_pk()       → colonne UUID primary key avec génération automatique côté Python
  now_utc()       → datetime.now(UTC) utilisé comme default= dans les colonnes
  TimestampMixin  → ajoute created_at / updated_at à n'importe quel modèle
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, func
from sqlalchemy.orm import mapped_column, Mapped
from app.core.database import Base


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(primary_key=True, default=uuid.uuid4)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc, server_default=func.now()
    )
