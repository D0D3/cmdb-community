"""
Modèles paramètres applicatifs.
  AppSetting       : clé/valeur générique (clé primaire string) pour les paramètres globaux.
  ReferenceListItem: listes de référence configurables (catégorie/valeur, order, actif/inactif).
                     Utilisées pour les menus déroulants dynamiques (types CI, sévérités, etc.).
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class AppSetting(Base):
    __tablename__ = "app_settings"

    key:        Mapped[str]           = mapped_column(String(100), primary_key=True)
    value:      Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime]      = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ReferenceListItem(Base):
    __tablename__ = "reference_list_items"
    __table_args__ = (
        UniqueConstraint("category", "value", name="uq_reflist_cat_value"),
    )

    id:         Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    category:   Mapped[str]       = mapped_column(String(50), nullable=False, index=True)
    value:      Mapped[str]       = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int]       = mapped_column(Integer, nullable=False, default=0)
    active:     Mapped[bool]      = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime]  = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
