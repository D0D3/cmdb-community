"""
Service alertes : création, déduplication, calcul des échéances à venir.
  create_alert()         : upsert par dedup_key — évite les doublons en base.
  list_deadlines()       : vue agrégée live des CI dont une échéance approche (J-90/J-30).
  dispatch_alert()       : envoie l'alerte vers RSS + webhooks actifs.
"""
import uuid
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.cmdb.models import Alert, CI, HardwareDetail, SoftwareDetail, Sla, MaintenanceSchedule
from app.alerts.models import WebhookEndpoint, WebhookDelivery
from app.alerts.schemas import (
    AlertList, AlertStats, DeadlineOut, DeadlineList,
    WebhookCreate, WebhookUpdate,
)

DEADLINE_HORIZON_DAYS = 90  # alertes jusqu'à J-90


def _severity(days: int) -> str:
    if days <= 30:
        return "critical"
    if days <= 90:
        return "warning"
    return "info"


# ── Alertes ───────────────────────────────────────────────────────────────────

def list_alerts(
    db: Session,
    open_only: bool = True,
    kind: Optional[str] = None,
    severity: Optional[str] = None,
    ci_id: Optional[uuid.UUID] = None,
    skip: int = 0,
    limit: int = 50,
) -> AlertList:
    q = db.query(Alert)
    if open_only:
        q = q.filter(Alert.resolved_at.is_(None))
    if kind:
        q = q.filter(Alert.kind == kind)
    if severity:
        q = q.filter(Alert.severity == severity)
    if ci_id:
        q = q.filter(Alert.ci_id == ci_id)
    total = q.count()
    items = q.order_by(Alert.created_at.desc()).offset(skip).limit(limit).all()
    return AlertList(total=total, items=items)


def resolve_alert(db: Session, alert_id: uuid.UUID) -> Optional[Alert]:
    from datetime import datetime, timezone
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        return None
    alert.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(alert)
    return alert


def get_alert_stats(db: Session) -> AlertStats:
    open_q = db.query(Alert).filter(Alert.resolved_at.is_(None))
    return AlertStats(
        open=open_q.count(),
        critical=open_q.filter(Alert.severity == "critical").count(),
        warning=open_q.filter(Alert.severity == "warning").count(),
        info_count=open_q.filter(Alert.severity == "info").count(),
    )


def get_recent_alerts(db: Session, limit: int = 5) -> list[Alert]:
    return (
        db.query(Alert)
        .filter(Alert.resolved_at.is_(None))
        .order_by(Alert.created_at.desc())
        .limit(limit)
        .all()
    )


# ── Échéances (vue agrégée live, indépendante des alertes) ───────────────────

