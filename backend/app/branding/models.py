"""
Modèle branding (singleton).
  BrandingSetting : toujours id=1, un seul enregistrement.
                    logo_data stocké en base64 dans la colonne Text (max ~2 Mo).
                    login_bg_enabled active l'image de fond floue sur la page de connexion.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Integer, String, Text, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class BrandingSetting(Base):
    """Singleton — toujours id=1."""
    __tablename__ = "branding_settings"

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True, default=1)
    app_name:         Mapped[str]           = mapped_column(String(100), nullable=False, default="Capybara CMDB")
    primary_color:    Mapped[str]           = mapped_column(String(7),   nullable=False, default="#6d28d9")
    sidebar_color:    Mapped[str]           = mapped_column(String(7),   nullable=False, default="#0f172a")
    login_bg_enabled: Mapped[bool]          = mapped_column(Boolean,     nullable=False, default=False)
    logo_data:        Mapped[Optional[str]] = mapped_column(Text,  nullable=True)
    logo_mime:        Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    updated_at:       Mapped[datetime]      = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
