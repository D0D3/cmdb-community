"""
Modèles monitoring (ingestion alertes externes).
  MonitoringConnector : source d'alertes (Zabbix, Alertmanager, SNMP…).
                        ingest_key = UUID unique dans l'URL d'ingestion (pas d'auth token séparée).
                        Clés SNMP v3 stockées chiffrées (snmp_v3_*_key_enc).
  MonitoringAlert     : alerte reçue, dédupliquée par source_id.
                        Peut être liée à un CI (ci_id) et/ou déclencher un incident (incident_id).
"""
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Boolean, Integer, Text, DateTime, ForeignKey,
    JSON, CheckConstraint, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.core.models_base import TimestampMixin, uuid_pk

CONNECTOR_TYPES = ("zabbix", "alertmanager", "grafana", "prtg", "snmp", "kuma", "generic")
SNMP_VERSIONS   = ("v1", "v2c", "v3")
SNMP_AUTH_PROTOS = ("MD5", "SHA")
SNMP_PRIV_PROTOS = ("DES", "AES")
SEVERITIES = ("info", "low", "medium", "high", "critical")
ALERT_STATUSES = ("firing", "resolved")


class MonitoringConnector(TimestampMixin, Base):
    __tablename__ = "monitoring_connectors"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    connector_type: Mapped[str] = mapped_column(String(20), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Clé unique pour l'URL d'ingestion (pas d'auth côté outil tiers)
    ingest_key: Mapped[uuid.UUID] = mapped_column(
        nullable=False, default=uuid.uuid4, unique=True
    )

    # Config SNMP (v1/v2c/v3)
    snmp_version: Mapped[str] = mapped_column(String(5), nullable=False, default="v2c")
    snmp_port: Mapped[int] = mapped_column(Integer, nullable=False, default=162)
    snmp_community: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    snmp_v3_user: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    snmp_v3_auth_proto: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    snmp_v3_auth_key_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    snmp_v3_priv_proto: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    snmp_v3_priv_key_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Config traitement alertes
    auto_create_incident: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    min_severity: Mapped[str] = mapped_column(String(20), nullable=False, default="high")

    alerts: Mapped[list["MonitoringAlert"]] = relationship(
        "MonitoringAlert", back_populates="connector", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "connector_type IN ('zabbix','alertmanager','grafana','prtg','snmp','kuma','generic')",
            name="ck_monitoring_connector_type",
        ),
        CheckConstraint(
            "snmp_version IN ('v1','v2c','v3')",
            name="ck_monitoring_snmp_version",
        ),
        CheckConstraint(
            "min_severity IN ('info','low','medium','high','critical')",
            name="ck_monitoring_min_severity",
        ),
    )


class MonitoringAlert(Base):
    __tablename__ = "monitoring_alerts"

    id: Mapped[uuid.UUID] = uuid_pk()
    connector_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("monitoring_connectors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_id: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="firing")
    host_hint: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    ci_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cis.id", ondelete="SET NULL"), nullable=True, index=True
    )
    incident_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    raw_payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: __import__('datetime').datetime.now(__import__('datetime').timezone.utc)
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    connector: Mapped["MonitoringConnector"] = relationship("MonitoringConnector", back_populates="alerts")

    __table_args__ = (
        CheckConstraint(
            "severity IN ('info','low','medium','high','critical')",
            name="ck_monitoring_alert_severity",
        ),
        CheckConstraint(
            "status IN ('firing','resolved')",
            name="ck_monitoring_alert_status",
        ),
    )
