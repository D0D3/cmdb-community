"""
Router connecteurs (/api/admin/connectors/…).
CRUD connecteurs, test de connexion, déclenchement sync manuelle, logs de sync.
Lors d'un PATCH, les champs contenant "***" ne sont pas réécrits (préservation secrets).
"""
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role, require_perm
from app.connectors.models import Connector, ConnectorSyncLog
from app.connectors.schemas import ConnectorCreate, ConnectorUpdate, ConnectorOut, SyncLogOut, TestResult
from app.connectors.crypto import encrypt_config, decrypt_config, mask_config
from app.connectors.testers import test_connection

connectors_router = APIRouter(prefix="/api/connectors", tags=["Connecteurs"])

DbDep   = Annotated[Session, Depends(get_db)]
_admin  = require_role("admin")
_read   = require_perm("connectors", "read")


def _out(c: Connector) -> ConnectorOut:
    cfg = decrypt_config(c.config_encrypted) if c.config_encrypted else {}
    out = ConnectorOut.model_validate(c)
    out.config = mask_config(cfg)
    return out


# ── CRUD ──────────────────────────────────────────────────────────────────────

@connectors_router.get("/", response_model=list[ConnectorOut], dependencies=[_read])
def list_connectors(db: DbDep):
    rows = db.scalars(select(Connector).order_by(Connector.connector_type, Connector.name)).all()
    return [_out(c) for c in rows]


@connectors_router.post("/", response_model=ConnectorOut, status_code=status.HTTP_201_CREATED,
                         dependencies=[_admin])
