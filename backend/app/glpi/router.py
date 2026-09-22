"""
Router GLPI (/api/glpi/…).
  /status : état de la configuration GLPI + résultat de la dernière sync.
  /ping   : test de connexion à l'API GLPI (initSession/killSession).
  /sync   : déclenche une sync complète (Computer → CI hardware).
  Dernier résultat de sync persisté dans /tmp/glpi_last_sync.json (non-DB, volatil).
"""
import json
import os
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import require_role
from app.cmdb.models import CI

glpi_router = APIRouter(prefix="/api/glpi", tags=["GLPI"])
DbDep = Annotated[Session, Depends(get_db)]
_admin = require_role("admin")

_RESULT_FILE = "/tmp/glpi_last_sync.json"


def _get_settings():
    return get_settings()


def _load_last_result() -> Optional[dict]:
    try:
        with open(_RESULT_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def _save_result(result: dict):
    with open(_RESULT_FILE, "w") as f:
        json.dump(result, f)


class GLPIStatus(BaseModel):
    enabled: bool
    glpi_url: str
    total_synced: int
    last_sync: Optional[dict] = None


class SyncResult(BaseModel):
    total_glpi: int
    created: int
    updated: int
    skipped: int
    errors: int
    duration_s: float
    synced_at: str


# ── Status ────────────────────────────────────────────────────────────────────

@glpi_router.get("/status", response_model=GLPIStatus, dependencies=[_admin])
def glpi_status(db: DbDep):
    settings = _get_settings()
    enabled = bool(settings.glpi_url and settings.glpi_app_token)

    total_synced = 0
    if enabled:
        rows = db.scalars(select(CI).where(CI.ci_type == "hardware")).all()
        total_synced = sum(1 for ci in rows if ci.attributes.get("glpi_id"))

    return GLPIStatus(
        enabled=enabled,
        glpi_url=settings.glpi_url,
        total_synced=total_synced,
        last_sync=_load_last_result(),
    )


# ── Test de connexion ─────────────────────────────────────────────────────────

@glpi_router.post("/ping", dependencies=[_admin])
def glpi_ping():
    settings = _get_settings()
    if not settings.glpi_url or not settings.glpi_app_token:
        raise HTTPException(400, detail="GLPI non configuré (GLPI_URL ou GLPI_APP_TOKEN manquant)")

    from app.glpi.client import GLPIClient
    client = GLPIClient(
        url=settings.glpi_url,
        app_token=settings.glpi_app_token,
        user_token=settings.glpi_user_token,
        username=settings.glpi_username,
        password=settings.glpi_password,
    )
    ok = client.ping()
    if not ok:
        raise HTTPException(502, detail="Impossible de se connecter à GLPI — vérifiez l'URL et les tokens")
    return {"ok": True, "glpi_url": settings.glpi_url}


# ── Déclenchement de la sync ──────────────────────────────────────────────────

@glpi_router.post("/sync", response_model=SyncResult,
                  status_code=status.HTTP_200_OK, dependencies=[_admin])
def glpi_sync(db: DbDep):
    settings = _get_settings()
    if not settings.glpi_url or not settings.glpi_app_token:
        raise HTTPException(400, detail="GLPI non configuré")

    from app.glpi.client import GLPIClient
    from app.glpi.sync import run_sync

    client = GLPIClient(
        url=settings.glpi_url,
        app_token=settings.glpi_app_token,
        user_token=settings.glpi_user_token,
        username=settings.glpi_username,
        password=settings.glpi_password,
    )
    try:
        with client:
            result = run_sync(db, client)
    except PermissionError as exc:
        raise HTTPException(502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(502, detail=f"Erreur GLPI : {exc}")

    _save_result(result)
    return result
