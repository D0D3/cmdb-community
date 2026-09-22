"""
Routers monitoring (/api/admin/monitoring et /api/monitoring/ingest).
  admin_router  : CRUD connecteurs monitoring, liste des alertes reçues.
  ingest_router : /ingest/{ingest_key} — webhook générique (Zabbix, Alertmanager, Grafana, PRTG, Kuma).
                  /ingest/{ingest_key}/snmp — traps SNMP forwardés par snmptrapd.
  Déduplication: si source_id existe déjà en "firing" → update statut, sinon créé.
  Auto-incident : si sévérité ≥ min_severity du connecteur → crée un incident.
"""
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import require_role, require_perm
from app.monitoring.models import (
    MonitoringConnector, MonitoringAlert,
    CONNECTOR_TYPES, SNMP_VERSIONS, SEVERITIES,
)
from app.monitoring.parsers import PARSERS, SEVERITY_ORDER, NormalizedAlert

admin_router = APIRouter(prefix="/api/admin/monitoring", tags=["monitoring"])
ingest_router = APIRouter(prefix="/api/monitoring", tags=["monitoring-ingest"])

DbDep = Annotated[Session, Depends(get_db)]
_admin = require_role("admin")
_read  = require_perm("monitoring", "read")


# ── Schémas ───────────────────────────────────────────────────────────────────

class ConnectorIn(BaseModel):
    name: str
    connector_type: str
    enabled: bool = True
    description: Optional[str] = None
    snmp_version: str = "v2c"
    snmp_port: int = 162
    snmp_community: Optional[str] = "public"
    snmp_v3_user: Optional[str] = None
    snmp_v3_auth_proto: Optional[str] = None
    snmp_v3_auth_key: Optional[str] = None
    snmp_v3_priv_proto: Optional[str] = None
    snmp_v3_priv_key: Optional[str] = None
    auto_create_incident: bool = True
    min_severity: str = "high"


class ConnectorOut(BaseModel):
    id: str
    name: str
    connector_type: str
    enabled: bool
    description: Optional[str] = None
    ingest_key: str
    snmp_version: str
    snmp_port: int
    snmp_community: Optional[str] = None
    snmp_v3_user: Optional[str] = None
    snmp_v3_auth_proto: Optional[str] = None
    snmp_v3_priv_proto: Optional[str] = None
    auto_create_incident: bool
    min_severity: str
    alert_count: int = 0
    last_alert_at: Optional[str] = None


class AlertOut(BaseModel):
    id: str
    connector_id: str
    connector_name: str
    source_id: Optional[str]
    title: str
    body: Optional[str]
    severity: str
    status: str
    host_hint: Optional[str]
    ci_id: Optional[str]
    incident_id: Optional[str]
    received_at: str
    resolved_at: Optional[str]


def _connector_out(c: MonitoringConnector, db: Session) -> ConnectorOut:
    count = db.query(func.count(MonitoringAlert.id)).filter(
        MonitoringAlert.connector_id == c.id
    ).scalar() or 0
    last = db.query(MonitoringAlert.received_at).filter(
        MonitoringAlert.connector_id == c.id
    ).order_by(MonitoringAlert.received_at.desc()).scalar()
    return ConnectorOut(
        id=str(c.id),
        name=c.name,
        connector_type=c.connector_type,
        enabled=c.enabled,
        description=c.description,
        ingest_key=str(c.ingest_key),
        snmp_version=c.snmp_version,
        snmp_port=c.snmp_port,
        snmp_community=c.snmp_community,
        snmp_v3_user=c.snmp_v3_user,
        snmp_v3_auth_proto=c.snmp_v3_auth_proto,
        snmp_v3_priv_proto=c.snmp_v3_priv_proto,
        auto_create_incident=c.auto_create_incident,
        min_severity=c.min_severity,
        alert_count=count,
        last_alert_at=last.isoformat() if last else None,
    )


# ── CRUD Connecteurs ──────────────────────────────────────────────────────────

@admin_router.get("", response_model=list[ConnectorOut], dependencies=[_read])
def list_connectors(db: DbDep):
    return [_connector_out(c, db) for c in db.query(MonitoringConnector).order_by(MonitoringConnector.name).all()]


@admin_router.post("", response_model=ConnectorOut, dependencies=[_admin])
def create_connector(data: ConnectorIn, db: DbDep):
    if data.connector_type not in CONNECTOR_TYPES:
        raise HTTPException(400, "Type de connecteur invalide")
    if data.snmp_version not in SNMP_VERSIONS:
        raise HTTPException(400, "Version SNMP invalide")
    if data.min_severity not in SEVERITIES:
        raise HTTPException(400, "Sévérité minimale invalide")

    c = MonitoringConnector(
        name=data.name,
        connector_type=data.connector_type,
        enabled=data.enabled,
        description=data.description,
        snmp_version=data.snmp_version,
        snmp_port=data.snmp_port,
        snmp_community=data.snmp_community,
        snmp_v3_user=data.snmp_v3_user,
        snmp_v3_auth_proto=data.snmp_v3_auth_proto,
        snmp_v3_priv_proto=data.snmp_v3_priv_proto,
        auto_create_incident=data.auto_create_incident,
        min_severity=data.min_severity,
    )
    if data.snmp_v3_auth_key:
        from app.connectors.crypto import encrypt_config
        c.snmp_v3_auth_key_enc = encrypt_config({"key": data.snmp_v3_auth_key})
    if data.snmp_v3_priv_key:
        from app.connectors.crypto import encrypt_config
        c.snmp_v3_priv_key_enc = encrypt_config({"key": data.snmp_v3_priv_key})
    db.add(c)
    db.commit()
    db.refresh(c)
    return _connector_out(c, db)


