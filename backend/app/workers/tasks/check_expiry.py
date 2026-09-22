"""Tâche quotidienne : SLA et licences expirant bientôt (seuils J-30, J-7, J-1)."""
from __future__ import annotations
import logging
from datetime import date, timedelta

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

_THRESHOLDS = (30, 7, 1)


@celery_app.task(name="app.workers.tasks.check_expiry.check_expiry")
def check_expiry() -> None:
    from app.core.database import SessionLocal
    from app.core.config import get_settings
    from app.notifications.service import trigger, get_recipients

    settings = get_settings()
    domain = getattr(settings, "domain", "")

    with SessionLocal() as db:
        has_recipients = any(
            get_recipients(db, t)
            for t in ("sla_expiring", "license_expiring", "warranty_expiring", "leasing_expiring")
        )
        if not has_recipients:
            logger.debug("check_expiry: aucun destinataire configuré")
            return

        today = date.today()
        _check_slas(db, today, domain)
        _check_licenses(db, today, domain)
        _check_warranties(db, today, domain)
        _check_leasings(db, today, domain)


def _check_slas(db, today: date, domain: str) -> None:
    from sqlalchemy import select, and_
    from app.notifications.service import trigger, get_recipients

    recipients = get_recipients(db, "sla_expiring")
    if not recipients:
        return

    try:
        from app.sla.models import SLA  # type: ignore[import]
    except ImportError:
        return

    items = []
    for threshold in _THRESHOLDS:
        target = today + timedelta(days=threshold)
        rows = db.scalars(
            select(SLA).where(
                and_(
                    SLA.contract_end_date.isnot(None),
                    SLA.contract_end_date == target,
                )
            )
        ).all()
        for row in rows:
            items.append({
                "name":     getattr(row, "name", str(row.id)),
                "ci":       getattr(row, "ci_name", "") or "",
                "days":     threshold,
                "end_date": target.strftime("%d/%m/%Y"),
            })

    if items:
        trigger(db, "sla_expiring", domain=domain, items=items)
        logger.info("check_expiry: %d SLA notifiés", len(items))


def _check_licenses(db, today: date, domain: str) -> None:
    from sqlalchemy import select, and_
    from app.notifications.service import trigger, get_recipients

    recipients = get_recipients(db, "license_expiring")
    if not recipients:
        return

    try:
        from app.cmdb.models import SoftwareDetail  # type: ignore[import]
        from app.cmdb.models import CI
    except ImportError:
        try:
            from app.assets.models import SoftwareDetail  # type: ignore[import]
        except ImportError:
            return

    items = []
    for threshold in _THRESHOLDS:
        target = today + timedelta(days=threshold)
        rows = db.scalars(
            select(SoftwareDetail).where(
                and_(
                    SoftwareDetail.license_end_date.isnot(None),
                    SoftwareDetail.license_end_date == target,
                )
            )
        ).all()
        for row in rows:
            items.append({
                "software": getattr(row, "software_name", "") or str(row.id),
                "version":  getattr(row, "version", "") or "—",
                "days":     threshold,
                "end_date": target.strftime("%d/%m/%Y"),
            })

    if items:
        trigger(db, "license_expiring", domain=domain, items=items)
        logger.info("check_expiry: %d licences notifiées", len(items))


def _check_warranties(db, today: date, domain: str) -> None:
    from sqlalchemy import select, and_
    from app.notifications.service import trigger, get_recipients

    recipients = get_recipients(db, "warranty_expiring")
    if not recipients:
        return

    try:
        from app.cmdb.models import HardwareDetail, CI
    except ImportError:
        return

    items = []
    for threshold in _THRESHOLDS:
        target = today + timedelta(days=threshold)
        rows = db.scalars(
            select(HardwareDetail).where(
                and_(
                    HardwareDetail.warranty_end_date.isnot(None),
                    HardwareDetail.warranty_end_date == target,
                )
            )
        ).all()
        for row in rows:
            ci = db.get(CI, row.ci_id)
            items.append({
                "name":     ci.name if ci else str(row.ci_id),
                "days":     threshold,
                "end_date": target.strftime("%d/%m/%Y"),
            })

    if items:
        trigger(db, "warranty_expiring", domain=domain, items=items)
        logger.info("check_expiry: %d garanties notifiées", len(items))


def _check_leasings(db, today: date, domain: str) -> None:
    from sqlalchemy import select, and_
    from app.notifications.service import trigger, get_recipients

    recipients = get_recipients(db, "leasing_expiring")
    if not recipients:
        return

    try:
        from app.cmdb.models import HardwareDetail, CI
    except ImportError:
        return

    items = []
    for threshold in _THRESHOLDS:
        target = today + timedelta(days=threshold)
        rows = db.scalars(
            select(HardwareDetail).where(
                and_(
                    HardwareDetail.leasing_end_date.isnot(None),
                    HardwareDetail.leasing_end_date == target,
                )
            )
        ).all()
        for row in rows:
            ci = db.get(CI, row.ci_id)
            items.append({
                "name":     ci.name if ci else str(row.ci_id),
                "provider": getattr(row, "leasing_provider", "") or "—",
                "days":     threshold,
                "end_date": target.strftime("%d/%m/%Y"),
            })

    if items:
        trigger(db, "leasing_expiring", domain=domain, items=items)
        logger.info("check_expiry: %d leasings notifiés", len(items))
