"""Tâche quotidienne : détection des échéances et création d'alertes dédupliquées."""
import logging
from datetime import date

from app.workers.celery_app import celery_app
from app.core.database import SessionLocal
from app.cmdb.models import CI, HardwareDetail, SoftwareDetail, Sla, MaintenanceSchedule
from app.alerts.service import upsert_deadline_alert
from app.alerts.webhook import dispatch_alert_to_webhooks

logger = logging.getLogger(__name__)

THRESHOLD_DAYS = 90  # alertes déclenchées sous ce seuil (J-90)


def _days(d: date) -> int:
    return (d - date.today()).days


def _prefix(d: int) -> str:
    return f"EXPIRÉ ({abs(d)} j)" if d < 0 else f"J-{d}"


@celery_app.task(name="app.workers.tasks.deadlines.check_deadlines")
def check_deadlines():
    logger.info("check_deadlines: démarrage")
    new_count = 0

    with SessionLocal() as db:
        # ── Hardware : fin de garantie ────────────────────────────────────────
        hw_rows = (
            db.query(CI, HardwareDetail)
            .join(HardwareDetail, CI.id == HardwareDetail.ci_id)
            .filter(
                CI.deleted_at.is_(None),
                CI.status != "retired",
                HardwareDetail.warranty_end_date.isnot(None),
            )
            .all()
        )
        for ci, hw in hw_rows:
            d = _days(hw.warranty_end_date)
            if d <= THRESHOLD_DAYS:
                alert = upsert_deadline_alert(
                    db=db, ci_id=ci.id, kind="warranty_expiry",
                    title=f"Fin de garantie — {ci.name} ({_prefix(d)})",
                    body=f"La garantie de {ci.name} expire le {hw.warranty_end_date}.",
                    deadline_date=hw.warranty_end_date, days_remaining=d,
                )
                if alert:
                    new_count += 1
                    dispatch_alert_to_webhooks(db, alert)

        # ── Hardware : fin de leasing ─────────────────────────────────────────
        for ci, hw in hw_rows:
            if hw.leasing_end_date:
                d = _days(hw.leasing_end_date)
                if d <= THRESHOLD_DAYS:
                    alert = upsert_deadline_alert(
                        db=db, ci_id=ci.id, kind="leasing_expiry",
                        title=f"Fin de leasing — {ci.name} ({_prefix(d)})",
                        body=f"Le leasing de {ci.name} expire le {hw.leasing_end_date}.",
                        deadline_date=hw.leasing_end_date, days_remaining=d,
                    )
                    if alert:
                        new_count += 1
                        dispatch_alert_to_webhooks(db, alert)

        # ── Software : fin de licence et EOL ──────────────────────────────────
        sw_rows = (
            db.query(CI, SoftwareDetail)
            .join(SoftwareDetail, CI.id == SoftwareDetail.ci_id)
            .filter(CI.deleted_at.is_(None), CI.status != "retired")
            .all()
        )
        for ci, sw in sw_rows:
            if sw.license_end_date:
                d = _days(sw.license_end_date)
                if d <= THRESHOLD_DAYS:
                    alert = upsert_deadline_alert(
                        db=db, ci_id=ci.id, kind="license_expiry",
                        title=f"Fin de licence — {ci.name} ({_prefix(d)})",
                        body=f"La licence {sw.product} expire le {sw.license_end_date}.",
                        deadline_date=sw.license_end_date, days_remaining=d,
                    )
                    if alert:
                        new_count += 1
                        dispatch_alert_to_webhooks(db, alert)

            if sw.eol_date:
                d = _days(sw.eol_date)
                if d <= THRESHOLD_DAYS:
                    alert = upsert_deadline_alert(
                        db=db, ci_id=ci.id, kind="eol",
                        title=f"EOL éditeur — {ci.name} ({_prefix(d)})",
                        body=f"{sw.product} atteint sa fin de support le {sw.eol_date}.",
                        deadline_date=sw.eol_date, days_remaining=d,
                    )
                    if alert:
                        new_count += 1
                        dispatch_alert_to_webhooks(db, alert)

        # ── SLA : fin de contrat ──────────────────────────────────────────────
        for sla in db.query(Sla).filter(Sla.contract_end_date.isnot(None)).all():
            d = _days(sla.contract_end_date)
            if d <= THRESHOLD_DAYS:
                alert = upsert_deadline_alert(
                    db=db, ci_id=None, kind="sla_expiry",
                    title=f"Contrat SLA — {sla.name} ({_prefix(d)})",
                    body=f"Le contrat SLA « {sla.name} » expire le {sla.contract_end_date}.",
                    deadline_date=sla.contract_end_date, days_remaining=d,
                )
                if alert:
                    new_count += 1
                    dispatch_alert_to_webhooks(db, alert)

        # ── Maintenances planifiées ───────────────────────────────────────────
        for sched, ci in (
            db.query(MaintenanceSchedule, CI)
            .join(CI, MaintenanceSchedule.ci_id == CI.id)
            .filter(CI.deleted_at.is_(None), MaintenanceSchedule.is_active.is_(True))
            .all()
        ):
            d = _days(sched.next_due_date)
            remind = sched.remind_days if isinstance(sched.remind_days, list) else [30, 7]
            if d <= (max(remind) if remind else 30):
                alert = upsert_deadline_alert(
                    db=db, ci_id=ci.id, kind="maintenance_due",
                    title=f"Maintenance — {sched.title} / {ci.name} ({_prefix(d)})",
                    body=f"Maintenance « {sched.title} » planifiée le {sched.next_due_date}.",
                    deadline_date=sched.next_due_date, days_remaining=d,
                )
                if alert:
                    new_count += 1
                    dispatch_alert_to_webhooks(db, alert)

        db.commit()

    logger.info("check_deadlines: %d nouvelle(s) alerte(s)", new_count)