@admin_router.patch("/{cid}", response_model=ConnectorOut, dependencies=[_admin])
def update_connector(cid: uuid.UUID, data: ConnectorIn, db: DbDep):
    c = db.get(MonitoringConnector, cid)
    if not c:
        raise HTTPException(404, "Connecteur introuvable")
    if data.connector_type not in CONNECTOR_TYPES:
        raise HTTPException(400, "Type de connecteur invalide")

    c.name = data.name
    c.connector_type = data.connector_type
    c.enabled = data.enabled
    c.description = data.description
    c.snmp_version = data.snmp_version
    c.snmp_port = data.snmp_port
    c.snmp_community = data.snmp_community
    c.snmp_v3_user = data.snmp_v3_user
    c.snmp_v3_auth_proto = data.snmp_v3_auth_proto
    c.snmp_v3_priv_proto = data.snmp_v3_priv_proto
    c.auto_create_incident = data.auto_create_incident
    c.min_severity = data.min_severity

    if data.snmp_v3_auth_key:
        from app.connectors.crypto import encrypt_config
        c.snmp_v3_auth_key_enc = encrypt_config({"key": data.snmp_v3_auth_key})
    if data.snmp_v3_priv_key:
        from app.connectors.crypto import encrypt_config
        c.snmp_v3_priv_key_enc = encrypt_config({"key": data.snmp_v3_priv_key})

    db.commit()
    db.refresh(c)
    return _connector_out(c, db)


@admin_router.patch("/{cid}/toggle", dependencies=[_admin])
def toggle_connector(cid: uuid.UUID, db: DbDep):
    c = db.get(MonitoringConnector, cid)
    if not c:
        raise HTTPException(404, "Connecteur introuvable")
    c.enabled = not c.enabled
    db.commit()
    return {"enabled": c.enabled}


@admin_router.delete("/{cid}", dependencies=[_admin])
def delete_connector(cid: uuid.UUID, db: DbDep):
    c = db.get(MonitoringConnector, cid)
    if not c:
        raise HTTPException(404, "Connecteur introuvable")
    db.delete(c)
    db.commit()
    return {"ok": True}


@admin_router.get("/alerts", response_model=list[AlertOut], dependencies=[_read])
def list_alerts(
    db: DbDep,
    connector_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
):
    q = db.query(MonitoringAlert).order_by(MonitoringAlert.received_at.desc())
    if connector_id:
        q = q.filter(MonitoringAlert.connector_id == uuid.UUID(connector_id))
    if status:
        q = q.filter(MonitoringAlert.status == status)
    alerts = q.limit(limit).all()
    connector_names: dict[str, str] = {}
    for a in alerts:
        cid = str(a.connector_id)
        if cid not in connector_names:
            c = db.get(MonitoringConnector, a.connector_id)
            connector_names[cid] = c.name if c else "?"
    return [AlertOut(
        id=str(a.id),
        connector_id=str(a.connector_id),
        connector_name=connector_names.get(str(a.connector_id), "?"),
        source_id=a.source_id,
        title=a.title,
        body=a.body,
        severity=a.severity,
        status=a.status,
        host_hint=a.host_hint,
        ci_id=str(a.ci_id) if a.ci_id else None,
        incident_id=str(a.incident_id) if a.incident_id else None,
        received_at=a.received_at.isoformat(),
        resolved_at=a.resolved_at.isoformat() if a.resolved_at else None,
    ) for a in alerts]


# ── Ingestion alerts ──────────────────────────────────────────────────────────

def _find_ci(db: Session, host_hint: str):
    """Cherche un CI par nom, hostname ou IP."""
    if not host_hint:
        return None
    from app.cmdb.models import CI, HardwareDetail

    # Nom exact (insensible à la casse)
    ci = db.query(CI).filter(
        CI.name.ilike(host_hint), CI.deleted_at.is_(None)
    ).first()
    if ci:
        return ci

    # IP dans hardware_details
    ci = db.execute(
        select(CI).join(HardwareDetail, HardwareDetail.ci_id == CI.id)
        .where(HardwareDetail.ip_address == host_hint, CI.deleted_at.is_(None))
    ).scalar_one_or_none()
    if ci:
        return ci

    # Nom partiel (hostname sans domaine)
    short = host_hint.split(".")[0]
    if short and len(short) >= 3:
        ci = db.query(CI).filter(
            CI.name.ilike(f"%{short}%"), CI.deleted_at.is_(None)
        ).first()
    return ci


