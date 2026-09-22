"""
Modèle agent natif.
  AgentToken : jeton d'authentification pour l'agent système (cagt_…).
               Seul le hash SHA-256 est stocké — le token brut n'est visible qu'à la création.
               last_seen_* permet de savoir quand/où l'agent a remonté son dernier rapport.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models_base import TimestampMixin, uuid_pk, now_utc


class AgentToken(TimestampMixin, Base):
    __tablename__ = "agent_tokens"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_hostname: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by_id])  # type: ignore[name-defined]  # noqa: F821

    __table_args__ = (UniqueConstraint("token_hash", name="uq_agent_token_hash"),)
