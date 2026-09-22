"""
Configuration Celery + Celery Beat.
Broker/backend : Redis (redis_url depuis settings).
Tâches planifiées :
  - cve_sync       : quotidien (24h) — sync NVD/CISA
  - deadlines      : horaire — vérification échéances
  - update_check   : quotidien — vérif mise à jour CMDB
  - glpi_sync      : quotidien — sync GLPI → CI hardware
  - notify_alerts  : horaire — emails alertes critiques
  - report_jobs    : horaire — rapports planifiés (exécution entre 7h-8h)
  - sync_connectors: horaire — sync connecteurs activés
  - check_expiry   : quotidien — garanties/licences/SLA expirant
  - weekly_digest  : lundi 8h — digest hebdomadaire
  - backup_jobs    : chaque minute — sauvegardes planifiées (check léger, exécution si heure:minute atteint)
"""
from celery import Celery
from celery.schedules import crontab
from app.core.config import get_settings

# Tous les modèles doivent être importés avant l'initialisation des mappers
# SQLAlchemy : CI → CIKeyUser → User (lazy strings résolus au premier accès).
import app.auth.models      # noqa: F401
import app.keyusers.models  # noqa: F401

settings = get_settings()

celery_app = Celery(
    "cmdb",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.workers.tasks.cve_sync",
        "app.workers.tasks.deadlines",
        "app.workers.tasks.update_check",
        "app.workers.tasks.glpi_sync",
        "app.workers.tasks.notify_alerts",
        "app.workers.tasks.report_jobs",
        "app.workers.tasks.sync_connectors",
        "app.workers.tasks.check_expiry",
        "app.workers.tasks.weekly_digest",
        "app.workers.tasks.backup_jobs",
    ],
)

celery_app.conf.beat_schedule = {
    "cve-sync-daily": {
        "task": "app.workers.tasks.cve_sync.sync_nvd_cisa",
        "schedule": 86400.0,  # toutes les 24h
    },
    "deadlines-check-daily": {
        "task": "app.workers.tasks.deadlines.check_deadlines",
        "schedule": 3600.0,  # toutes les heures
    },
    "update-check-daily": {
        "task": "app.workers.tasks.update_check.check_app_update",
        "schedule": 86400.0,
    },
    "glpi-sync-daily": {
        "task": "app.workers.tasks.glpi_sync.sync_glpi",
        "schedule": 86400.0,  # toutes les 24h
    },
    "notify-critical-alerts-hourly": {
        "task": "app.workers.tasks.notify_alerts.send_critical_alert_emails",
        "schedule": 3600.0,  # toutes les heures
    },
    "report-jobs-hourly": {
        "task": "app.workers.tasks.report_jobs.run_scheduled_reports",
        "schedule": 3600.0,
    },
    "sync-all-connectors-hourly": {
        "task": "app.workers.tasks.sync_connectors.sync_all_connectors",
        "schedule": 3600.0,  # vérifie chaque heure, synce si intervalle échu
    },
    "check-expiry-daily": {
        "task": "app.workers.tasks.check_expiry.check_expiry",
        "schedule": 86400.0,  # toutes les 24h
    },
    "weekly-digest-monday": {
        "task": "app.workers.tasks.weekly_digest.send_weekly_digest",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),  # lundi 8h
    },
    "backup-jobs-minutely": {
        "task": "app.workers.tasks.backup_jobs.run_scheduled_backups",
        "schedule": crontab(minute="*"),  # chaque minute, aligné à l'horloge → supporte HH:mm exact
    },
}

celery_app.conf.timezone = "Europe/Paris"

# Recyclage mémoire : redémarre un worker child après 50 tâches ou 200 MiB
celery_app.conf.worker_max_tasks_per_child = 50
celery_app.conf.worker_max_memory_per_child = 200000  # 200 MiB en KiB

# Réduit la pression mémoire : ne précharge qu'une tâche à la fois par worker
celery_app.conf.worker_prefetch_multiplier = 1