def create_connector(data: ConnectorCreate, db: DbDep):
    existing = db.scalar(select(Connector).where(Connector.name == data.name))
    if existing:
        raise HTTPException(400, detail="Un connecteur avec ce nom existe déjà")
    c = Connector(
        name=data.name,
        connector_type=data.connector_type,
        enabled=data.enabled,
        config_encrypted=encrypt_config(data.config) if data.config else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _out(c)


@connectors_router.get("/{connector_id}", response_model=ConnectorOut, dependencies=[_read])
def get_connector(connector_id: uuid.UUID, db: DbDep):
    c = db.get(Connector, connector_id)
    if not c:
        raise HTTPException(404, detail="Connecteur introuvable")
    return _out(c)


@connectors_router.patch("/{connector_id}", response_model=ConnectorOut, dependencies=[_admin])
def update_connector(connector_id: uuid.UUID, data: ConnectorUpdate, db: DbDep):
    c = db.get(Connector, connector_id)
    if not c:
        raise HTTPException(404, detail="Connecteur introuvable")
    if data.name is not None:
        c.name = data.name
    if data.enabled is not None:
        c.enabled = data.enabled
    if data.config is not None:
        existing_cfg = decrypt_config(c.config_encrypted) if c.config_encrypted else {}
        merged = {**existing_cfg, **{k: v for k, v in data.config.items() if v != "***"}}
        c.config_encrypted = encrypt_config(merged)
    if data.sync_interval_hours is not None:
        c.sync_interval_hours = data.sync_interval_hours
    db.commit()
    db.refresh(c)
    return _out(c)


@connectors_router.delete("/{connector_id}", status_code=status.HTTP_204_NO_CONTENT,
                           dependencies=[_admin])
def delete_connector(connector_id: uuid.UUID, db: DbDep):
    c = db.get(Connector, connector_id)
    if not c:
        raise HTTPException(404, detail="Connecteur introuvable")
    db.delete(c)
    db.commit()


# ── Test de connexion ─────────────────────────────────────────────────────────

@connectors_router.post("/{connector_id}/test", response_model=TestResult, dependencies=[_admin])
def test_connector(connector_id: uuid.UUID, db: DbDep):
    c = db.get(Connector, connector_id)
    if not c:
        raise HTTPException(404, detail="Connecteur introuvable")
    cfg = decrypt_config(c.config_encrypted) if c.config_encrypted else {}
    ok, msg = test_connection(c.connector_type, cfg)
    c.last_test_at = datetime.now(timezone.utc)
    c.last_test_ok = ok
    c.last_test_message = msg[:500]
    db.commit()
    return TestResult(ok=ok, message=msg)


# ── Historique des syncs ──────────────────────────────────────────────────────

@connectors_router.get("/{connector_id}/history",
                        response_model=list[SyncLogOut],
                        dependencies=[_read])
def connector_history(
    connector_id: uuid.UUID,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    logs = db.scalars(
        select(ConnectorSyncLog)
        .where(ConnectorSyncLog.connector_id == connector_id)
        .order_by(ConnectorSyncLog.started_at.desc())
        .limit(limit)
    ).all()
    return logs


# ── Synchronisation ───────────────────────────────────────────────────────────

@connectors_router.post("/{connector_id}/sync", dependencies=[_admin])
def sync_connector(connector_id: uuid.UUID, db: DbDep):
    c = db.get(Connector, connector_id)
    if not c:
        raise HTTPException(404, detail="Connecteur introuvable")
    if not c.enabled:
        raise HTTPException(400, detail="Connecteur désactivé")

    cfg = decrypt_config(c.config_encrypted) if c.config_encrypted else {}

    if c.connector_type == "glpi":
        return _sync_glpi(c, cfg, db)
    if c.connector_type == "entra":
        return _sync_generic(c, db, _do_entra)
    if c.connector_type == "intune":
        return _sync_generic(c, db, _do_intune)
    if c.connector_type == "ldap":
        return _sync_generic(c, db, _do_ldap)
    if c.connector_type == "ssh":
        return _sync_generic(c, db, _do_ssh)
    raise HTTPException(501, detail=f"Sync non implémentée pour « {c.connector_type} »")


def _sync_glpi(c: Connector, cfg: dict, db: Session):
    from app.glpi.client import GLPIClient
    from app.glpi.sync import run_sync

    client = GLPIClient(
        base_url=cfg.get("url", ""),
        app_token=cfg.get("app_token", ""),
        user_token=cfg.get("user_token") or None,
        username=cfg.get("username") or None,
        password=cfg.get("password") or None,
    )
    with client:
        result = run_sync(db, client)

    c.last_sync_at = datetime.now(timezone.utc)
    c.last_sync_result = result
    db.commit()
    return result


def _sync_generic(c: Connector, db: Session, fn, triggered_by: str = "manual"):
    """Wrapper commun : appelle fn(c, db), persiste last_sync_* + log, renvoie le résultat."""
    started = datetime.now(timezone.utc)
    log = ConnectorSyncLog(
        connector_id=c.id,
        started_at=started,
        status="running",
        triggered_by=triggered_by,
    )
    db.add(log)
    db.flush()

    try:
        result = fn(c, db)
        status = "error" if "error" in result else "ok"
        error_msg = result.get("error") if "error" in result else None
    except Exception as exc:
        result = {"error": str(exc)}
        status = "error"
        error_msg = str(exc)

    finished = datetime.now(timezone.utc)
    log.finished_at = finished
    log.status = status
    log.result = result
    log.error = error_msg

    c.last_sync_at = finished
    c.last_sync_result = result

    # Notification en cas d'erreur
    if status == "error":
        try:
            from app.notifications.service import trigger
            from app.core.config import get_settings
            _domain = getattr(get_settings(), "domain", "")
            trigger(db, "connector_sync_error", domain=_domain,
                    connector_name=c.name,
                    connector_type=c.connector_type,
                    error=error_msg or "")
        except Exception:
            pass

    # Garder seulement les 50 derniers logs pour ce connecteur
    old_logs = db.scalars(
        select(ConnectorSyncLog)
        .where(ConnectorSyncLog.connector_id == c.id)
        .order_by(ConnectorSyncLog.started_at.desc())
        .offset(50)
    ).all()
    for old in old_logs:
        db.delete(old)

    db.commit()
    return result


def _do_entra(c: Connector, db: Session) -> dict:
    from app.connectors.sync_entra import sync_entra_users
    return sync_entra_users(c, db)


def _do_intune(c: Connector, db: Session) -> dict:
    from app.connectors.sync_intune import sync_intune_devices
    return sync_intune_devices(c, db)


def _do_ldap(c: Connector, db: Session) -> dict:
    from app.connectors.sync_ldap import sync_ldap_users
    return sync_ldap_users(c, db)


def _do_ssh(c: Connector, db: Session) -> dict:
    from app.connectors.sync_ssh import sync_ssh_host
    return sync_ssh_host(c, db)


# ── Recherche & import unitaire depuis un annuaire ────────────────────────────

class DirectoryUserOut(BaseModel):
    external_id:    str
    email:          str
    full_name:      str
    already_exists: bool


class DirectoryImportRequest(BaseModel):
    external_ids: list[str]
    role_slug:    str


@connectors_router.get(
    "/{connector_id}/directory/search",
    response_model=list[DirectoryUserOut],
    dependencies=[_admin],
)
def directory_search(connector_id: uuid.UUID, q: str, db: DbDep):
    c = db.get(Connector, connector_id)
    if not c:
        raise HTTPException(404, detail="Connecteur introuvable")
    if c.connector_type not in ("entra", "ldap"):
        raise HTTPException(400, detail="Seuls les connecteurs entra et ldap supportent la recherche annuaire")
    if not q or len(q.strip()) < 2:
        raise HTTPException(422, detail="Minimum 2 caractères requis")
    try:
        if c.connector_type == "entra":
            from app.connectors.sync_entra import search_entra_users
            return search_entra_users(c, q.strip(), db)
        from app.connectors.sync_ldap import search_ldap_users
        return search_ldap_users(c, q.strip(), db)
    except Exception as exc:
        raise HTTPException(502, detail=str(exc))


@connectors_router.post(
    "/{connector_id}/directory/import",
    dependencies=[_admin],
)
def directory_import(connector_id: uuid.UUID, body: DirectoryImportRequest, db: DbDep):
    c = db.get(Connector, connector_id)
    if not c:
        raise HTTPException(404, detail="Connecteur introuvable")
    if c.connector_type not in ("entra", "ldap"):
        raise HTTPException(400, detail="Seuls les connecteurs entra et ldap supportent l'import unitaire")

    from app.auth.models import Role
    role = db.scalar(select(Role).where(Role.slug == body.role_slug))
    if not role:
        raise HTTPException(404, detail=f"Rôle '{body.role_slug}' introuvable")

    imported = updated = errors = 0
    for ext_id in body.external_ids:
        try:
            if c.connector_type == "entra":
                from app.connectors.sync_entra import import_entra_user
                res = import_entra_user(c, ext_id, db)
            else:
                from app.connectors.sync_ldap import import_ldap_user
                res = import_ldap_user(c, ext_id, db)

            user = res["user"]
            if role not in user.roles:
                user.roles.append(role)

            if res["created"]:
                imported += 1
            else:
                updated += 1
        except Exception:
            errors += 1

    db.commit()
    return {"imported": imported, "updated": updated, "errors": errors}
