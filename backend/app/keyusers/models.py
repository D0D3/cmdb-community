"""
Modèle Key Users.
  CIKeyUser : utilisateur clé associé à un CI (propriétaire, référent, admin local…).
              user_type discrimine la source : 'local' (CMDB), 'entra' (Microsoft EntraID), 'ldap' (AD).
              Les champs entra_* et ldap_* dénormalisent les infos annuaire pour éviter les lookups.
"""
import uuid
from typing import Optional

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models_base import TimestampMixin, uuid_pk

KU_ROLES = ("key_user", "owner", "referent", "local_admin")
KU_TYPES = ("local", "entra", "ldap")


class CIKeyUser(TimestampMixin, Base):
    __tablename__ = "ci_key_users"

    id: Mapped[uuid.UUID] = uuid_pk()
    ci_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_type: Mapped[str] = mapped_column(String(10), nullable=False)  # local | entra

    # Local CMDB user (user_type == "local")
    local_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Microsoft EntraID user (user_type == "entra")
    entra_oid: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    entra_email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    entra_display_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    entra_job_title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    entra_department: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # LDAP / Active Directory user (user_type == "ldap")
    ldap_dn: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ldap_uid: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    ldap_email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    ldap_display_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    ldap_job_title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    ldap_department: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    role: Mapped[str] = mapped_column(String(20), nullable=False, default="key_user")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    ci: Mapped["CI"] = relationship("CI", back_populates="key_users")  # type: ignore[name-defined]  # noqa: F821
    local_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[local_user_id])  # type: ignore[name-defined]  # noqa: F821

    __table_args__ = (
        CheckConstraint("user_type IN ('local','entra','ldap')", name="ck_ku_user_type"),
        CheckConstraint(
            "role IN ('key_user','owner','referent','local_admin')",
            name="ck_ku_role",
        ),
    )
