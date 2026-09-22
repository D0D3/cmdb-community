"""Tâche hebdomadaire (lundi 8h) : digest statistique de la CMDB."""
from __future__ import annotations
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.tasks.weekly_digest.send_weekly_digest")
def send_weekly_digest() -> None:
    from app.core.database import SessionLocal
    from app.core.config import get_settings
    from app.notifications.service import trigger, get_recipients

    settings = get_settings()
    domain = getattr(settings, "domain", "")

    with SessionLocal() as db:
        recipients = get_recipients(db, "digest_weekly")
        if not recipients:
            logger.debug("weekly_digest: aucun destinataire configuré")
            return

        stats = _gather_stats(db)
        trigger(db, "digest_weekly", domain=domain, stats=stats)
        logger.info("weekly_digest: digest envoyé à %d destinataire(s)", len(recipients))


def _gather_stats(db) -> dict:
    from sqlalchemy import select, func, and_
    stats: dict = {}

    # CIs
    try:
        from app.cmdb.models import CI
        stats["ci_total"]  = db.scalar(select(func.count(CI.id))) or 0
        stats["ci_active"] = db.scalar(
            select(func.count(CI.id)).where(CI.status == "active")
        ) or 0
    except Exception:
        stats["ci_total"] = stats["ci_active"] = "—"

    # Alertes critiques actives
    try:
        from app.alerts.models import Alert
        stats["alerts_critical"] = db.scalar(
            select(func.count(Alert.id)).where(
                and_(Alert.severity == "critical", Alert.status == "open")
            )
        ) or 0
    except Exception:
        stats["alerts_critical"] = "—"

    # Incidents ouverts
    try:
        from app.incidents.models import Incident
        stats["incidents_open"] = db.scalar(
            select(func.count(Incident.id)).where(Incident.status == "open")
        ) or 0
    except Exception:
        stats["incidents_open"] = "—"

    # CVE critiques
    try:
        from app.cves.models import CVE
        stats["cve_critical"] = db.scalar(
            select(func.count(CVE.id)).where(CVE.cvss_score >= 9.0)
        ) or 0
    except Exception:
        stats["cve_critical"] = "—"

    # SLA expirant dans 30j
    try:
        from datetime import date, timedelta
        from app.sla.models import SLA  # type: ignore[import]
        cutoff = date.today() + timedelta(days=30)
        stats["sla_expiring_30"] = db.scalar(
            select(func.count(SLA.id)).where(
                and_(SLA.contract_end_date.isnot(None), SLA.contract_end_date <= cutoff)
            )
        ) or 0
    except Exception:
        stats["sla_expiring_30"] = "—"

    # Licences expirant dans 30j
    try:
        from datetime import date, timedelta
        from app.cmdb.models import SoftwareDetail  # type: ignore[import]
        cutoff = date.today() + timedelta(days=30)
        stats["license_expiring_30"] = db.scalar(
            select(func.count(SoftwareDetail.id)).where(
                and_(
                    SoftwareDetail.license_end_date.isnot(None),
                    SoftwareDetail.license_end_date <= cutoff,
                )
            )
        ) or 0
    except Exception:
        stats["license_expiring_30"] = "—"

    return stats
