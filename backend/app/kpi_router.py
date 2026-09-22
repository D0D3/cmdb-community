"""Endpoint KPI exécutif — score de santé, CIs à risque, tendance alertes."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta, date as date_cls
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.cmdb.models import CI, CICve, Alert, HardwareDetail, SoftwareDetail
from app.incidents.models import Incident
from app.keyusers.models import CIKeyUser  # noqa: F401 — enregistre le modèle dans le registry SQLAlchemy

kpi_router = APIRouter(prefix="/api/kpi", tags=["kpi"])
DbDep = Annotated[Session, Depends(get_db)]
_read = require_role("admin", "it-infra", "it-application", "viewer")


# ── Schémas ───────────────────────────────────────────────────────────────────

class HealthDetail(BaseModel):
    label: str
    value: int
    penalty: int


class HealthScore(BaseModel):
    score: int
    label: str
    color: str
    details: list[HealthDetail]


class RiskyCi(BaseModel):
    id: str
    name: str
    ci_type: str
    cve_critical: int
    open_incidents: int
    risk_score: int


class AlertTrendPoint(BaseModel):
    date: str   # "YYYY-MM-DD"
    total: int
    critical: int


class KpiSummary(BaseModel):
    health: HealthScore
    top_risky_cis: list[RiskyCi]
    alert_trend: list[AlertTrendPoint]


# ── Logique ───────────────────────────────────────────────────────────────────

def _compute_health(db: Session) -> HealthScore:
    from app.cmdb.models import Cve

    cve_critical = (
        db.query(func.count(CICve.ci_id))
        .join(Cve, CICve.cve_id == Cve.id)
        .filter(Cve.cvss_severity == "CRITICAL")
        .scalar() or 0
    )

    inc_critical = (
        db.query(func.count(Incident.id))
        .filter(Incident.severity == "critical", Incident.status.in_(["open", "investigating"]))
        .scalar() or 0
    )

    alert_critical = (
        db.query(func.count(Alert.id))
        .filter(Alert.severity == "critical", Alert.resolved_at.is_(None))
        .scalar() or 0
    )

    now = datetime.now(timezone.utc)
    from app.cmdb.models import HardwareDetail, SoftwareDetail
    expired_warranties = (
        db.query(func.count(HardwareDetail.ci_id))
        .filter(HardwareDetail.warranty_end_date < now.date())
        .scalar() or 0
    )
    expired_licenses = (
        db.query(func.count(SoftwareDetail.ci_id))
        .filter(SoftwareDetail.license_end_date < now.date())
        .scalar() or 0
    )
    overdue = expired_warranties + expired_licenses

    p_cve  = min(cve_critical * 3, 25)
    p_inc  = min(inc_critical * 5, 25)
    p_al   = min(alert_critical * 2, 25)
    p_dead = min(overdue * 2, 25)

    score = max(0, 100 - p_cve - p_inc - p_al - p_dead)

    if score >= 80:
        label, color = "Bon", "green"
    elif score >= 50:
        label, color = "Attention", "amber"
    else:
        label, color = "Critique", "red"

    details = [
        HealthDetail(label="CVEs critiques",      value=cve_critical,  penalty=p_cve),
        HealthDetail(label="Incidents critiques",  value=inc_critical,  penalty=p_inc),
        HealthDetail(label="Alertes critiques",    value=alert_critical, penalty=p_al),
        HealthDetail(label="Échéances expirées",   value=overdue,       penalty=p_dead),
    ]
    return HealthScore(score=score, label=label, color=color, details=details)


def _top_risky_cis(db: Session, limit: int = 5) -> list[RiskyCi]:
    from app.cmdb.models import Cve

    cve_counts = (
        db.query(CICve.ci_id, func.count(CICve.cve_id).label("n"))
        .join(Cve, CICve.cve_id == Cve.id)
        .filter(Cve.cvss_severity == "CRITICAL")
        .group_by(CICve.ci_id)
        .subquery()
    )

    from app.incidents.models import IncidentCI
    inc_counts = (
        db.query(
            IncidentCI.ci_id,
            func.count(IncidentCI.incident_id).label("n"),
        )
        .join(Incident, IncidentCI.incident_id == Incident.id)
        .filter(Incident.status.in_(["open", "investigating"]))
        .group_by(IncidentCI.ci_id)
        .subquery()
    )

    rows = (
        db.query(
            CI.id,
            CI.name,
            CI.ci_type,
            func.coalesce(cve_counts.c.n, 0).label("cve_n"),
            func.coalesce(inc_counts.c.n, 0).label("inc_n"),
        )
        .outerjoin(cve_counts, CI.id == cve_counts.c.ci_id)
        .outerjoin(inc_counts, CI.id == inc_counts.c.ci_id)
        .filter(
            (func.coalesce(cve_counts.c.n, 0) > 0) |
            (func.coalesce(inc_counts.c.n, 0) > 0)
        )
        .order_by(
            (func.coalesce(cve_counts.c.n, 0) * 3 + func.coalesce(inc_counts.c.n, 0) * 5).desc()
        )
        .limit(limit)
        .all()
    )

    return [
        RiskyCi(
            id=str(r.id),
            name=r.name,
            ci_type=r.ci_type,
            cve_critical=r.cve_n,
            open_incidents=r.inc_n,
            risk_score=r.cve_n * 3 + r.inc_n * 5,
        )
        for r in rows
    ]


def _alert_trend(db: Session, days: int = 30) -> list[AlertTrendPoint]:
    since = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (
        db.query(
            func.date(Alert.created_at).label("day"),
            func.count(Alert.id).label("total"),
        )
        .filter(Alert.created_at >= since)
        .group_by(func.date(Alert.created_at))
        .order_by(func.date(Alert.created_at))
        .all()
    )

    # count critical separately (simpler than CASE in ORM)
    crit_rows = (
        db.query(
            func.date(Alert.created_at).label("day"),
            func.count(Alert.id).label("n"),
        )
        .filter(Alert.created_at >= since, Alert.severity == "critical")
        .group_by(func.date(Alert.created_at))
        .all()
    )
    crit_by_day: dict[str, int] = {str(r.day): r.n for r in crit_rows}

    return [
        AlertTrendPoint(
            date=str(r.day),
            total=r.total,
            critical=crit_by_day.get(str(r.day), 0),
        )
        for r in rows
    ]


# ── Routes ────────────────────────────────────────────────────────────────────

@kpi_router.get("/summary", response_model=KpiSummary, dependencies=[_read])
def kpi_summary(db: DbDep):
    return KpiSummary(
        health=_compute_health(db),
        top_risky_cis=_top_risky_cis(db),
        alert_trend=_alert_trend(db, 30),
    )


# ── Tableau de bord exécutif ──────────────────────────────────────────────────

class ExecutiveSummary(BaseModel):
    # Score de gouvernance global (composite)
    governance_score: int
    governance_label: str
    governance_color: str

    # Les 4 piliers (0-100 chacun)
    health_score: int
    quality_score: int
    sla_coverage_pct: int
    license_compliance_pct: int

    # Inventaire
    total_ci: int
    active_ci: int

    # Opérations
    open_incidents: int
    critical_incidents: int
    mttr_hours: Optional[float]
    open_alerts: int
    critical_alerts: int
    critical_cves: int

    # SLA
    sla_total: int
    sla_expiring_30d: int
    sla_expired: int
    cis_without_sla: int

    # Licences
    license_total: int
    license_expiring_30d: int
    license_expired: int
    license_over_limit: int

    # Top risques + tendance
    top_risky_cis: list[RiskyCi]
    alert_trend: list[AlertTrendPoint]

    # Recommandations prioritaires
    recommendations: list[str]


def _quality_score(db: Session) -> int:
    from app.quality_router import (
        _check_hw_no_warranty, _check_hw_no_serial, _check_hw_no_location,
        _check_sw_no_cpe, _check_sw_no_eol, _check_sw_no_version,
        _check_ci_no_owner, _check_ci_no_description, _check_hw_duplicate_serial,
        _compute_score,
    )
    issues = [
        _check_hw_no_warranty(db),
        _check_hw_no_serial(db),
        _check_hw_no_location(db),
        _check_sw_no_cpe(db),
        _check_sw_no_eol(db),
        _check_sw_no_version(db),
        _check_ci_no_owner(db),
        _check_ci_no_description(db),
        _check_hw_duplicate_serial(db),
    ]
    return _compute_score(issues)


def _sla_coverage(db: Session) -> tuple[int, int, int, int]:
    """Retourne (sla_total, expiring_30d, expired, cis_without_sla)."""
    today = date_cls.today()
    horizon_30 = today + timedelta(days=30)

    total_ci = db.execute(
        select(func.count()).select_from(CI).where(CI.deleted_at.is_(None))
    ).scalar_one()

    cis_without_sla = db.execute(
        select(func.count()).select_from(CI).where(
            CI.sla_id.is_(None), CI.deleted_at.is_(None)
        )
    ).scalar_one()

    from app.cmdb.models import Sla
    slas = db.query(Sla).all()
    sla_total = len(slas)
    expiring_30 = expired = 0
    for s in slas:
        if s.contract_end_date:
            if s.contract_end_date < today:
                expired += 1
            elif s.contract_end_date <= horizon_30:
                expiring_30 += 1

    coverage_pct = round((total_ci - cis_without_sla) / total_ci * 100) if total_ci > 0 else 100
    return sla_total, expiring_30, expired, cis_without_sla, coverage_pct


def _license_compliance(db: Session) -> tuple[int, int, int, int, int]:
    """Retourne (total, expiring_30d, expired, over_limit, compliance_pct)."""
    today = date_cls.today()
    horizon_30 = today + timedelta(days=30)

    rows = (
        db.query(SoftwareDetail)
        .join(CI, CI.id == SoftwareDetail.ci_id)
        .filter(CI.deleted_at.is_(None))
        .all()
    )

    total = len(rows)
    licensed = exp30 = expired = over = 0
    for sw in rows:
        if sw.license_type or sw.license_end_date or sw.max_seats:
            licensed += 1
            if sw.license_end_date:
                if sw.license_end_date < today:
                    expired += 1
                elif sw.license_end_date <= horizon_30:
                    exp30 += 1
            if sw.max_seats and sw.install_count and sw.install_count > sw.max_seats:
                over += 1

    non_compliant = expired + over
    compliance_pct = round((licensed - non_compliant) / licensed * 100) if licensed > 0 else 100
    return total, exp30, expired, over, compliance_pct


def _incident_summary(db: Session) -> tuple[int, int, Optional[float]]:
    """Retourne (open, critical, mttr_hours)."""
    from sqlalchemy import case
    open_count = db.query(func.count(Incident.id)).filter(
        Incident.status.in_(["open", "investigating"])
    ).scalar() or 0
    critical = db.query(func.count(Incident.id)).filter(
        Incident.severity == "critical",
        Incident.status.in_(["open", "investigating"])
    ).scalar() or 0

    # MTTR : moyenne des durées de résolution en heures
    mttr: Optional[float] = None
    resolved = db.query(Incident).filter(
        Incident.status.in_(["resolved", "closed"]),
        Incident.resolved_at.isnot(None),
    ).all()
    if resolved:
        durations = [
            (i.resolved_at - i.created_at).total_seconds() / 3600
            for i in resolved
            if i.resolved_at and i.created_at
        ]
        if durations:
            mttr = round(sum(durations) / len(durations), 1)

    return open_count, critical, mttr


def _alert_summary(db: Session) -> tuple[int, int]:
    open_count = db.query(func.count(Alert.id)).filter(Alert.resolved_at.is_(None)).scalar() or 0
    critical = db.query(func.count(Alert.id)).filter(
        Alert.severity == "critical", Alert.resolved_at.is_(None)
    ).scalar() or 0
    return open_count, critical


def _cve_critical(db: Session) -> int:
    from app.cmdb.models import Cve
    return db.query(func.count(CICve.ci_id)).join(Cve, CICve.cve_id == Cve.id).filter(
        Cve.cvss_severity == "CRITICAL"
    ).scalar() or 0


def _total_active_ci(db: Session) -> tuple[int, int]:
    total = db.query(func.count(CI.id)).filter(CI.deleted_at.is_(None)).scalar() or 0
    active = db.query(func.count(CI.id)).filter(
        CI.deleted_at.is_(None), CI.status == "in_service"
    ).scalar() or 0
    return total, active


def _build_recommendations(
    critical_cves: int,
    critical_incidents: int,
    quality_score: int,
    sla_expiring_30d: int,
    sla_expired: int,
    license_expired: int,
    license_over_limit: int,
    sla_coverage_pct: int,
    license_compliance_pct: int,
) -> list[str]:
    recs: list[str] = []
    if critical_cves > 0:
        recs.append(f"Traiter {critical_cves} vulnérabilité{'s' if critical_cves > 1 else ''} CVE critique{'s' if critical_cves > 1 else ''}")
    if critical_incidents > 0:
        recs.append(f"Résoudre {critical_incidents} incident{'s' if critical_incidents > 1 else ''} critique{'s' if critical_incidents > 1 else ''} en cours")
    if sla_expired > 0:
        recs.append(f"Renouveler {sla_expired} contrat{'s' if sla_expired > 1 else ''} SLA expiré{'s' if sla_expired > 1 else ''}")
    if sla_expiring_30d > 0:
        recs.append(f"Anticiper le renouvellement de {sla_expiring_30d} contrat{'s' if sla_expiring_30d > 1 else ''} SLA (< 30 j)")
    if license_expired > 0:
        recs.append(f"Régulariser {license_expired} licence{'s' if license_expired > 1 else ''} expirée{'s' if license_expired > 1 else ''}")
    if license_over_limit > 0:
        recs.append(f"Acquérir des licences pour {license_over_limit} logiciel{'s' if license_over_limit > 1 else ''} en dépassement")
    if quality_score < 70:
        recs.append(f"Améliorer la qualité des données CMDB (score actuel : {quality_score}/100)")
    if sla_coverage_pct < 60:
        recs.append(f"Étendre la couverture SLA — {100 - sla_coverage_pct}% du parc non couvert")
    if not recs:
        recs.append("Aucune action prioritaire identifiée — gouvernance à jour")
    return recs


@kpi_router.get("/executive", response_model=ExecutiveSummary, dependencies=[_read])
def kpi_executive(db: DbDep):
    health    = _compute_health(db)
    quality   = _quality_score(db)
    sla_total, sla_exp30, sla_expired, cis_no_sla, sla_cov = _sla_coverage(db)
    lic_total, lic_exp30, lic_expired, lic_over, lic_cpl   = _license_compliance(db)
    open_inc, crit_inc, mttr  = _incident_summary(db)
    open_al,  crit_al         = _alert_summary(db)
    crit_cve                  = _cve_critical(db)
    total_ci, active_ci       = _total_active_ci(db)

    # Score de gouvernance composite
    gov = round(
        health.score * 0.35 +
        quality      * 0.25 +
        sla_cov      * 0.20 +
        lic_cpl      * 0.20
    )
    if gov >= 80:
        gov_label, gov_color = "Excellent", "green"
    elif gov >= 60:
        gov_label, gov_color = "Satisfaisant", "green"
    elif gov >= 40:
        gov_label, gov_color = "À améliorer", "amber"
    else:
        gov_label, gov_color = "Critique", "red"

    recs = _build_recommendations(
        crit_cve, crit_inc, quality,
        sla_exp30, sla_expired,
        lic_expired, lic_over,
        sla_cov, lic_cpl,
    )

    return ExecutiveSummary(
        governance_score=gov,
        governance_label=gov_label,
        governance_color=gov_color,
        health_score=health.score,
        quality_score=quality,
        sla_coverage_pct=sla_cov,
        license_compliance_pct=lic_cpl,
        total_ci=total_ci,
        active_ci=active_ci,
        open_incidents=open_inc,
        critical_incidents=crit_inc,
        mttr_hours=mttr,
        open_alerts=open_al,
        critical_alerts=crit_al,
        critical_cves=crit_cve,
        sla_total=sla_total,
        sla_expiring_30d=sla_exp30,
        sla_expired=sla_expired,
        cis_without_sla=cis_no_sla,
        license_total=lic_total,
        license_expiring_30d=lic_exp30,
        license_expired=lic_expired,
        license_over_limit=lic_over,
        top_risky_cis=_top_risky_cis(db),
        alert_trend=_alert_trend(db, 30),
        recommendations=recs,
    )
