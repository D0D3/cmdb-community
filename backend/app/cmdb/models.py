"""
Modèles cœur CMDB — Configuration Items (CI) et leurs relations.

  CI            : entité centrale (hardware ou software), soft-delete via deleted_at.
  HardwareDetail: extension 1-1 pour les champs spécifiques matériel (CPU, RAM, disques…).
  SoftwareDetail: extension 1-1 pour les champs logiciel (éditeur, version, CPE, licences…).
  CIRelation    : lien typé entre deux CI (hébergé_sur, dépend_de, affecté_à, connecté_à).
  NetworkSegment: segment réseau (VLAN/DMZ) associé aux CI.
  Alert         : alerte générée (garantie J-90/J-30, EOL, CVE…), dédupliquée par dedup_key.
  MaintenanceLog: historique des maintenances réalisées sur un CI.
  SLA           : contrat SLA lié à un CI.
"""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import (
    String, Boolean, Date, DateTime, ForeignKey, Numeric, Text, Integer,
    UniqueConstraint, JSON, CheckConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models_base import TimestampMixin, uuid_pk, now_utc


class LicensePack(Base):
    __tablename__ = "license_packs"

    id:          Mapped[uuid.UUID]      = mapped_column(primary_key=True, default=uuid.uuid4)
    name:        Mapped[str]            = mapped_column(String(200), nullable=False)
    license_key: Mapped[Optional[str]]  = mapped_column(String(500), nullable=True)
    total_seats: Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    notes:       Mapped[Optional[str]]  = mapped_column(Text, nullable=True)
    created_at:  Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=lambda: datetime.now())
    updated_at:  Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(),
                                                         onupdate=lambda: datetime.now())

    software_items: Mapped[list["SoftwareDetail"]] = relationship("SoftwareDetail", back_populates="pack")


class Sla(TimestampMixin, Base):
    __tablename__ = "slas"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    level: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    contract_ref: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    support_contact: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    response_time: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contract_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    cis: Mapped[list["CI"]] = relationship("CI", back_populates="sla")


