"""
Service notifications.
  get_recipients() : retourne la liste d'emails pour un event_type si la règle est activée.
  trigger()        : dispatch vers la bonne fonction email selon l'event_type.
                     Silencieux si la règle est désactivée ou sans destinataire.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.notifications.models import NotificationRule


def list_rules(db: Session) -> list[NotificationRule]:
    return db.query(NotificationRule).order_by(NotificationRule.event_type).all()


def get_rule(db: Session, rule_id: uuid.UUID) -> NotificationRule | None:
    return db.query(NotificationRule).filter(NotificationRule.id == rule_id).first()


def update_rule(
    db: Session,
    rule_id: uuid.UUID,
    enabled: bool | None,
    recipient_emails: list[str] | None,
) -> NotificationRule | None:
    rule = get_rule(db, rule_id)
    if not rule:
        return None
    if enabled is not None:
        rule.enabled = enabled
    if recipient_emails is not None:
        rule.recipient_emails = recipient_emails
    rule.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rule)
    return rule


def get_recipients(db: Session, event_type: str) -> list[str]:
    rule = (
        db.query(NotificationRule)
        .filter(
            NotificationRule.event_type == event_type,
            NotificationRule.enabled.is_(True),
        )
        .first()
    )
    if not rule:
        return []
    return [e for e in (rule.recipient_emails or []) if e]


def trigger(db: Session, event_type: str, domain: str = "", **kwargs) -> None:
    """Déclenche l'envoi email si la règle est activée et a des destinataires."""
    recipients = get_recipients(db, event_type)
    if not recipients:
        return

    from app.notifications import email as mail

    if event_type == "alert_critical":
        mail.notify_critical_alert(
            ci_name=kwargs.get("ci_name", ""),
            alert_title=kwargs.get("alert_title", ""),
            recipients=recipients,
            domain=domain,
        )

    elif event_type in ("incident_open", "incident_critical"):
        mail.notify_incident_event(
            incident_id=kwargs.get("incident_id", ""),
            title=kwargs.get("title", ""),
            severity=kwargs.get("severity", ""),
            reporter=kwargs.get("reporter", ""),
            recipients=recipients,
            domain=domain,
        )

    elif event_type == "rfc_submitted":
        mail.notify_rfc_submitted(
            change_id=kwargs.get("change_id", ""),
            title=kwargs.get("title", ""),
            requester=kwargs.get("requester", ""),
            approver_email=recipients[0],
            domain=domain,
        )
        if len(recipients) > 1:
            for extra in recipients[1:]:
                mail.notify_rfc_submitted(
                    change_id=kwargs.get("change_id", ""),
                    title=kwargs.get("title", ""),
                    requester=kwargs.get("requester", ""),
                    approver_email=extra,
                    domain=domain,
                )

    elif event_type == "rfc_decision":
        for r in recipients:
            mail.notify_rfc_decision(
                change_id=kwargs.get("change_id", ""),
                title=kwargs.get("title", ""),
                new_status=kwargs.get("new_status", ""),
                requester_email=r,
                comment=kwargs.get("comment", ""),
                domain=domain,
            )

    elif event_type == "rfc_completed":
        for r in recipients:
            mail.notify_rfc_completed(
                change_id=kwargs.get("change_id", ""),
                title=kwargs.get("title", ""),
                requester_email=r,
                domain=domain,
            )

    elif event_type == "sla_expiring":
        mail.notify_sla_expiring(
            items=kwargs.get("items", []),
            recipients=recipients,
            domain=domain,
        )

    elif event_type == "license_expiring":
        mail.notify_license_expiring(
            items=kwargs.get("items", []),
            recipients=recipients,
            domain=domain,
        )

    elif event_type == "warranty_expiring":
        mail.notify_warranty_expiring(
            items=kwargs.get("items", []),
            recipients=recipients,
            domain=domain,
        )

    elif event_type == "leasing_expiring":
        mail.notify_leasing_expiring(
            items=kwargs.get("items", []),
            recipients=recipients,
            domain=domain,
        )

    elif event_type == "cve_critical_new":
        mail.notify_cve_critical_new(
            cves=kwargs.get("cves", []),
            recipients=recipients,
            domain=domain,
        )

    elif event_type == "connector_sync_error":
        mail.notify_connector_sync_error(
            connector_name=kwargs.get("connector_name", ""),
            connector_type=kwargs.get("connector_type", ""),
            error=kwargs.get("error", ""),
            recipients=recipients,
            domain=domain,
        )

    elif event_type == "digest_weekly":
        mail.notify_weekly_digest(
            stats=kwargs.get("stats", {}),
            recipients=recipients,
            domain=domain,
        )
