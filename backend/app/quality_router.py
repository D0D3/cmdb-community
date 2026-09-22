"""Dashboard qualité des données CMDB (US-405)."""
from __future__ import annotations

from typing import Annotated
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.cmdb.models import CI, HardwareDetail, SoftwareDetail

quality_router = APIRouter(prefix="/api/quality", tags=["quality"])
DbDep = Annotated[Session, Depends(get_db)]
_read = require_role("admin", "it-infra", "it-application", "viewer")

# CIs retirés exclus des checks (status != 'retired')
ACTIVE = CI.status != "retired"


# ── Schémas ───────────────────────────────────────────────────────────────────

class CiRef(BaseModel):
    id:      str
    name:    str
    ci_type: str


class QualityIssue(BaseModel):
    key:      str
    label:    str
    detail:   str
    severity: str   # "high" | "medium" | "low"
    count:    int
    total:    int   # total CIs concernés par ce check
    pct:      int   # pourcentage problématique
    cis:      list[CiRef]   # max 8 exemples


class QualitySummary(BaseModel):
    score:    int
    total_ci: int
    issues:   list[QualityIssue]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ci_refs(rows) -> list[CiRef]:
    return [CiRef(id=str(r.id), name=r.name, ci_type=r.ci_type) for r in rows[:8]]


def _pct(count: int, total: int) -> int:
    return round(count / total * 100) if total else 0


def _issue(
    key: str, label: str, detail: str, severity: str,
    count: int, total: int, rows,
) -> QualityIssue:
    return QualityIssue(
        key=key, label=label, detail=detail, severity=severity,
        count=count, total=total,
        pct=_pct(count, total),
        cis=_ci_refs(rows),
    )


# ── Checks ────────────────────────────────────────────────────────────────────

def _check_hw_no_warranty(db: Session) -> QualityIssue:
    base = db.query(CI).join(HardwareDetail, CI.id == HardwareDetail.ci_id).filter(ACTIVE)
    total = base.count()
    rows  = base.filter(HardwareDetail.warranty_end_date.is_(None)).limit(8).all()
    return _issue(
        "hw_no_warranty",
        "Matériel sans date de fin de garantie",
        "Impossible de générer des alertes d'échéance sans cette date.",
        "high", len(rows), total, rows,
    )


def _check_hw_no_serial(db: Session) -> QualityIssue:
    base  = db.query(CI).join(HardwareDetail, CI.id == HardwareDetail.ci_id).filter(ACTIVE)
    total = base.count()
    rows  = base.filter(
        HardwareDetail.serial_number.is_(None) | (HardwareDetail.serial_number == "")
    ).limit(8).all()
    return _issue(
        "hw_no_serial",
        "Matériel sans numéro de série",
        "Le numéro de série est indispensable pour l'identification physique et la déduplication.",
        "medium", len(rows), total, rows,
    )


def _check_hw_no_location(db: Session) -> QualityIssue:
    base  = db.query(CI).join(HardwareDetail, CI.id == HardwareDetail.ci_id).filter(ACTIVE)
    total = base.count()
    rows  = base.filter(CI.location.is_(None) | (CI.location == "")).limit(8).all()
    return _issue(
        "hw_no_location",
        "Matériel sans localisation",
        "Impossible de retrouver physiquement l'équipement sans cette information.",
        "low", len(rows), total, rows,
    )


def _check_sw_no_cpe(db: Session) -> QualityIssue:
    base  = (
        db.query(CI)
        .join(SoftwareDetail, CI.id == SoftwareDetail.ci_id)
        .filter(ACTIVE, SoftwareDetail.is_internal.is_(False))
    )
    total = base.count()
    rows  = base.filter(
        SoftwareDetail.cpe_name.is_(None) | (SoftwareDetail.cpe_name == "")
    ).limit(8).all()
    return _issue(
        "sw_no_cpe",
        "Logiciels commerciaux sans identifiant CPE",
        "Sans CPE, aucune CVE ne peut être matchée automatiquement sur ce logiciel.",
        "high", len(rows), total, rows,
    )


def _check_sw_no_eol(db: Session) -> QualityIssue:
    base  = (
        db.query(CI)
        .join(SoftwareDetail, CI.id == SoftwareDetail.ci_id)
        .filter(ACTIVE, SoftwareDetail.is_internal.is_(False))
    )
    total = base.count()
    rows  = base.filter(SoftwareDetail.eol_date.is_(None)).limit(8).all()
    return _issue(
        "sw_no_eol",
        "Logiciels commerciaux sans date de fin de support (EOL)",
        "Sans EOL, les alertes de fin de vie ne peuvent pas être générées.",
        "medium", len(rows), total, rows,
    )


