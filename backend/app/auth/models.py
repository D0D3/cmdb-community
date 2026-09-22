"""
Modèles d'authentification et de contrôle d'accès.

  User      : compte utilisateur multi-source (local / ldap / oidc / saml).
              Soft-delete via deleted_at, verrouillage via is_locked.
  Role      : rôle avec permissions JSON fine-grained (module:action → bool).
  UserRole  : table M2M User ↔ Role.
  ApiToken  : token machine — seul le SHA-256 est stocké (token_hash), jamais le raw.
              Le raw est retourné une seule fois à la création.
"""
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, ForeignKey, UniqueConstraint, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models_base import TimestampMixin, uuid_pk, now_utc


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    auth_source: Mapped[str] = mapped_column(String(10), nullable=False, default="local")
    external_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    hashed_password: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_active_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notify_critical_alerts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    totp_secret: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    avatar_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avatar_mime: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    personal_primary_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    personal_sidebar_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)

    roles: Mapped[list["Role"]] = relationship(
        "Role", secondary="user_roles", back_populates="users"
    )
    api_tokens: Mapped[list["ApiToken"]] = relationship("ApiToken", back_populates="created_by_user")

    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
    )


class Role(TimestampMixin, Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # JSON portable (pas JSONB) — {"ci:hardware": "write", "ci:software": "read", …}
    permissions: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    users: Mapped[list["User"]] = relationship(
        "User", secondary="user_roles", back_populates="roles"
    )
    group_mappings: Mapped[list["RoleGroupMapping"]] = relationship(
        "RoleGroupMapping", back_populates="role"
    )


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )


class RoleGroupMapping(Base):
    __tablename__ = "role_group_mappings"

    id: Mapped[uuid.UUID] = uuid_pk()
    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(10), nullable=False)  # ldap | oidc
    group_name: Mapped[str] = mapped_column(String(500), nullable=False)

    role: Mapped["Role"] = relationship("Role", back_populates="group_mappings")

    __table_args__ = (
        UniqueConstraint("source", "group_name", "role_id", name="uq_role_group_mapping"),
    )


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    # scopes sérialisés en JSON pour portabilité (pas ARRAY PostgreSQL)
    scopes: Mapped[list] = mapped_column(JSON, nullable=False, default=lambda: ["read"])
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, server_default="now()"
    )

    created_by_user: Mapped["User"] = relationship("User", back_populates="api_tokens")