def list_deadlines(
    db: Session,
    days_ahead: int = 90,
    include_expired: bool = True,
) -> DeadlineList:
    today = date.today()
    cutoff = today + timedelta(days=days_ahead)
    rows: list[DeadlineOut] = []

    # Hardware — fin de garantie
    hw_q = (
        db.query(CI, HardwareDetail)
        .join(HardwareDetail, CI.id == HardwareDetail.ci_id)
        .filter(
            CI.deleted_at.is_(None),
            CI.status != "retired",
            HardwareDetail.warranty_end_date.isnot(None),
            HardwareDetail.warranty_end_date <= cutoff,
        )
    )
    if not include_expired:
        hw_q = hw_q.filter(HardwareDetail.warranty_end_date >= today)
    for ci, hw in hw_q.all():
        d = (hw.warranty_end_date - today).days
        rows.append(DeadlineOut(
            ci_id=ci.id, ci_name=ci.name, ci_type=ci.ci_type,
            deadline_type="warranty_expiry", deadline_label="Fin de garantie",
            deadline_date=hw.warranty_end_date, days_remaining=d, severity=_severity(d),
        ))

    # Software — fin de licence
    sw_lic_q = (
        db.query(CI, SoftwareDetail)
        .join(SoftwareDetail, CI.id == SoftwareDetail.ci_id)
        .filter(
            CI.deleted_at.is_(None),
            CI.status != "retired",
            SoftwareDetail.license_end_date.isnot(None),
            SoftwareDetail.license_end_date <= cutoff,
        )
    )
    if not include_expired:
        sw_lic_q = sw_lic_q.filter(SoftwareDetail.license_end_date >= today)
    for ci, sw in sw_lic_q.all():
        d = (sw.license_end_date - today).days
        rows.append(DeadlineOut(
            ci_id=ci.id, ci_name=ci.name, ci_type=ci.ci_type,
            deadline_type="license_expiry", deadline_label="Fin de licence",
            deadline_date=sw.license_end_date, days_remaining=d, severity=_severity(d),
        ))

    # Software — EOL éditeur
    sw_eol_q = (
        db.query(CI, SoftwareDetail)
        .join(SoftwareDetail, CI.id == SoftwareDetail.ci_id)
        .filter(
            CI.deleted_at.is_(None),
            CI.status != "retired",
            SoftwareDetail.eol_date.isnot(None),
            SoftwareDetail.eol_date <= cutoff,
        )
    )
    if not include_expired:
        sw_eol_q = sw_eol_q.filter(SoftwareDetail.eol_date >= today)
    for ci, sw in sw_eol_q.all():
        d = (sw.eol_date - today).days
        rows.append(DeadlineOut(
            ci_id=ci.id, ci_name=ci.name, ci_type=ci.ci_type,
            deadline_type="eol", deadline_label="EOL éditeur",
            deadline_date=sw.eol_date, days_remaining=d, severity=_severity(d),
        ))

    # SLA — fin de contrat
    sla_q = (
        db.query(Sla)
        .filter(
            Sla.contract_end_date.isnot(None),
            Sla.contract_end_date <= cutoff,
        )
    )
    if not include_expired:
        sla_q = sla_q.filter(Sla.contract_end_date >= today)
    for sla in sla_q.all():
        d = (sla.contract_end_date - today).days
        rows.append(DeadlineOut(
            ci_id=None, ci_name=sla.name, ci_type=None,
            deadline_type="sla_expiry", deadline_label="Contrat SLA",
            deadline_date=sla.contract_end_date, days_remaining=d, severity=_severity(d),
        ))

    # Maintenances — prochaine échéance
    maint_q = (
        db.query(MaintenanceSchedule, CI)
        .join(CI, MaintenanceSchedule.ci_id == CI.id)
        .filter(
            CI.deleted_at.is_(None),
            MaintenanceSchedule.is_active.is_(True),
            MaintenanceSchedule.next_due_date <= cutoff,
        )
    )
    if not include_expired:
        maint_q = maint_q.filter(MaintenanceSchedule.next_due_date >= today)
    for sched, ci in maint_q.all():
        d = (sched.next_due_date - today).days
        rows.append(DeadlineOut(
            ci_id=ci.id, ci_name=ci.name, ci_type=ci.ci_type,
            deadline_type="maintenance_due", deadline_label=f"Maintenance — {sched.title}",
            deadline_date=sched.next_due_date, days_remaining=d, severity=_severity(d),
        ))

    rows.sort(key=lambda r: r.days_remaining)
    return DeadlineList(total=len(rows), items=rows)


# ── Worker : création d'alertes dédupliquées ──────────────────────────────────

def upsert_deadline_alert(
    db: Session,
    ci_id: Optional[uuid.UUID],
    kind: str,
    title: str,
    body: str,
    deadline_date: date,
    days_remaining: int,
) -> Optional[Alert]:
    """Crée une alerte si aucune alerte ouverte n'existe avec la même dedup_key."""
    dedup_key = f"{kind}:{ci_id}:{deadline_date.isoformat()}"
    existing = db.query(Alert).filter(Alert.dedup_key == dedup_key).first()
    if existing:
        # Mettre à jour la sévérité si elle a empiré
        new_sev = _severity(days_remaining)
        if existing.resolved_at is None and existing.severity != new_sev:
            existing.severity = new_sev
        return None
    severity = _severity(days_remaining)
    alert = Alert(
        kind=kind,
        severity=severity,
        title=title,
        body=body,
        ci_id=ci_id,
        dedup_key=dedup_key,
    )
    db.add(alert)
    db.flush()  # pour avoir l'id avant commit
    return alert


# ── Webhooks ──────────────────────────────────────────────────────────────────

def list_webhooks(db: Session) -> list[WebhookEndpoint]:
    return db.query(WebhookEndpoint).order_by(WebhookEndpoint.created_at.desc()).all()


def get_webhook(db: Session, wh_id: uuid.UUID) -> Optional[WebhookEndpoint]:
    return db.query(WebhookEndpoint).filter(WebhookEndpoint.id == wh_id).first()


def create_webhook(db: Session, data: WebhookCreate) -> WebhookEndpoint:
    wh = WebhookEndpoint(**data.model_dump())
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


def update_webhook(db: Session, wh: WebhookEndpoint, data: WebhookUpdate) -> WebhookEndpoint:
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(wh, field, value)
    db.commit()
    db.refresh(wh)
    return wh


def delete_webhook(db: Session, wh: WebhookEndpoint) -> None:
    db.delete(wh)
    db.commit()


def list_deliveries(db: Session, endpoint_id: uuid.UUID, limit: int = 50) -> list[WebhookDelivery]:
    return (
        db.query(WebhookDelivery)
        .filter(WebhookDelivery.endpoint_id == endpoint_id)
        .order_by(WebhookDelivery.delivered_at.desc())
        .limit(limit)
        .all()
    )
