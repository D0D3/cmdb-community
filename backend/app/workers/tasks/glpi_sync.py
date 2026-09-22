"""Tâche quotidienne : synchronisation GLPI → CI hardware."""
import logging

from app.workers.celery_app import celery_app
from app.core.config import get_settings

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.tasks.glpi_sync.sync_glpi")
def sync_glpi():
    settings = get_settings()
    if not settings.glpi_url or not settings.glpi_app_token:
        logger.info("GLPI non configuré — sync ignorée")
        return {"skipped": True}

    from app.core.database import SessionLocal
    from app.glpi.client import GLPIClient
    from app.glpi.sync import run_sync

    client = GLPIClient(
        url=settings.glpi_url,
        app_token=settings.glpi_app_token,
        user_token=settings.glpi_user_token,
        username=settings.glpi_username,
        password=settings.glpi_password,
    )
    with SessionLocal() as db:
        with client:
            result = run_sync(db, client)

    # Persiste le résultat pour le endpoint /api/glpi/status
    import json
    try:
        with open("/tmp/glpi_last_sync.json", "w") as f:
            json.dump(result, f)
    except Exception:
        pass

    return result
