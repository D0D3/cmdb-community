"""
Router CVE (/api/cve/…).
  /stats          : compteurs par sévérité, KEV, open.
  /sources        : état des sources de données (NVD + CISA KEV).
  /               : liste paginée avec filtres sévérité/KEV/CI/recherche texte.
  /{cve_id}       : détail + liste des CIs affectés et leur statut.
  /ci/{ci_id}     : mise à jour du statut open→acknowledged→mitigated→not_affected.
  /ingest         : déclenche sync_nvd_cisa via Celery en arrière-plan.
  /ingest/status  : état courant de l'ingestion (depuis Redis).
"""
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role, require_perm
from app.cmdb.models import CI, Cve, CICve
from app.cve.schemas import (
    CveOut, CveDetail, CveList, CveStats, CICveOut, CICveStatusUpdate
)

cve_router = APIRouter(prefix="/api/cve", tags=["CVE"])

DbDep = Annotated[Session, Depends(get_db)]
_read  = require_perm("cve", "read")
_write = require_perm("cve", "write")
_admin = require_role("admin")


# ── Sources ───────────────────────────────────────────────────────────────────

@cve_router.get("/sources", dependencies=[_read])
def get_sources(db: DbDep):
    from app.core.config import get_settings as _cfg
    from app.core.ingest_status import get_ingest_status
    s = _cfg()

    total_cves = db.scalar(select(func.count()).select_from(Cve)) or 0
    total_kev  = db.scalar(select(func.count()).select_from(Cve).where(Cve.is_kev.is_(True))) or 0

    return {
        "nvd": {
            "name":        "NVD — National Vulnerability Database",
            "provider":    "NIST",
            "url":         "https://nvd.nist.gov",
            "api_url":     "https://services.nvd.nist.gov/rest/json/cves/2.0",
            "has_api_key": bool(s.nvd_api_key),
            "rate_limit":  "50 req / 30 s" if s.nvd_api_key else "5 req / 30 s",
            "total_cves":  total_cves,
            "note":        "Indexation CVE pouvant dépasser 7 jours après publication GHSA",
        },
        "cisa_kev": {
            "name":     "CISA KEV — Known Exploited Vulnerabilities",
            "provider": "CISA",
            "url":      "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
            "feed_url": "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
            "total_kev": total_kev,
        },
        "osv": {
            "name":     "OSV — Open Source Vulnerabilities",
            "provider": "Google",
            "url":      "https://osv.dev",
            "api_url":  "https://api.osv.dev/v1/query",
            "note":     "Source réactive : indexe les GHSA en quelques heures. Activé par CI via osv_ecosystem + osv_package.",
        },
        "last_sync": get_ingest_status(),
    }


# ── Stats ─────────────────────────────────────────────────────────────────────

@cve_router.get("/stats", response_model=CveStats, dependencies=[_read])
def get_stats(db: DbDep):
    def _count(severity=None, is_kev=None):
        q = select(func.count()).select_from(Cve)
        if severity:
            q = q.where(Cve.cvss_severity == severity)
        if is_kev is not None:
            q = q.where(Cve.is_kev == is_kev)
        return db.scalar(q) or 0

    open_count = db.scalar(
        select(func.count()).select_from(CICve).where(CICve.status == "open")
    ) or 0

    return CveStats(
        total=_count(),
        critical=_count("CRITICAL"),
        high=_count("HIGH"),
        medium=_count("MEDIUM"),
        low=_count("LOW"),
        kev_count=_count(is_kev=True),
        open_count=open_count,
    )


# ── Liste CVE ─────────────────────────────────────────────────────────────────

@cve_router.get("/", response_model=CveList, dependencies=[_read])
def list_cves(
    db: DbDep,
    severity: Optional[str] = Query(None),
    is_kev: Optional[bool] = Query(None),
    ci_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    q = select(Cve)

    if severity:
        q = q.where(Cve.cvss_severity == severity.upper())
    if is_kev is not None:
        q = q.where(Cve.is_kev == is_kev)
    if search:
        q = q.where(Cve.id.ilike(f"%{search}%") | Cve.summary.ilike(f"%{search}%"))
    if ci_id:
        q = q.join(CICve, Cve.id == CICve.cve_id).where(CICve.ci_id == ci_id)

    q = q.order_by(Cve.cvss_score.desc().nullslast(), Cve.published_at.desc())

    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.offset(skip).limit(limit)).all()

    items = []
    for cve in rows:
        affected = db.scalar(
            select(func.count()).select_from(CICve).where(CICve.cve_id == cve.id)
        ) or 0
        out = CveOut.model_validate(cve)
        out.affected_count = affected
        items.append(out)

    return CveList(total=total or 0, items=items)


# ── Détail CVE ────────────────────────────────────────────────────────────────

@cve_router.get("/{cve_id}", response_model=CveDetail, dependencies=[_read])
def get_cve(cve_id: str, db: DbDep):
    cve = db.get(Cve, cve_id)
    if not cve:
        raise HTTPException(status_code=404, detail="CVE introuvable")

    links = db.scalars(
        select(CICve).where(CICve.cve_id == cve_id)
    ).all()

    affected_cis = []
    for link in links:
        ci = db.get(CI, link.ci_id)
        if ci:
            affected_cis.append(CICveOut(
                ci_id=ci.id,
                ci_name=ci.name,
                ci_type=ci.ci_type,
                cve_id=cve_id,
                matched_at=link.matched_at,
                status=link.status,
            ))

    affected_count = len(affected_cis)
    detail = CveDetail.model_validate(cve)
    detail.affected_count = affected_count
    detail.affected_cis = affected_cis
    return detail


# ── Mise à jour statut CICve ──────────────────────────────────────────────────

@cve_router.patch("/{cve_id}/ci/{ci_id}", response_model=CICveOut, dependencies=[_write])
def update_ci_cve_status(cve_id: str, ci_id: uuid.UUID, body: CICveStatusUpdate, db: DbDep):
    valid = {"open", "acknowledged", "mitigated", "not_affected"}
    if body.status not in valid:
        raise HTTPException(400, detail=f"Statut invalide. Valeurs : {', '.join(valid)}")

    link = db.get(CICve, (ci_id, cve_id))
    if not link:
        raise HTTPException(404, detail="Lien CI-CVE introuvable")

    ci = db.get(CI, ci_id)
    link.status = body.status
    db.commit()

    return CICveOut(
        ci_id=ci_id,
        ci_name=ci.name if ci else str(ci_id),
        ci_type=ci.ci_type if ci else "",
        cve_id=cve_id,
        matched_at=link.matched_at,
        status=link.status,
    )


# ── Déclenchement & statut de l'ingestion ────────────────────────────────────

@cve_router.get("/ingest/status", dependencies=[_read])
def get_ingest_status():
    from app.core.ingest_status import get_ingest_status as _get
    return _get()


@cve_router.post("/ingest", status_code=status.HTTP_202_ACCEPTED, dependencies=[_admin])
def trigger_ingest():
    from app.workers.tasks.cve_sync import sync_nvd_cisa
    sync_nvd_cisa.delay()
    return {"detail": "Ingestion CVE déclenchée en arrière-plan"}
