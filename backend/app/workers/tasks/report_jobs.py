"""Exécution horaire des rapports planifiés."""
import logging
from app.workers.celery_app import celery_app
from app.core.database import SessionLocal

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.tasks.report_jobs.run_scheduled_reports")
def run_scheduled_reports():
    logger.info("run_scheduled_reports: démarrage")
    with SessionLocal() as db:
        from app.reports.service import check_and_run_scheduled_jobs
        ran = check_and_run_scheduled_jobs(db)
    logger.info("run_scheduled_reports: %d job(s) exécuté(s)", ran)
