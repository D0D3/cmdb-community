"""Tâche Celery : synchronisation automatique de tous les connecteurs actifs."""
import logging
from datetime import datetime, timezone

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

_SYNCABLE = {"ldap", "glpi", "entra", "intune", "ssh",
             "postgresql", "mysql", "mssql", "oracle", "mongodb"}


@celery_app.task(name="app.workers.tasks.sync_connectors.sync_all_connectors")
def sync_all_connectors():
    """Synchronise tous les connecteurs DB actifs dont l'intervalle est échu."""
    from app.core.database import SessionLocal
    from app.connectors.models import Connector, ConnectorSyncLog
    from app.connectors.crypto import decrypt_config
    from sqlalchemy import select

    now = datetime.now(timezone.utc)
    results = []

    with SessionLocal() as db:
        connectors = db.scalars(
            select(Connector).where(Connector.enabled == True)
        ).all()

        for c in connectors:
            if c.connector_type not in _SYNCABLE:
                continue

            interval_h = c.sync_interval_hours or 24
            if c.last_sync_at:
                elapsed_h = (now - c.last_sync_at).total_seconds() / 3600
                if elapsed_h < interval_h:
                    continue

            logger.info("Auto-sync connecteur %s (%s)", c.name, c.connector_type)
            try:
                result = _run_sync(c, db)
                results.append({"connector": c.name, "type": c.connector_type,
                                 "status": "ok", "result": result})
            except Exception as exc:
                logger.error("Erreur sync %s : %s", c.name, exc)
                results.append({"connector": c.name, "type": c.connector_type,
                                 "status": "error", "error": str(exc)})

    return results


def _run_sync(connector, db):
    """Appelle la bonne fonction de sync selon le type."""
    ctype = connector.connector_type

    started = datetime.now(timezone.utc)
    log = _create_log(db, connector.id, started)

    try:
        if ctype == "glpi":
            result = _sync_glpi(connector, db)
        elif ctype == "ldap":
            from app.connectors.sync_ldap import sync_ldap_users
            result = sync_ldap_users(connector, db)
        elif ctype == "entra":
            from app.connectors.sync_entra import sync_entra_users
            result = sync_entra_users(connector, db)
        elif ctype == "intune":
            from app.connectors.sync_intune import sync_intune_devices
            result = sync_intune_devices(connector, db)
        elif ctype == "ssh":
            from app.connectors.sync_ssh import sync_ssh_host
            result = sync_ssh_host(connector, db)
        elif ctype in ("postgresql", "mysql", "mssql", "oracle", "mongodb"):
            from app.connectors.sync_db import sync_db_connector
            result = sync_db_connector(connector, db)
        else:
            result = {"skipped": True, "reason": f"type {ctype} non syncable"}

        status = "error" if "error" in result else "ok"
        error_msg = result.get("error") if "error" in result else None
    except Exception as exc:
        result = {"error": str(exc)}
        status = "error"
        error_msg = str(exc)

    finished = datetime.now(timezone.utc)
    log.finished_at = finished
    log.status = status
    log.result = result
    log.error = error_msg
    connector.last_sync_at = finished
    connector.last_sync_result = result
    db.commit()

    if status == "error":
        try:
            from app.notifications.service import trigger
            from app.core.config import get_settings
            _domain = getattr(get_settings(), "domain", "")
            trigger(db, "connector_sync_error", domain=_domain,
                    connector_name=connector.name,
                    connector_type=connector.connector_type,
                    error=error_msg or "")
        except Exception:
            pass

    return result


def _create_log(db, connector_id, started_at):
    from app.connectors.models import ConnectorSyncLog
    log = ConnectorSyncLog(
        connector_id=connector_id,
        started_at=started_at,
        status="running",
        triggered_by="auto",
    )
    db.add(log)
    db.flush()
    return log


def _sync_glpi(connector, db):
    from app.connectors.crypto import decrypt_config
    from app.glpi.client import GLPIClient
    from app.glpi.sync import run_sync

    cfg = decrypt_config(connector.config_encrypted)
    client = GLPIClient(
        base_url=cfg.get("url", ""),
        app_token=cfg.get("app_token", ""),
        user_token=cfg.get("user_token") or None,
        username=cfg.get("username") or None,
        password=cfg.get("password") or None,
    )
    with client:
        return run_sync(db, client)
