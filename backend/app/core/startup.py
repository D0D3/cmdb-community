"""
Hook exécuté une fois au démarrage de l'API (on_startup dans main.py).
Toutes les fonctions sont idempotentes : safe à réappeler après un redémarrage.

  seed_builtin_roles      → crée les rôles builtin si absents (admin, manager, user…)
  _ensure_admin           → compte break-glass défini dans .env (admin_email/password)
  _seed_notification_rules→ crée les règles de notification désactivées par défaut
"""
import logging
from sqlalchemy.orm import Session

from app.auth.service import seed_builtin_roles, get_user_by_email, create_local_user
from app.auth.schemas import UserCreate
from app.auth.models import User, UserRole
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def run_startup(db: Session) -> None:
    seed_builtin_roles(db)
    _ensure_admin(db)
    _seed_notification_rules(db)


def _ensure_admin(db: Session) -> None:
    admin = get_user_by_email(db, settings.admin_email)
    if admin:
        return
    logger.info("Création du compte admin break-glass : %s", settings.admin_email)
    user = create_local_user(db, UserCreate(
        email=settings.admin_email,
        full_name="Administrateur",
        password=settings.admin_password,
        role_slugs=["admin"],
    ))
    logger.info("Compte admin créé : %s", user.id)


def _seed_notification_rules(db: Session) -> None:
    from app.notifications.models import NotificationRule
    from app.notifications.schemas import EVENT_LABELS

    existing = {r.event_type for r in db.query(NotificationRule.event_type).all()}
    added = 0
    for event_type in EVENT_LABELS:
        if event_type not in existing:
            db.add(NotificationRule(
                event_type=event_type,
                enabled=False,
                recipient_emails=[],
            ))
            added += 1
    if added:
        db.commit()
        logger.info("Notification rules créées : %d", added)
