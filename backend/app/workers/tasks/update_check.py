"""Tâche quotidienne : vérification de mise à jour CMDB (stub — TODO)."""
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.update_check.check_app_update")
def check_app_update():
    # TODO M3 — comparaison version locale vs manifeste distant
    pass
