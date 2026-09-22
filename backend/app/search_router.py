"""Recherche globale transversale — CIs, incidents, RFC, CVEs."""
from __future__ import annotations

from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role

search_global_router = APIRouter(prefix="/api/search", tags=["search"])
DbDep  = Annotated[Session, Depends(get_db)]
_read  = require_role("admin", "it-infra", "it-application", "viewer")

PER_TYPE = 5  # résultats max par catégorie


# ── Schémas ───────────────────────────────────────────────────────────────────

class SearchResult(BaseModel):
    type:     str   # "ci" | "incident" | "change" | "cve"
    id:       str
    title:    str
    subtitle: str
    url:      str


class SearchResponse(BaseModel):
    query:   str
    total:   int
    results: list[SearchResult]


# ── Helpers ───────────────────────────────────────────────────────────────────

STATUS_LABELS: dict[str, str] = {
    "open":              "Ouvert",
    "investigating":     "En investigation",
    "resolved":          "Résolu",
    "closed":            "Fermé",
    "pending_approval":  "En attente",
    "approved":          "Approuvée",
    "in_progress":       "En cours",
    "implemented":       "Implémentée",
    "rejected":          "Rejetée",
    "cancelled":         "Annulée",
    "in_service":        "En service",
    "in_stock":          "En stock",
    "maintenance":       "Maintenance",
    "retired":           "Retiré",
    "ordered":           "Commandé",
}
SEV_LABELS: dict[str, str] = {
    "low": "Faible", "medium": "Moyen", "high": "Haute", "critical": "Critique",
}
TYPE_LABELS: dict[str, str] = {"hardware": "Matériel", "software": "Logiciel"}


def _ci_results(db: Session, q: str) -> list[SearchResult]:
    from app.cmdb.models import CI, HardwareDetail

    pat = f"%{q}%"
    rows = (
        db.query(CI)
        .outerjoin(HardwareDetail, CI.id == HardwareDetail.ci_id)
        .filter(
            or_(
                CI.name.ilike(pat),
                CI.description.ilike(pat),
                HardwareDetail.serial_number.ilike(pat),
                HardwareDetail.hostname.ilike(pat),
            )
        )
        .limit(PER_TYPE)
        .all()
    )
    return [
        SearchResult(
            type="ci",
            id=str(r.id),
            title=r.name,
            subtitle=f"{TYPE_LABELS.get(r.ci_type, r.ci_type)} · {STATUS_LABELS.get(r.status, r.status)}",
            url=f"/ci/{r.id}",
        )
        for r in rows
    ]


def _incident_results(db: Session, q: str) -> list[SearchResult]:
    from app.incidents.models import Incident

    pat = f"%{q}%"
    rows = (
        db.query(Incident)
        .filter(
            or_(
                Incident.title.ilike(pat),
                Incident.description.ilike(pat),
            )
        )
        .order_by(Incident.created_at.desc())
        .limit(PER_TYPE)
        .all()
    )
    return [
        SearchResult(
            type="incident",
            id=str(r.id),
            title=r.title,
            subtitle=f"{SEV_LABELS.get(r.severity, r.severity)} · {STATUS_LABELS.get(r.status, r.status)}",
            url=f"/incidents/{r.id}",
        )
        for r in rows
    ]


def _change_results(db: Session, q: str) -> list[SearchResult]:
    from app.lifecycle.models import ChangeRequest

    pat = f"%{q}%"
    rows = (
        db.query(ChangeRequest)
        .filter(
            or_(
                ChangeRequest.title.ilike(pat),
                ChangeRequest.description.ilike(pat),
            )
        )
        .order_by(ChangeRequest.created_at.desc())
        .limit(PER_TYPE)
        .all()
    )
    return [
        SearchResult(
            type="change",
            id=str(r.id),
            title=r.title,
            subtitle=f"RFC · {STATUS_LABELS.get(r.status, r.status)}",
            url=f"/changes/{r.id}",
        )
        for r in rows
    ]


def _cve_results(db: Session, q: str) -> list[SearchResult]:
    from app.cmdb.models import Cve

    pat = f"%{q}%"
    rows = (
        db.query(Cve)
        .filter(
            or_(
                Cve.cve_id.ilike(pat),
                Cve.title.ilike(pat),
            )
        )
        .order_by(Cve.published_at.desc())
        .limit(PER_TYPE)
        .all()
    )
    return [
        SearchResult(
            type="cve",
            id=str(r.id),
            title=r.cve_id,
            subtitle=r.title[:80] if r.title else (r.cvss_severity or ""),
            url=f"/vulnerabilities",
        )
        for r in rows
    ]


# ── Route ─────────────────────────────────────────────────────────────────────

@search_global_router.get("", response_model=SearchResponse, dependencies=[_read])
def global_search(
    db:   DbDep,
    q:    str = Query(..., min_length=2, max_length=200),
):
    q = q.strip()
    results: list[SearchResult] = []
    results.extend(_ci_results(db, q))
    results.extend(_incident_results(db, q))
    results.extend(_change_results(db, q))
    results.extend(_cve_results(db, q))
    return SearchResponse(query=q, total=len(results), results=results)
