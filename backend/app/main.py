"""
Point d'entrée FastAPI de la CMDB.
  on_startup : migrations Alembic, seed des rôles/admin, correction des runs bloqués.
  Routers    : tous les modules sont enregistrés ici (ci, auth, backup, branding, …).
  SPA catch-all : toutes les routes non-API servent index.html (React Router).
"""
import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.core.database import SessionLocal, engine, Base

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

settings = get_settings()

_is_dev = settings.environment != "prod"
app = FastAPI(
    title="CMDB API",
    version=settings.version,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"https://{settings.domain}"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if not _is_dev:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: blob: https://fastapi.tiangolo.com https://images.unsplash.com; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
    return response


@app.on_event("startup")
def on_startup():
    _migrate()
    from app.core.startup import run_startup
    with SessionLocal() as db:
        run_startup(db)
        _fix_stale_backup_runs(db)


def _fix_stale_backup_runs(db) -> None:
    """Marque en erreur les runs 'running' laissés par un arrêt/restore inattendu."""
    from datetime import datetime, timezone
    try:
        from app.backup.models import BackupRun
        stale = db.query(BackupRun).filter(BackupRun.status == "running").all()
        if stale:
            now = datetime.now(timezone.utc)
            for r in stale:
                r.status = "error"
                r.error_msg = "Interrompu (redémarrage ou restauration)"
                r.finished_at = now
            db.commit()
            logger.info("_fix_stale_backup_runs: %d run(s) corrigé(s)", len(stale))
    except Exception as exc:
        logger.warning("_fix_stale_backup_runs: %s", exc)


def _migrate():
    """Applique les migrations Alembic.
    Sur une DB fraîche (pas de tables), crée le schéma via create_all
    puis stamp, pour que les futures migrations soient incrémentales.
    """
    from sqlalchemy import inspect
    from alembic.config import Config
    from alembic import command

    import app.auth.models        # noqa — enregistre les modèles sur Base.metadata
    import app.cmdb.models        # noqa
    import app.network.models      # noqa
    import app.monitoring.models   # noqa
    import app.alerts.models      # noqa
    import app.connectors.models  # noqa
    import app.agent.models       # noqa
    import app.keyusers.models    # noqa
    import app.audit.models       # noqa
    import app.lifecycle.models   # noqa
    import app.incidents.models     # noqa
    import app.notifications.models # noqa
    import app.reports.models       # noqa
    import app.branding.models      # noqa
    import app.settings.models      # noqa
    import app.backup.models        # noqa

    inspector = inspect(engine)
    alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    if not inspector.has_table("cis"):
        logger.info("DB vide — création du schéma initial via create_all")
        Base.metadata.create_all(bind=engine)
        # Le schéma est déjà à jour : on stamp head au lieu de rejouer les
        # migrations depuis le début (elles échoueraient sur des tables déjà créées).
        command.stamp(alembic_cfg, "head")
        logger.info("DB stampée à head après create_all")
    else:
        command.upgrade(alembic_cfg, "head")
        logger.info("Migrations Alembic appliquées")


# ── Routers ───────────────────────────────────────────────────────────────────

from app.auth.router import router as auth_router, users_router, tokens_router
from app.cmdb.router import router as ci_router, sla_router, maintenance_router
from app.alerts.router import alerts_router, deadlines_router, feeds_router, webhooks_router
from app.cve.router import cve_router
from app.glpi.router import glpi_router
from app.connectors.router import connectors_router
from app.agent.router import agent_router
from app.keyusers.router import ku_router, search_router
from app.audit.router import audit_router
from app.reports.router import reports_router
from app.lifecycle.router import changes_router
from app.incidents.router import router as incidents_router
from app.notifications.router import notifications_router
from app.kpi_router import kpi_router
from app.search_router import search_global_router
from app.branding.router import branding_router
from app.quality_router import quality_router
from app.settings.router import settings_router, reflist_router, packs_router
from app.admin.permissions_router import router as permissions_router
from app.admin.saml_router import router as saml_admin_router
from app.admin.m365_router import router as m365_router
from app.network.router import router as network_router, ci_net_router
from app.monitoring.router import admin_router as monitoring_admin_router, ingest_router as monitoring_ingest_router
from app.backup.router import router as backup_router

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(tokens_router)
app.include_router(ci_router)
app.include_router(sla_router)
app.include_router(maintenance_router)
app.include_router(alerts_router)
app.include_router(deadlines_router)
app.include_router(feeds_router)
app.include_router(webhooks_router)
app.include_router(cve_router)
app.include_router(glpi_router)
app.include_router(connectors_router)
app.include_router(agent_router)
app.include_router(ku_router)
app.include_router(search_router)
app.include_router(audit_router)
app.include_router(reports_router)
app.include_router(changes_router)
app.include_router(incidents_router)
app.include_router(notifications_router)
app.include_router(kpi_router)
app.include_router(search_global_router)
app.include_router(branding_router)
app.include_router(quality_router)
app.include_router(settings_router)
app.include_router(reflist_router)
app.include_router(packs_router)
app.include_router(permissions_router)
app.include_router(saml_admin_router)
app.include_router(m365_router)
app.include_router(network_router)
app.include_router(ci_net_router)
app.include_router(monitoring_admin_router)
app.include_router(monitoring_ingest_router)
app.include_router(backup_router)


# ── Endpoints système ─────────────────────────────────────────────────────────

@app.get("/api/health", tags=["système"])
def health():
    return {"status": "ok", "version": settings.version, "env": settings.environment}


@app.get("/api/ops/status", tags=["système"])
def ops_status():
    """Tableau de bord opérationnel : services, agents, connecteurs."""
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import text
    from app.agent.models import AgentToken
    from app.connectors.models import Connector

    result: dict = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "services": {},
        "agents": [],
        "connectors": [],
    }

    # ── Services ──────────────────────────────────────────────────────────────
    # DB
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        result["services"]["database"] = {"status": "ok"}
    except Exception as e:
        result["services"]["database"] = {"status": "error", "detail": str(e)}

    # Redis — utilise REDIS_PASSWORD (env var) plutôt que l'URL qui peut être désynchronisée
    def _redis_client(timeout=2):
        import os, redis as redis_lib
        from urllib.parse import urlparse
        p = urlparse(settings.redis_url)
        password = os.environ.get("REDIS_PASSWORD") or p.password or None
        return redis_lib.Redis(
            host=p.hostname or "redis",
            port=p.port or 6379,
            password=password,
            db=int(p.path.lstrip("/") or 0),
            socket_timeout=timeout,
            socket_connect_timeout=timeout,
        )

    try:
        _redis_client().ping()
        result["services"]["redis"] = {"status": "ok"}
    except Exception as e:
        result["services"]["redis"] = {"status": "error", "detail": str(e)[:120]}

    # Celery — ping via control avec le broker corrigé
    try:
        from app.workers.celery_app import celery_app as _celery
        resp = _celery.control.ping(timeout=4)
        result["services"]["celery"] = {"status": "ok" if resp else "unknown"}
    except Exception:
        result["services"]["celery"] = {"status": "unknown"}

    # ── Agents ────────────────────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    threshold_active = now - timedelta(hours=26)   # 1 rapport/jour ± tolérance

    with SessionLocal() as db:
        tokens = db.query(AgentToken).order_by(AgentToken.last_seen_at.desc().nullslast()).all()
        for t in tokens:
            if t.revoked:
                status = "revoked"
            elif t.last_seen_at is None:
                status = "never"
            elif t.last_seen_at >= threshold_active:
                status = "active"
            else:
                status = "inactive"
            result["agents"].append({
                "id": str(t.id),
                "name": t.name,
                "description": t.description,
                "status": status,
                "last_seen_at": t.last_seen_at.isoformat() if t.last_seen_at else None,
                "last_seen_hostname": t.last_seen_hostname,
                "revoked": t.revoked,
            })

        # ── Connecteurs ───────────────────────────────────────────────────────
        connectors = db.query(Connector).order_by(Connector.name).all()
        for c in connectors:
            last_sync = c.last_sync_at
            sync_status = "never"
            if last_sync:
                hours_ago = (now - last_sync).total_seconds() / 3600
                sync_status = "ok" if hours_ago <= 25 else "stale"
            result["connectors"].append({
                "id": str(c.id),
                "name": c.name,
                "connector_type": c.connector_type,
                "enabled": c.enabled,
                "sync_status": sync_status if c.enabled else "disabled",
                "last_sync_at": last_sync.isoformat() if last_sync else None,
                "last_sync_result": c.last_sync_result,
            })

    return result


@app.get("/api/version", tags=["système"])
def version():
    return {"version": settings.version, "plan": "community"}


# ── Front React buildé (statique) ────────────────────────────────────────────

_static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_static_dir):
    _assets_dir = os.path.join(_static_dir, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return FileResponse(
            os.path.join(_static_dir, "index.html"),
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )
