"""
Routers alertes, flux RSS et webhooks.
  /api/alerts/…    : liste, acquitter, compter non lues (badge cloche topbar).
  /api/rss/…       : flux RSS authentifié (?token=) — alertes CVE/échéances.
  /api/webhooks/…  : CRUD endpoints webhook, test d'envoi manuel, historique livraisons.
"""
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_role
from app.alerts import service, webhook as wh_module
from app.alerts.models import WebhookEndpoint
from app.alerts.schemas import (
    AlertOut, AlertList, AlertStats, DeadlineList,
    WebhookCreate, WebhookUpdate, WebhookOut, DeliveryOut,
)
from app.auth.models import ApiToken

DbDep = Annotated[Session, Depends(get_db)]
_admin = require_role("admin")
_read  = require_role("admin", "it-infra", "it-application", "viewer")
_write = require_role("admin", "it-infra", "it-application")


# ── Alertes ───────────────────────────────────────────────────────────────────

alerts_router = APIRouter(prefix="/api/alerts", tags=["alertes"])


@alerts_router.get("/", response_model=AlertList, dependencies=[_read])
def list_alerts(
    db: DbDep,
    open_only: bool = True,
    kind: Optional[str] = None,
    severity: Optional[str] = None,
    ci_id: Optional[uuid.UUID] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    return service.list_alerts(db, open_only, kind, severity, ci_id, skip, limit)


@alerts_router.get("/stats", response_model=AlertStats, dependencies=[_read])
def alert_stats(db: DbDep):
    return service.get_alert_stats(db)


@alerts_router.get("/recent", response_model=list[AlertOut], dependencies=[_read])
def recent_alerts(db: DbDep, limit: int = Query(5, ge=1, le=20)):
    return service.get_recent_alerts(db, limit)


@alerts_router.patch("/{alert_id}/resolve", response_model=AlertOut, dependencies=[_write])
def resolve_alert(alert_id: uuid.UUID, db: DbDep):
    alert = service.resolve_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    return alert


# ── Échéances ─────────────────────────────────────────────────────────────────

deadlines_router = APIRouter(prefix="/api/deadlines", tags=["échéances"])


@deadlines_router.get("/", response_model=DeadlineList, dependencies=[_read])
def list_deadlines(
    db: DbDep,
    days_ahead: int = Query(90, ge=0, le=3650),
    include_expired: bool = True,
):
    return service.list_deadlines(db, days_ahead, include_expired)


@deadlines_router.get("/csv", dependencies=[_read])
def deadlines_csv(
    db: DbDep,
    days_ahead: int = Query(90, ge=0, le=3650),
    include_expired: bool = True,
):
    data = service.list_deadlines(db, days_ahead, include_expired)
    lines = ["CI,Type,Échéance,Jours restants,Sévérité"]
    for row in data.items:
        lines.append(
            f'"{row.ci_name}","{row.deadline_label}",{row.deadline_date},'
            f'{row.days_remaining},{row.severity}'
        )
    csv_content = "\n".join(lines)
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=echeances.csv"},
    )


# ── Flux RSS ──────────────────────────────────────────────────────────────────

feeds_router = APIRouter(prefix="/api/feeds", tags=["flux"])


@feeds_router.get("/alerts.xml")
def rss_alerts(request: Request, token: str, db: DbDep):
    """Flux RSS authentifié via ?token= (token API avec scope read)."""
    # Valider le token API via SHA-256 hash
    from app.auth.models import ApiToken
    from app.core.security import hash_api_token
    token_hash = hash_api_token(token)
    matched = db.query(ApiToken).filter(
        ApiToken.token_hash == token_hash,
        ApiToken.revoked_at.is_(None),
    ).first()
    if not matched or "read" not in matched.scopes:
        raise HTTPException(status_code=401, detail="Token invalide ou insufficient")

    alerts_data = service.list_alerts(db, open_only=True, limit=50)
    domain = request.base_url

    from feedgen.feed import FeedGenerator
    fg = FeedGenerator()
    fg.id(f"{domain}api/feeds/alerts.xml")
    fg.title("CMDB — Alertes")
    fg.author({"name": "CMDB", "email": "cmdb@local"})
    fg.link(href=str(domain), rel="alternate")
    fg.link(href=f"{domain}api/feeds/alerts.xml?token={token}", rel="self")
    fg.description("Alertes ouvertes de la CMDB (garanties, EOL, licences, maintenances)")

    for alert in alerts_data.items:
        fe = fg.add_entry()
        fe.id(str(alert.id))
        fe.title(alert.title)
        fe.description(alert.body or alert.title)
        fe.published(alert.created_at.replace(tzinfo=timezone.utc))
        fe.updated(alert.created_at.replace(tzinfo=timezone.utc))
        fe.link(href=f"{domain}alerts/{alert.id}")

    return Response(
        content=fg.rss_str(pretty=True),
        media_type="application/rss+xml; charset=utf-8",
    )


# ── Webhooks ──────────────────────────────────────────────────────────────────

webhooks_router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@webhooks_router.get("/", response_model=list[WebhookOut], dependencies=[_admin])
def list_webhooks(db: DbDep):
    return service.list_webhooks(db)


@webhooks_router.post("/", response_model=WebhookOut, status_code=201, dependencies=[_admin])
def create_webhook(data: WebhookCreate, db: DbDep):
    return service.create_webhook(db, data)


@webhooks_router.patch("/{wh_id}", response_model=WebhookOut, dependencies=[_admin])
def update_webhook(wh_id: uuid.UUID, data: WebhookUpdate, db: DbDep):
    wh = service.get_webhook(db, wh_id)
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook introuvable")
    return service.update_webhook(db, wh, data)


@webhooks_router.delete("/{wh_id}", status_code=204, dependencies=[_admin])
def delete_webhook(wh_id: uuid.UUID, db: DbDep):
    wh = service.get_webhook(db, wh_id)
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook introuvable")
    service.delete_webhook(db, wh)


@webhooks_router.post("/{wh_id}/test", dependencies=[_admin])
def test_webhook(wh_id: uuid.UUID, db: DbDep):
    wh = service.get_webhook(db, wh_id)
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook introuvable")
    success, status_code, body = wh_module.test_webhook(wh)
    return {"success": success, "status_code": status_code, "response": body}


@webhooks_router.get("/{wh_id}/deliveries", response_model=list[DeliveryOut], dependencies=[_admin])
def webhook_deliveries(wh_id: uuid.UUID, db: DbDep, limit: int = Query(50, ge=1, le=200)):
    wh = service.get_webhook(db, wh_id)
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook introuvable")
    return service.list_deliveries(db, wh_id, limit)
