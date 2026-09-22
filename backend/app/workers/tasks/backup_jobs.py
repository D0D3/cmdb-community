"""Tâche Celery — exécution des jobs de sauvegarde planifiés."""
from __future__ import annotations
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.tasks.backup_jobs.run_scheduled_backups")
def run_scheduled_backups() -> dict:
    """Vérifie chaque job actif et déclenche la sauvegarde si elle est due."""
    from app.core.database import SessionLocal
    from app.backup.models import BackupJob
    from app.backup.service import run_backup, job_due

    executed = []
    with SessionLocal() as db:
        jobs = db.query(BackupJob).filter(BackupJob.is_active == True).all()  # noqa: E712
        for job in jobs:
            if job_due(job):
                logger.info("Exécution du job de sauvegarde : %s (%s)", job.name, job.schedule)
                try:
                    run = run_backup(db, job)
                    executed.append({"id": str(job.id), "name": job.name, "status": run.status})
                except Exception as exc:
                    logger.exception("Échec du job backup %s", job.id)
                    executed.append({"id": str(job.id), "name": job.name, "status": "error", "error": str(exc)})

    return {"executed": executed, "count": len(executed)}
