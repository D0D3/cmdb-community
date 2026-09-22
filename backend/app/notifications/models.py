"""
Modèle règles de notification.
  NotificationRule : une règle par event_type (unique).
                     enabled + liste d'emails destinataires.
                     Exemples d'event_type : ci_expiry, incident_open, connector_sync_error.
"""
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models_base import uuid_pk, now_utc


class NotificationRule(Base):
    __tablename__ = "notification_rules"

    id: Mapped[uuid.UUID] = uuid_pk()
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recipient_emails: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, server_default="now()")
