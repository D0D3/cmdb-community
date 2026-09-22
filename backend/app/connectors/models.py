"""
Modèles connecteurs d'intégration.
  Connector       : source externe (glpi / ldap / entra / saml / smtp / db / monitoring…).
                    La config JSON est chiffrée avec Fernet (voir crypto.py).
                    Les mots de passe apparaissent masqués (***) dans les réponses API.
  ConnectorSyncLog: log des synchronisations automatiques (statut, nb ajouts/màj, erreurs).
                    Limité aux 50 derniers logs par connecteur.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models_base import TimestampMixin, uuid_pk

CONNECTOR_TYPES = (
    "ldap", "glpi", "servicenow", "jira", "atera",
    "freshservice", "zendesk", "intune", "entra", "custom",
    "smtp", "ssh", "saml", "m365_calendar",
)


class Connector(TimestampMixin, Base):
    __tablename__ = "connectors"

    id:               Mapped[uuid.UUID]       = uuid_pk()
    name:             Mapped[str]             = mapped_column(String(100), nullable=False)
    connector_type:   Mapped[str]             = mapped_column(String(30), nullable=False, index=True)
    config_encrypted: Mapped[Optional[str]]   = mapped_column(Text, nullable=True)
    enabled:          Mapped[bool]            = mapped_column(Boolean, nullable=False, default=False)

    last_test_at:      Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_test_ok:      Mapped[Optional[bool]]     = mapped_column(Boolean, nullable=True)
    last_test_message: Mapped[Optional[str]]      = mapped_column(String(500), nullable=True)

    last_sync_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_result: Mapped[Optional[dict]]     = mapped_column(JSON, nullable=True)

    sync_interval_hours: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    sync_logs: Mapped[list["ConnectorSyncLog"]] = relationship(
        "ConnectorSyncLog", back_populates="connector", cascade="all, delete-orphan",
        order_by="ConnectorSyncLog.started_at.desc()",
    )

    __table_args__ = (
        UniqueConstraint("name", name="uq_connector_name"),
        CheckConstraint(
            "connector_type IN ('ldap','glpi','servicenow','jira','atera',"
            "'freshservice','zendesk','intune','entra','custom',"
            "'smtp','ssh','saml','m365_calendar')",
            name="ck_connector_type",
        ),
    )


class ConnectorSyncLog(Base):
    __tablename__ = "connector_sync_logs"

    id:           Mapped[uuid.UUID]       = uuid_pk()
    connector_id: Mapped[uuid.UUID]       = mapped_column(
        ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    started_at:   Mapped[datetime]        = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status:       Mapped[str]             = mapped_column(String(20), nullable=False)  # ok | error | running
    result:       Mapped[Optional[dict]]  = mapped_column(JSON, nullable=True)
    error:        Mapped[Optional[str]]   = mapped_column(Text, nullable=True)
    triggered_by: Mapped[str]             = mapped_column(String(30), nullable=False, default="auto")  # auto | manual

    connector: Mapped["Connector"] = relationship("Connector", back_populates="sync_logs")