class CI(TimestampMixin, Base):
    __tablename__ = "cis"

    id: Mapped[uuid.UUID] = uuid_pk()
    ci_type: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="in_service")
    criticality: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    team: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sla_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("slas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # JSON portable — attributs libres par type de CI
    attributes: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    sla: Mapped[Optional["Sla"]] = relationship("Sla", back_populates="cis")
    hardware_details: Mapped[Optional["HardwareDetail"]] = relationship(
        "HardwareDetail", back_populates="ci", uselist=False, cascade="all, delete-orphan",
        foreign_keys="HardwareDetail.ci_id",
    )
    software_details: Mapped[Optional["SoftwareDetail"]] = relationship(
        "SoftwareDetail", back_populates="ci", uselist=False, cascade="all, delete-orphan",
        foreign_keys="SoftwareDetail.ci_id",
    )
    relations_from: Mapped[list["CIRelation"]] = relationship(
        "CIRelation", foreign_keys="CIRelation.source_ci_id", back_populates="source_ci",
        cascade="all, delete-orphan"
    )
    relations_to: Mapped[list["CIRelation"]] = relationship(
        "CIRelation", foreign_keys="CIRelation.target_ci_id", back_populates="target_ci",
        cascade="all, delete-orphan"
    )
    maintenance_schedules: Mapped[list["MaintenanceSchedule"]] = relationship(
        "MaintenanceSchedule", back_populates="ci", cascade="all, delete-orphan"
    )
    cve_links: Mapped[list["CICve"]] = relationship(
        "CICve", back_populates="ci", cascade="all, delete-orphan"
    )
    key_users: Mapped[list["CIKeyUser"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "CIKeyUser", back_populates="ci", cascade="all, delete-orphan"
    )
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="ci")

    __table_args__ = (
        CheckConstraint("ci_type IN ('hardware','software')", name="ck_ci_type"),
        CheckConstraint(
            "status IN ('ordered','in_stock','in_service','maintenance','retired')",
            name="ck_ci_status"
        ),
        CheckConstraint(
            "criticality IN ('low','medium','high','critical')",
            name="ck_ci_criticality"
        ),
    )


class HardwareDetail(Base):
    __tablename__ = "hardware_details"

    ci_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), primary_key=True
    )
    hw_subtype:         Mapped[Optional[str]]     = mapped_column(String(30),     nullable=True)
    os_name:            Mapped[Optional[str]]     = mapped_column(String(50),     nullable=True)
    os_version:         Mapped[Optional[str]]     = mapped_column(String(100),    nullable=True)
    os_build:           Mapped[Optional[str]]     = mapped_column(String(200),    nullable=True)
    manufacturer:       Mapped[Optional[str]]     = mapped_column(String(200),    nullable=True)
    model:              Mapped[Optional[str]]     = mapped_column(String(200),    nullable=True)
    serial_number:      Mapped[Optional[str]]     = mapped_column(String(200),    nullable=True, index=True)
    purchase_date:      Mapped[Optional[date]]    = mapped_column(Date,           nullable=True)
    warranty_end_date:  Mapped[Optional[date]]    = mapped_column(Date,           nullable=True, index=True)
    supplier:           Mapped[Optional[str]]     = mapped_column(String(200),    nullable=True)
    purchase_price:     Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    # M41
    ip_address:         Mapped[Optional[str]]     = mapped_column(String(45),     nullable=True)
    host_ci_id:         Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cis.id", ondelete="SET NULL"), nullable=True
    )
    acquisition_type:   Mapped[Optional[str]]     = mapped_column(String(30),     nullable=True)
    leasing_provider:   Mapped[Optional[str]]     = mapped_column(String(200),    nullable=True)
    leasing_start_date: Mapped[Optional[date]]    = mapped_column(Date,           nullable=True)
    leasing_end_date:   Mapped[Optional[date]]    = mapped_column(Date,           nullable=True)
    monthly_cost:       Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)

    ci:      Mapped["CI"] = relationship("CI", back_populates="hardware_details", foreign_keys=[ci_id])
    host_ci: Mapped[Optional["CI"]] = relationship("CI", foreign_keys=[host_ci_id])


class SoftwareDetail(Base):
    __tablename__ = "software_details"

    ci_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), primary_key=True
    )
    vendor:              Mapped[Optional[str]]  = mapped_column(String(200), nullable=True)
    product:             Mapped[str]            = mapped_column(String(300), nullable=False)
    version:             Mapped[Optional[str]]  = mapped_column(String(100), nullable=True)
    cpe_name:            Mapped[Optional[str]]  = mapped_column(String(500), nullable=True, index=True)
    is_internal:         Mapped[bool]           = mapped_column(Boolean, nullable=False, default=False)
    license_type:        Mapped[Optional[str]]  = mapped_column(String(100), nullable=True)
    license_end_date:    Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    eol_date:            Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    install_count:       Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    max_seats:           Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    # M40
    license_subtype:     Mapped[Optional[str]]       = mapped_column(String(30),  nullable=True)
    license_key:         Mapped[Optional[str]]       = mapped_column(String(500), nullable=True)
    pack_id:             Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("license_packs.id", ondelete="SET NULL"), nullable=True
    )
    # M41
    integrator_name:     Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    integrator_contact:  Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    integrator_phone:    Mapped[Optional[str]] = mapped_column(String(50),  nullable=True)
    integrator_email:    Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # OSV — source CVE réactive (osv.dev)
    osv_ecosystem:       Mapped[Optional[str]] = mapped_column(String(50),  nullable=True)
    osv_package:         Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    ci:   Mapped["CI"]                    = relationship("CI", back_populates="software_details")
    pack: Mapped[Optional["LicensePack"]] = relationship("LicensePack", back_populates="software_items")


