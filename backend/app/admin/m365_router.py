"""Endpoints admin — configuration et synchronisation du calendrier M365/Outlook."""
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.connectors.models import Connector
from app.connectors.crypto import encrypt_config, decrypt_config
from app.connectors.m365_calendar import (
    M365Error, get_token, test_connection,
    create_event, update_event, delete_event,
)
from app.cmdb.models import CI, MaintenanceSchedule

router  = APIRouter(prefix="/api/admin/m365", tags=["m365 calendar"])
DbDep   = Annotated[Session, Depends(get_db)]
_admin  = require_role("admin")

_TYPE   = "m365_calendar"
_SENSITIVE = {"client_secret"}


def _mask(cfg: dict) -> dict:
    return {k: "***" if k in _SENSITIVE and v else v for k, v in cfg.items()}


def _get_connector(db: Session) -> Optional[Connector]:
    return db.query(Connector).filter(Connector.connector_type == _TYPE).first()


def _resolve_cfg(db: Session) -> dict:
    """Lit et déchiffre la config M365 ou lève 400 si absente."""
    c = _get_connector(db)
    if not c or not c.enabled or not c.config_encrypted:
        raise HTTPException(400, "Connecteur M365 non configuré ou désactivé")
    return decrypt_config(c.config_encrypted)


# ── Config ────────────────────────────────────────────────────────────────────

@router.get("", dependencies=[_admin])
def get_m365_config(db: DbDep):
    c = _get_connector(db)
    if not c or not c.config_encrypted:
        return {"configured": False, "enabled": False, "config": None}
    cfg = decrypt_config(c.config_encrypted)
    return {"configured": True, "enabled": c.enabled, "config": _mask(cfg)}


class M365ConfigIn(BaseModel):
    tenant_id:      str
    client_id:      str
    client_secret:  str
    calendar_user:  str
    enabled:        bool = True


@router.post("", dependencies=[_admin])
def save_m365_config(data: M365ConfigIn, db: DbDep):
    cfg     = data.model_dump()
    enabled = cfg.pop("enabled", True)
    enc     = encrypt_config(cfg)
    c = _get_connector(db)
    if c:
        c.config_encrypted = enc
        c.enabled          = enabled
        c.name             = "M365 Calendrier"
    else:
        c = Connector(name="M365 Calendrier", connector_type=_TYPE,
                      config_encrypted=enc, enabled=enabled)
        db.add(c)
    db.commit()
    return {"ok": True}


@router.delete("", dependencies=[_admin], status_code=204)
def delete_m365_config(db: DbDep):
    c = _get_connector(db)
    if c:
        db.delete(c)
        db.commit()


@router.post("/test", dependencies=[_admin])
def test_m365(db: DbDep):
    cfg = _resolve_cfg(db)
    try:
        result = test_connection(
            cfg["tenant_id"], cfg["client_id"], cfg["client_secret"], cfg["calendar_user"]
        )
        return result
    except M365Error as e:
        raise HTTPException(400, str(e))


# ── Sync individuelle ─────────────────────────────────────────────────────────

@router.post("/sync/{schedule_id}", dependencies=[_admin])
def sync_maintenance(schedule_id: uuid.UUID, db: DbDep):
    """Pousse une maintenance dans le calendrier M365."""
    cfg = _resolve_cfg(db)
    sched: Optional[MaintenanceSchedule] = db.get(MaintenanceSchedule, schedule_id)
    if not sched:
        raise HTTPException(404, "Maintenance introuvable")

    ci = db.get(CI, sched.ci_id)
    ci_name = ci.name if ci else "CI inconnu"
    subject   = f"[CMDB] {sched.title} — {ci_name}"
    body_text = (
        f"Maintenance planifiée via CMDB\n"
        f"CI : {ci_name}\n"
        f"Type : {sched.kind}\n"
        f"Date : {sched.next_due_date}"
    )

    try:
        token = get_token(cfg["tenant_id"], cfg["client_id"], cfg["client_secret"])
        if sched.m365_event_id:
            update_event(token, cfg["calendar_user"], sched.m365_event_id,
                         subject, body_text, str(sched.next_due_date))
            action = "updated"
        else:
            eid = create_event(token, cfg["calendar_user"], subject, body_text,
                               str(sched.next_due_date))
            sched.m365_event_id = eid
            db.commit()
            action = "created"
        return {"ok": True, "action": action, "event_id": sched.m365_event_id}
    except M365Error as e:
        raise HTTPException(400, str(e))


@router.delete("/sync/{schedule_id}", dependencies=[_admin], status_code=204)
def unsync_maintenance(schedule_id: uuid.UUID, db: DbDep):
    """Supprime un événement M365 et efface le lien."""
    cfg = _resolve_cfg(db)
    sched: Optional[MaintenanceSchedule] = db.get(MaintenanceSchedule, schedule_id)
    if not sched:
        raise HTTPException(404, "Maintenance introuvable")
    if not sched.m365_event_id:
        return

    try:
        token = get_token(cfg["tenant_id"], cfg["client_id"], cfg["client_secret"])
        delete_event(token, cfg["calendar_user"], sched.m365_event_id)
    except M365Error:
        pass  # On efface le lien même si l'événement a déjà disparu

    sched.m365_event_id = None
    db.commit()


# ── Sync globale ──────────────────────────────────────────────────────────────

@router.post("/sync-all", dependencies=[_admin])
def sync_all_maintenances(db: DbDep):
    """Synchronise toutes les maintenances actives vers M365."""
    cfg = _resolve_cfg(db)
    schedules = db.query(MaintenanceSchedule).filter(
        MaintenanceSchedule.is_active == True  # noqa: E712
    ).all()

    try:
        token = get_token(cfg["tenant_id"], cfg["client_id"], cfg["client_secret"])
    except M365Error as e:
        raise HTTPException(400, str(e))

    created = updated = errors = 0
    for sched in schedules:
        ci      = db.get(CI, sched.ci_id)
        ci_name = ci.name if ci else "CI inconnu"
        subject = f"[CMDB] {sched.title} — {ci_name}"
        body    = (
            f"Maintenance planifiée via CMDB\n"
            f"CI : {ci_name}\nType : {sched.kind}\nDate : {sched.next_due_date}"
        )
        try:
            if sched.m365_event_id:
                update_event(token, cfg["calendar_user"], sched.m365_event_id,
                             subject, body, str(sched.next_due_date))
                updated += 1
            else:
                eid = create_event(token, cfg["calendar_user"], subject, body,
                                   str(sched.next_due_date))
                sched.m365_event_id = eid
                created += 1
        except M365Error:
            errors += 1

    db.commit()
    return {"ok": True, "created": created, "updated": updated, "errors": errors}


# ── Liste des maintenances avec statut sync ───────────────────────────────────

@router.get("/maintenances", dependencies=[_admin])
def list_maintenances_sync_status(db: DbDep):
    """Retourne toutes les maintenances actives avec leur statut de sync M365."""
    schedules = (
        db.query(MaintenanceSchedule)
        .filter(MaintenanceSchedule.is_active == True)  # noqa: E712
        .order_by(MaintenanceSchedule.next_due_date)
        .all()
    )
    result = []
    for s in schedules:
        ci = db.get(CI, s.ci_id)
        result.append({
            "id":           str(s.id),
            "title":        s.title,
            "kind":         s.kind,
            "ci_name":      ci.name if ci else "?",
            "next_due_date": str(s.next_due_date),
            "m365_event_id": s.m365_event_id,
            "synced":       bool(s.m365_event_id),
        })
    return result
