"""
Router notifications (/api/notifications/…).
  /rules       : liste et mise à jour des règles de notification (admin).
  /test        : envoi d'un email de test pour valider la config SMTP.
  trigger()    : appelé depuis les services pour déclencher les emails selon les règles actives.
"""
import uuid
from fastapi import APIRouter, HTTPException

from app.core.deps import DbDep, CurrentUser, require_role
from app.notifications.schemas import NotificationRuleOut, NotificationRuleUpdate, NotificationTestIn
from app.notifications import service

_admin = [require_role("admin")]

notifications_router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@notifications_router.get("/rules", response_model=list[NotificationRuleOut], dependencies=_admin)
def list_rules(db: DbDep):
    rules = service.list_rules(db)
    return [NotificationRuleOut.from_orm_enriched(r) for r in rules]


@notifications_router.patch("/rules/{rule_id}", response_model=NotificationRuleOut, dependencies=_admin)
def update_rule(rule_id: uuid.UUID, data: NotificationRuleUpdate, db: DbDep):
    rule = service.update_rule(db, rule_id, data.enabled, data.recipient_emails)
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    return NotificationRuleOut.from_orm_enriched(rule)


@notifications_router.post("/test", status_code=204, dependencies=_admin)
def test_notification(data: NotificationTestIn):
    """Envoie un email de test."""
    from app.notifications.email import send_email
    html = """
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#6d28d9;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">CMDB — Test de notification</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p>Ce message confirme que les notifications email sont correctement configurées.</p>
    <p style="margin-top:16px;font-size:13px;color:#6b7280">Événement testé : <strong>{event}</strong></p>
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Ce message a été généré automatiquement par la CMDB.</p>
  </div>
</body></html>""".format(event=data.event_type)
    ok = send_email(data.recipient, f"[CMDB] Test notification — {data.event_type}", html)
    if not ok:
        raise HTTPException(status_code=503, detail="Échec d'envoi — vérifiez la configuration SMTP")
