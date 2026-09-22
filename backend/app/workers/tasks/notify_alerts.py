"""Tâche Celery : envoi des emails pour les alertes critiques non résolues."""
import logging
from app.workers.celery_app import celery_app
from app.core.database import SessionLocal
from app.core.config import get_settings

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.tasks.notify_alerts.send_critical_alert_emails")
def send_critical_alert_emails():
    """Envoie un email récapitulatif des alertes critiques ouvertes aux admins."""
    from app.cmdb.models import Alert
    from app.auth.models import User, UserRole, Role

    settings = get_settings()
    domain = settings.domain

    with SessionLocal() as db:
        criticals = (
            db.query(Alert)
            .filter(Alert.severity == "critical", Alert.resolved_at.is_(None))
            .order_by(Alert.created_at.desc())
            .limit(20)
            .all()
        )

        if not criticals:
            logger.info("notify_alerts: aucune alerte critique ouverte")
            return

        admin_role = db.query(Role).filter(Role.slug == "admin").first()
        if not admin_role:
            return

        admins = (
            db.query(User)
            .join(UserRole, User.id == UserRole.user_id)
            .filter(UserRole.role_id == admin_role.id, User.is_active.is_(True))
            .all()
        )
        recipients = [u.email for u in admins if u.email]
        if not recipients:
            logger.info("notify_alerts: aucun admin avec email")
            return

        from app.notifications.email import notify_critical_alert
        from app.cmdb.models import CI

        for alert in criticals[:5]:
            ci = db.get(CI, alert.ci_id) if alert.ci_id else None
            ci_name = ci.name if ci else "—"
            notify_critical_alert(ci_name, alert.title, recipients, domain)

        logger.info("notify_alerts: %d emails envoyés vers %s", len(criticals[:5]), recipients)