class CIRelation(Base):
    __tablename__ = "ci_relations"

    id: Mapped[uuid.UUID] = uuid_pk()
    source_ci_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_ci_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), nullable=False, index=True
    )
    relation_type: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, server_default="now()"
    )

    source_ci: Mapped["CI"] = relationship(
        "CI", foreign_keys=[source_ci_id], back_populates="relations_from"
    )
    target_ci: Mapped["CI"] = relationship(
        "CI", foreign_keys=[target_ci_id], back_populates="relations_to"
    )

    __table_args__ = (
        UniqueConstraint("source_ci_id", "target_ci_id", "relation_type", name="uq_ci_relation"),
        CheckConstraint(
            "relation_type IN ('hosted_on','depends_on','assigned_to','connected_to')",
            name="ck_ci_relation_type"
        ),
        CheckConstraint("source_ci_id != target_ci_id", name="ck_ci_no_self_relation"),
    )


class MaintenanceSchedule(TimestampMixin, Base):
    __tablename__ = "maintenance_schedules"

    id: Mapped[uuid.UUID] = uuid_pk()
    ci_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="maintenance")
    rrule: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    next_due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # remind_days sérialisé en JSON (pas ARRAY)
    remind_days: Mapped[list] = mapped_column(JSON, nullable=False, default=lambda: [30, 7])
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    m365_event_id: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    ci: Mapped["CI"] = relationship("CI", back_populates="maintenance_schedules")
    logs: Mapped[list["MaintenanceLog"]] = relationship(
        "MaintenanceLog", back_populates="schedule"
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('maintenance','update','patch','audit')",
            name="ck_maint_kind"
        ),
    )


class MaintenanceLog(Base):
    __tablename__ = "maintenance_logs"

    id: Mapped[uuid.UUID] = uuid_pk()
    schedule_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("maintenance_schedules.id", ondelete="SET NULL"), nullable=True
    )
    ci_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), nullable=False, index=True
    )
    performed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, nullable=False
    )
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    schedule: Mapped[Optional["MaintenanceSchedule"]] = relationship(
        "MaintenanceSchedule", back_populates="logs"
    )


class Cve(Base):
    __tablename__ = "cves"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)  # ex: CVE-2026-12345
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cvss_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(3, 1), nullable=True)
    cvss_severity: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, index=True)
    is_kev: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    modified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, server_default="now()"
    )

    ci_links: Mapped[list["CICve"]] = relationship("CICve", back_populates="cve")

    __table_args__ = (
        CheckConstraint(
            "cvss_severity IN ('LOW','MEDIUM','HIGH','CRITICAL')",
            name="ck_cve_severity"
        ),
    )


class CICve(Base):
    __tablename__ = "ci_cves"

    ci_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), primary_key=True
    )
    cve_id: Mapped[str] = mapped_column(
        ForeignKey("cves.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    matched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, server_default="now()"
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", index=True)

    ci: Mapped["CI"] = relationship("CI", back_populates="cve_links")
    cve: Mapped["Cve"] = relationship("Cve", back_populates="ci_links")

    __table_args__ = (
        CheckConstraint(
            "status IN ('open','acknowledged','mitigated','not_affected')",
            name="ck_ci_cve_status"
        ),
    )


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = uuid_pk()
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="info")
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ci_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cis.id", ondelete="CASCADE"), nullable=True, index=True
    )
    cve_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("cves.id", ondelete="CASCADE"), nullable=True
    )
    dedup_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, server_default="now()", index=True
    )

    ci: Mapped[Optional["CI"]] = relationship("CI", back_populates="alerts")

    __table_args__ = (
        CheckConstraint(
            "kind IN ('cve_match','warranty_expiry','leasing_expiry','license_expiry','eol',"
            "'sla_expiry','maintenance_due','app_update')",
            name="ck_alert_kind"
        ),
        CheckConstraint(
            "severity IN ('info','warning','critical')",
            name="ck_alert_severity"
        ),
    )