def _maybe_create_incident(db: Session, alert: MonitoringAlert, connector: MonitoringConnector):
    """Crée un incident si la sévérité atteint le seuil du connecteur."""
    if not connector.auto_create_incident:
        return
    if alert.status == "resolved":
        return
    if SEVERITY_ORDER.get(alert.severity, 0) < SEVERITY_ORDER.get(connector.min_severity, 3):
        return

    from app.incidents.models import Incident, IncidentCI
    sev_map = {"info": "low", "low": "low", "medium": "medium", "high": "high", "critical": "critical"}
    incident = Incident(
        title=f"[{connector.name}] {alert.title[:290]}",
        description=alert.body or f"Alerte reçue depuis {connector.connector_type}",
        severity=sev_map.get(alert.severity, "medium"),
        status="open",
    )
    db.add(incident)
    db.flush()
    if alert.ci_id:
        db.add(IncidentCI(incident_id=incident.id, ci_id=alert.ci_id))
    alert.incident_id = incident.id


def _maybe_resolve_incident(db: Session, alert: MonitoringAlert):
    """Ferme l'incident lié si l'alerte est résolue."""
    if alert.status != "resolved" or not alert.incident_id:
        return
    from app.incidents.models import Incident
    incident = db.get(Incident, alert.incident_id)
    if incident and incident.status not in ("resolved", "closed"):
        incident.status = "resolved"
        incident.resolved_at = datetime.now(timezone.utc)


def _process_normalized(
    db: Session,
    connector: MonitoringConnector,
    normalized_list: list[NormalizedAlert],
    raw_payload: Any,
) -> list[MonitoringAlert]:
    results: list[MonitoringAlert] = []
    for n in normalized_list:
        ci = _find_ci(db, n.host_hint)

        # Déduplication: si source_id déjà vu pour ce connecteur → update statut
        existing = None
        if n.source_id:
            existing = db.query(MonitoringAlert).filter(
                MonitoringAlert.connector_id == connector.id,
                MonitoringAlert.source_id == n.source_id,
                MonitoringAlert.status == "firing",
            ).first()

        if existing:
            existing.status = n.status
            existing.severity = n.severity
            existing.title = n.title
            if n.status == "resolved":
                existing.resolved_at = datetime.now(timezone.utc)
                _maybe_resolve_incident(db, existing)
            results.append(existing)
        else:
            alert = MonitoringAlert(
                connector_id=connector.id,
                source_id=n.source_id,
                title=n.title[:490],
                body=n.body[:2000] if n.body else None,
                severity=n.severity,
                status=n.status,
                host_hint=n.host_hint[:290] if n.host_hint else None,
                ci_id=ci.id if ci else None,
                raw_payload=n.metadata,
            )
            db.add(alert)
            db.flush()
            _maybe_create_incident(db, alert, connector)
            results.append(alert)

    db.commit()
    return results


@ingest_router.post("/ingest/{ingest_key}", status_code=200)
async def ingest_webhook(ingest_key: uuid.UUID, request: Request, db: DbDep):
    """Point d'entrée unique pour tous les webhooks monitoring (Zabbix, Alertmanager, Grafana, PRTG, générique)."""
    connector = db.query(MonitoringConnector).filter(
        MonitoringConnector.ingest_key == ingest_key,
    ).first()
    if not connector:
        raise HTTPException(404, "Connecteur introuvable")
    if not connector.enabled:
        return {"ok": True, "message": "Connecteur désactivé — alerte ignorée"}

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "Corps JSON invalide")

    parser = PARSERS.get(connector.connector_type, PARSERS["generic"])
    normalized = parser(payload)
    _process_normalized(db, connector, normalized, payload)
    return {"ok": True, "processed": len(normalized)}


@ingest_router.post("/ingest/{ingest_key}/snmp", status_code=200)
async def ingest_snmp(ingest_key: uuid.UUID, request: Request, db: DbDep):
    """
    Endpoint pour les traps SNMP forwardés par snmptrapd.
    Configurer snmptrapd avec un handler qui POSTe un JSON au format :
    {"agent": "IP", "oid": "1.3.6...", "title": "...", "severity": "high",
     "varbinds": {...}, "uptime": "..."}
    """
    connector = db.query(MonitoringConnector).filter(
        MonitoringConnector.ingest_key == ingest_key,
        MonitoringConnector.connector_type == "snmp",
    ).first()
    if not connector:
        raise HTTPException(404, "Connecteur SNMP introuvable")
    if not connector.enabled:
        return {"ok": True, "message": "Connecteur désactivé"}

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "Corps JSON invalide")

    normalized = PARSERS["snmp"](payload)
    _process_normalized(db, connector, normalized, payload)
    return {"ok": True, "processed": len(normalized)}