def _check_sw_no_version(db: Session) -> QualityIssue:
    base  = (
        db.query(CI)
        .join(SoftwareDetail, CI.id == SoftwareDetail.ci_id)
        .filter(ACTIVE, SoftwareDetail.is_internal.is_(False))
    )
    total = base.count()
    rows  = base.filter(
        SoftwareDetail.version.is_(None) | (SoftwareDetail.version == "")
    ).limit(8).all()
    return _issue(
        "sw_no_version",
        "Logiciels commerciaux sans version renseignée",
        "La version est nécessaire pour le matching CVE et le suivi de mise à jour.",
        "high", len(rows), total, rows,
    )


def _check_ci_no_owner(db: Session) -> QualityIssue:
    base  = db.query(CI).filter(ACTIVE)
    total = base.count()
    rows  = base.filter(CI.owner_id.is_(None)).limit(8).all()
    return _issue(
        "ci_no_owner",
        "CIs sans propriétaire assigné",
        "Un CI sans propriétaire est un actif orphelin : personne ne reçoit ses alertes.",
        "medium", len(rows), total, rows,
    )


def _check_ci_no_description(db: Session) -> QualityIssue:
    base  = db.query(CI).filter(ACTIVE)
    total = base.count()
    rows  = base.filter(
        CI.description.is_(None) | (CI.description == "")
    ).limit(8).all()
    return _issue(
        "ci_no_description",
        "CIs sans description",
        "Une description facilite la recherche et la compréhension du rôle de l'actif.",
        "low", len(rows), total, rows,
    )


def _check_hw_duplicate_serial(db: Session) -> QualityIssue:
    """Numéros de série qui apparaissent sur plusieurs CI actifs."""
    dupes_sq = (
        db.query(HardwareDetail.serial_number)
        .join(CI, CI.id == HardwareDetail.ci_id)
        .filter(
            ACTIVE,
            HardwareDetail.serial_number.isnot(None),
            HardwareDetail.serial_number != "",
        )
        .group_by(HardwareDetail.serial_number)
        .having(func.count(HardwareDetail.ci_id) > 1)
        .subquery()
    )

    rows = (
        db.query(CI)
        .join(HardwareDetail, CI.id == HardwareDetail.ci_id)
        .filter(ACTIVE, HardwareDetail.serial_number.in_(db.query(dupes_sq)))
        .limit(8)
        .all()
    )

    hw_total = (
        db.query(func.count(CI.id))
        .join(HardwareDetail, CI.id == HardwareDetail.ci_id)
        .filter(ACTIVE)
        .scalar() or 0
    )

    return _issue(
        "hw_duplicate_serial",
        "Numéros de série en doublon",
        "Plusieurs équipements partagent le même serial — saisie erronée ou import dupliqué.",
        "high", len(rows), hw_total, rows,
    )


# ── Score global ──────────────────────────────────────────────────────────────

# (poids, max_pénalité_en_pts)  — somme des max = 100
WEIGHTS: dict[str, tuple[float, int]] = {
    "hw_no_warranty":       (0.20, 20),
    "sw_no_cpe":            (0.20, 20),
    "sw_no_version":        (0.15, 15),
    "sw_no_eol":            (0.10, 10),
    "ci_no_owner":          (0.10, 10),
    "hw_no_serial":         (0.10, 10),
    "hw_duplicate_serial":  (0.08,  8),
    "hw_no_location":       (0.04,  4),
    "ci_no_description":    (0.03,  3),
}


def _compute_score(issues: list[QualityIssue]) -> int:
    penalty = 0.0
    for iss in issues:
        w, max_p = WEIGHTS.get(iss.key, (0, 0))
        if iss.total > 0:
            penalty += (iss.count / iss.total) * max_p
    return max(0, round(100 - penalty))


# ── Route ─────────────────────────────────────────────────────────────────────

@quality_router.get("/summary", response_model=QualitySummary, dependencies=[_read])
def quality_summary(db: DbDep):
    total_ci = db.query(func.count(CI.id)).filter(ACTIVE).scalar() or 0

    issues = [
        _check_hw_no_warranty(db),
        _check_sw_no_cpe(db),
        _check_sw_no_version(db),
        _check_sw_no_eol(db),
        _check_ci_no_owner(db),
        _check_hw_no_serial(db),
        _check_hw_duplicate_serial(db),
        _check_hw_no_location(db),
        _check_ci_no_description(db),
    ]

    return QualitySummary(
        score=_compute_score(issues),
        total_ci=total_ci,
        issues=issues,
    )
