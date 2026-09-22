"""
Modèles cycle de vie IT — changements (RFC) et maintenances planifiées.
  ChangeRequest : demande de changement (RFC) avec workflow et lien CI.
  ChangeCI      : N-N entre ChangeRequest et CI impactés.
  ChangeComment : fil de discussion sur un RFC.
  Maintenance   : maintenance planifiée récurrente (RFC 5545 RRULE) sur un CI.
"""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models_base import TimestampMixin, uuid_pk, now_utc


class ChangeRequest(TimestampMixin, Base):
    __tablename__ = "change_requests"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    change_type: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft", index=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    risk: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")

    requester_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    approver_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    planned_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    planned_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    rollback_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    incident_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True
    )

    ci_links: Mapped[list["ChangeCI"]] = relationship(
        "ChangeCI", back_populates="change", cascade="all, delete-orphan"
    )
    comments: Mapped[list["ChangeComment"]] = relationship(
        "ChangeComment", back_populates="change", cascade="all, delete-orphan",
        order_by="ChangeComment.created_at"
    )

    __table_args__ = (
        CheckConstraint(
            "change_type IN ('normal','standard','emergency')",
            name="ck_change_type"
        ),
        CheckConstraint(
            "status IN ('draft','pending_approval','approved','in_progress','completed','rejected','cancelled')",
            name="ck_change_status"
        ),
        CheckConstraint(
            "priority IN ('low','medium','high','critical')",
            name="ck_change_priority"
        ),
        CheckConstraint(
            "risk IN ('low','medium','high')",
            name="ck_change_risk"
        ),
    )


class ChangeCI(Base):
    __tablename__ = "change_cis"

    id: Mapped[uuid.UUID] = uuid_pk()
    change_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("change_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ci_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), nullable=False, index=True
    )
    impact: Mapped[str] = mapped_column(String(20), nullable=False, default="affected")

    change: Mapped["ChangeRequest"] = relationship("ChangeRequest", back_populates="ci_links")

    __table_args__ = (
        CheckConstraint("impact IN ('info','affected','critical')", name="ck_change_ci_impact"),
    )


class ChangeComment(Base):
    __tablename__ = "change_comments"

    id: Mapped[uuid.UUID] = uuid_pk()
    change_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("change_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    author_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, nullable=False
    )

    change: Mapped["ChangeRequest"] = relationship("ChangeRequest", back_populates="comments")
