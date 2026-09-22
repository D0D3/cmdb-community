"""
Modèles ITSM — gestion des incidents.
  Incident      : ticket d'incident (titre, sévérité, statut, équipe assignée, lien ticket externe).
  IncidentAction: ligne de timeline (action, commentaire, changement de statut) avec auteur.
  IncidentCI    : table N-N liant un incident à un ou plusieurs CI concernés.
"""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models_base import TimestampMixin, uuid_pk, now_utc


class Incident(TimestampMixin, Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="open", index=True)

    reporter_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assignee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    external_ticket_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    ci_links: Mapped[list["IncidentCI"]] = relationship(
        "IncidentCI", back_populates="incident", cascade="all, delete-orphan"
    )
    comments: Mapped[list["IncidentComment"]] = relationship(
        "IncidentComment", back_populates="incident", cascade="all, delete-orphan",
        order_by="IncidentComment.created_at"
    )
    history: Mapped[list["IncidentHistory"]] = relationship(
        "IncidentHistory", back_populates="incident", cascade="all, delete-orphan",
        order_by="IncidentHistory.created_at"
    )

    __table_args__ = (
        CheckConstraint("severity IN ('low','medium','high','critical')", name="ck_incident_severity"),
        CheckConstraint("status IN ('open','investigating','resolved','closed')",  name="ck_incident_status"),
    )


class IncidentCI(Base):
    __tablename__ = "incident_cis"

    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"), primary_key=True
    )
    ci_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), primary_key=True
    )

    incident: Mapped["Incident"] = relationship("Incident", back_populates="ci_links")


class IncidentComment(Base):
    __tablename__ = "incident_comments"

    id: Mapped[uuid.UUID] = uuid_pk()
    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, server_default="now()"
    )

    incident: Mapped["Incident"] = relationship("Incident", back_populates="comments")


class IncidentHistory(Base):
    __tablename__ = "incident_history"

    id: Mapped[uuid.UUID] = uuid_pk()
    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    from_status: Mapped[str] = mapped_column(String(30), nullable=False)
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, server_default="now()"
    )

    incident: Mapped["Incident"] = relationship("Incident", back_populates="history")
