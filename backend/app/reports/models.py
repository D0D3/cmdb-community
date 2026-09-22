"""
Modèles rapports planifiés.
  ReportJob : configuration d'un rapport (type, format csv/pdf, planning, destinataires email).
              schedule = 'manual' | 'daily' | 'weekly' | 'monthly'.
              Les destinataires sont stockés en JSON (liste d'adresses email).
"""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models_base import uuid_pk, now_utc


class ReportJob(Base):
    __tablename__ = "report_jobs"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    report_type: Mapped[str] = mapped_column(String(50), nullable=False)
    format: Mapped[str] = mapped_column(String(10), nullable=False, default="csv")
    schedule: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    recipients: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, server_default="now()")
