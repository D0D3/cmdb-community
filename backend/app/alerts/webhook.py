"""Dispatch d'alertes vers les webhooks configurés."""
import hashlib
import hmac
import json
import time
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.cmdb.models import Alert
from app.alerts.models import WebhookEndpoint, WebhookDelivery

logger = logging.getLogger(__name__)


def _sign(secret: str, payload_str: str, timestamp: str) -> str:
    message = f"{timestamp}.{payload_str}"
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def _build_payload(alert: Alert) -> dict:
    return {
        "event": "alert.created",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "alert": {
            "id": str(alert.id),
            "kind": alert.kind,
            "severity": alert.severity,
            "title": alert.title,
            "body": alert.body or "",
            "ci_id": str(alert.ci_id) if alert.ci_id else None,
            "created_at": alert.created_at.isoformat(),
        },
    }


def dispatch_alert_to_webhooks(db: Session, alert: Alert) -> None:
    endpoints: list[WebhookEndpoint] = (
        db.query(WebhookEndpoint)
        .filter(WebhookEndpoint.is_active.is_(True))
        .all()
    )

    for ep in endpoints:
        # Filtrer sur le type d'événement
        if ep.event_filter != "*" and alert.kind not in ep.event_filter.split(","):
            continue

        payload = _build_payload(alert)
        payload_str = json.dumps(payload, ensure_ascii=False)
        timestamp = str(int(time.time()))

        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "CMDB-Webhook/1.0",
            "X-CMDB-Timestamp": timestamp,
        }
        if ep.secret:
            sig = _sign(ep.secret, payload_str, timestamp)
            headers["X-CMDB-Signature"] = f"sha256={sig}"

        status_code = None
        response_body = ""
        success = False
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(ep.url, content=payload_str, headers=headers)
                status_code = resp.status_code
                response_body = resp.text[:2000]
                success = resp.is_success
        except Exception as exc:
            response_body = str(exc)[:2000]
            logger.warning("Webhook %s → %s : %s", ep.name, ep.url, exc)

        delivery = WebhookDelivery(
            endpoint_id=ep.id,
            alert_id=alert.id,
            payload=payload,
            status_code=status_code,
            response_body=response_body,
            success=success,
        )
        db.add(delivery)

    db.commit()


def test_webhook(endpoint: WebhookEndpoint) -> tuple[bool, int | None, str]:
    """Envoie un ping de test, renvoie (success, status_code, message)."""
    payload = {
        "event": "ping",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "message": "Test de connexion depuis CMDB",
    }
    payload_str = json.dumps(payload, ensure_ascii=False)
    timestamp = str(int(time.time()))

    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "CMDB-Webhook/1.0",
        "X-CMDB-Timestamp": timestamp,
    }
    if endpoint.secret:
        sig = _sign(endpoint.secret, payload_str, timestamp)
        headers["X-CMDB-Signature"] = f"sha256={sig}"

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(endpoint.url, content=payload_str, headers=headers)
            return resp.is_success, resp.status_code, resp.text[:500]
    except Exception as exc:
        return False, None, str(exc)
