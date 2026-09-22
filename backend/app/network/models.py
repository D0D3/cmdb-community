"""
Modèles segmentation réseau.
  NetworkSegment   : VLAN/DMZ/LAN/WAN/subnet, couleur configurable (défaut par type).
  CINetworkSegment : table de jointure N-N CI ↔ NetworkSegment (clé composite).
"""
import uuid
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.core.models_base import TimestampMixin, uuid_pk

SEGMENT_TYPES = ("vlan", "dmz", "lan", "wan", "subnet", "other")

DEFAULT_COLORS: dict[str, str] = {
    "vlan":   "#3B82F6",
    "dmz":    "#EF4444",
    "lan":    "#22C55E",
    "wan":    "#A855F7",
    "subnet": "#14B8A6",
    "other":  "#94A3B8",
}


class NetworkSegment(TimestampMixin, Base):
    __tablename__ = "network_segments"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    seg_type: Mapped[str] = mapped_column(String(20), nullable=False, default="vlan")
    vlan_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    subnet: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)

    ci_links: Mapped[list["CINetworkSegment"]] = relationship(
        "CINetworkSegment", back_populates="segment", cascade="all, delete-orphan"
    )

    def resolved_color(self) -> str:
        return self.color or DEFAULT_COLORS.get(self.seg_type, "#94A3B8")

    __table_args__ = (
        CheckConstraint(
            "seg_type IN ('vlan','dmz','lan','wan','subnet','other')",
            name="ck_network_segment_type",
        ),
    )


class CINetworkSegment(Base):
    __tablename__ = "ci_network_segments"

    ci_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), primary_key=True
    )
    segment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("network_segments.id", ondelete="CASCADE"), primary_key=True
    )

    segment: Mapped["NetworkSegment"] = relationship("NetworkSegment", back_populates="ci_links")
