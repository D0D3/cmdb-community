"""
Modèle journal d'audit.
  AuditLog : entrée immuable horodatée (create/update/delete) sur toute entité du système.
             changes (JSON) : diff avant/après pour les updates.
             performed_by_name est dénormalisé pour conserver le nom même si l'utilisateur est supprimé.
"""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.core.models_base import uuid_pk, now_utc

if TYPE_CHECKING:
    pass  # évite les imports circulaires


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = uuid_pk()
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    entity_name: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # create | update | delete
    changes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    performed_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    performed_by_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
