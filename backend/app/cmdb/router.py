"""
Routers CMDB — inventaire CI hardware/software et fonctions associées.

  /api/ci/…          : CRUD CI (HW et SW), filtres, pagination, soft-delete, fiche détail.
  /api/ci/graph/…    : graphe de relations BFS (jusqu'à 3 niveaux depuis un CI central).
  /api/ci/bulk/…     : actions de masse (suppression groupée, déplacement d'équipe).
  /api/import/…      : import CSV avec validation et rapport d'erreurs.
  /api/relations/…   : CRUD relations entre CI (typées).
  /api/network/…     : segments réseau (VLAN/DMZ) liés aux CI.

Toutes les routes de mutation passent par require_perm("cmdb", "write").
Le graphe BFS est calculé en mémoire depuis les CIRelation chargées en une requête.
"""
import logging
import uuid
from datetime import date, timedelta, datetime, timezone
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import CurrentUser, require_role, require_perm

logger = logging.getLogger(__name__)
from app.cmdb import service
from app.cmdb.models import CI, HardwareDetail, SoftwareDetail, CICve, CIRelation
from app.cmdb.schemas import (
    CICreate, CIUpdate, CIOut, CIList,
    CIRelationCreate, CIRelationOut,
    SlaCreate, SlaUpdate, SlaOut,
    MaintenanceScheduleCreate, MaintenanceScheduleOut,
    MaintenanceScheduleUpdate, MaintenanceGlobalItem,
    MaintenanceLogCreate, MaintenanceLogOut,
)


# ── Schémas stats ─────────────────────────────────────────────────────────────

class NameCount(BaseModel):
    name: str
    count: int

class HardwareStats(BaseModel):
    total: int
    by_status: dict[str, int]
    by_criticality: dict[str, int]
    top_manufacturers: list[NameCount]
    warranty_expiring_90d: int
    warranty_expired: int

class SoftwareStats(BaseModel):
    total: int
    by_status: dict[str, int]
    by_criticality: dict[str, int]
    top_vendors: list[NameCount]
    license_expiring_90d: int
    eol_within_90d: int
    is_internal_count: int


class TrendPoint(BaseModel):
    month: str       # "2026-01"
    hardware: int
    software: int
    total: int


class CPESuggestion(BaseModel):
    cpe_name: str
    title: str
    source: str  # "nvd" | "heuristic"


# ── Schémas graph ─────────────────────────────────────────────────────────────

class GraphSegment(BaseModel):
    name: str
    color: str

class GraphNode(BaseModel):
    id: str
    name: str
    ci_type: str
    status: str
    criticality: str
    level: int
    team: Optional[str] = None
    location: Optional[str] = None
    segments: list[GraphSegment] = []

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    relation_type: str

class CIGraph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]

router = APIRouter(prefix="/api/ci", tags=["CI"])
sla_router = APIRouter(prefix="/api/sla", tags=["SLA"])
maintenance_router = APIRouter(prefix="/api/maintenance", tags=["maintenances"])

DbDep = Annotated[Session, Depends(get_db)]

_read_roles  = require_perm("ci", "read")
_write_roles = require_perm("ci", "write")
_ci_delete   = require_perm("ci", "delete")
_sla_read    = require_perm("contracts", "read")
_sla_write   = require_perm("contracts", "write")


# ── Stats matériel ────────────────────────────────────────────────────────────

@router.get("/stats/hardware", response_model=HardwareStats, dependencies=[_read_roles])
def hardware_stats(db: DbDep):
    today = date.today()
    horizon = today + timedelta(days=90)

    total = db.scalar(
        select(func.count()).select_from(CI).where(CI.ci_type == "hardware")
    ) or 0

    # by_status
    status_rows = db.execute(
        select(CI.status, func.count()).where(CI.ci_type == "hardware")
        .group_by(CI.status)
    ).all()
    by_status = {r[0]: r[1] for r in status_rows}

    # by_criticality
    crit_rows = db.execute(
        select(CI.criticality, func.count()).where(CI.ci_type == "hardware")
        .group_by(CI.criticality)
    ).all()
    by_criticality = {r[0]: r[1] for r in crit_rows}

    # top_manufacturers (join HardwareDetail)
    mfr_rows = db.execute(
        select(HardwareDetail.manufacturer, func.count())
        .join(CI, HardwareDetail.ci_id == CI.id)
        .where(CI.ci_type == "hardware", HardwareDetail.manufacturer != None)
        .group_by(HardwareDetail.manufacturer)
        .order_by(func.count().desc())
        .limit(5)
    ).all()
    top_manufacturers = [NameCount(name=r[0], count=r[1]) for r in mfr_rows]

    # warranty
    warranty_exp_90 = db.scalar(
        select(func.count()).select_from(HardwareDetail)
        .join(CI, HardwareDetail.ci_id == CI.id)
        .where(
            CI.ci_type == "hardware",
            HardwareDetail.warranty_end_date >= today,
            HardwareDetail.warranty_end_date <= horizon,
        )
    ) or 0
    warranty_expired = db.scalar(
        select(func.count()).select_from(HardwareDetail)
        .join(CI, HardwareDetail.ci_id == CI.id)
        .where(CI.ci_type == "hardware", HardwareDetail.warranty_end_date < today)
    ) or 0

    return HardwareStats(
        total=total,
        by_status=by_status,
        by_criticality=by_criticality,
        top_manufacturers=top_manufacturers,
        warranty_expiring_90d=warranty_exp_90,
        warranty_expired=warranty_expired,
    )


# ── Stats logiciel ────────────────────────────────────────────────────────────

@router.get("/stats/software", response_model=SoftwareStats, dependencies=[_read_roles])
def software_stats(db: DbDep):
    today = date.today()
    horizon = today + timedelta(days=90)

    total = db.scalar(
        select(func.count()).select_from(CI).where(CI.ci_type == "software")
    ) or 0

    status_rows = db.execute(
        select(CI.status, func.count()).where(CI.ci_type == "software").group_by(CI.status)
    ).all()
    by_status = {r[0]: r[1] for r in status_rows}

    crit_rows = db.execute(
        select(CI.criticality, func.count()).where(CI.ci_type == "software").group_by(CI.criticality)
    ).all()
    by_criticality = {r[0]: r[1] for r in crit_rows}

    vendor_rows = db.execute(
        select(SoftwareDetail.vendor, func.count())
        .join(CI, SoftwareDetail.ci_id == CI.id)
        .where(CI.ci_type == "software", SoftwareDetail.vendor != None)
        .group_by(SoftwareDetail.vendor)
        .order_by(func.count().desc())
        .limit(5)
    ).all()
    top_vendors = [NameCount(name=r[0], count=r[1]) for r in vendor_rows]

    license_exp_90 = db.scalar(
        select(func.count()).select_from(SoftwareDetail)
        .join(CI, SoftwareDetail.ci_id == CI.id)
        .where(
            CI.ci_type == "software",
            SoftwareDetail.license_end_date >= today,
            SoftwareDetail.license_end_date <= horizon,
        )
    ) or 0

    eol_90 = db.scalar(
        select(func.count()).select_from(SoftwareDetail)
        .join(CI, SoftwareDetail.ci_id == CI.id)
        .where(
            CI.ci_type == "software",
            SoftwareDetail.eol_date >= today,
            SoftwareDetail.eol_date <= horizon,
        )
    ) or 0

    is_internal = db.scalar(
        select(func.count()).select_from(SoftwareDetail)
        .join(CI, SoftwareDetail.ci_id == CI.id)
        .where(CI.ci_type == "software", SoftwareDetail.is_internal == True)
    ) or 0

    return SoftwareStats(
        total=total,
        by_status=by_status,
        by_criticality=by_criticality,
        top_vendors=top_vendors,
        license_expiring_90d=license_exp_90,
        eol_within_90d=eol_90,
        is_internal_count=is_internal,
    )


# ── Tendance mensuelle (12 mois) ─────────────────────────────────────────────

@router.get("/stats/trend", response_model=list[TrendPoint], dependencies=[_read_roles])
def ci_trend(db: DbDep):
    from sqlalchemy import text
    cutoff = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # 12 mois glissants
    rows = db.execute(text("""
        SELECT
            to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            ci_type,
            COUNT(*) AS cnt
        FROM cis
        WHERE created_at >= NOW() - INTERVAL '12 months'
          AND deleted_at IS NULL
        GROUP BY month, ci_type
        ORDER BY month
    """)).all()

    # Regrouper par mois
    buckets: dict[str, dict[str, int]] = {}
    for month, ci_type, cnt in rows:
        if month not in buckets:
            buckets[month] = {"hardware": 0, "software": 0}
        buckets[month][ci_type] = cnt

    return [
        TrendPoint(
            month=m,
            hardware=v.get("hardware", 0),
            software=v.get("software", 0),
            total=v.get("hardware", 0) + v.get("software", 0),
        )
        for m, v in sorted(buckets.items())
    ]


# ── CPE auto-detect ───────────────────────────────────────────────────────────

_NVD_CPE_URL = "https://services.nvd.nist.gov/rest/json/cpes/2.0"


def _slug(s: str) -> str:
    """Normalise une chaîne en slug CPE (minuscules, espaces → underscores)."""
    return s.strip().lower().replace(" ", "_").replace("-", "_")


@router.get("/cpe-suggest", response_model=list[CPESuggestion], dependencies=[_read_roles])
def cpe_suggest(
    vendor:  Optional[str] = Query(None, max_length=200),
    product: Optional[str] = Query(None, max_length=200),
    version: Optional[str] = Query(None, max_length=100),
):
    settings = get_settings()
    suggestions: list[CPESuggestion] = []
    seen: set[str] = set()

    def _add(cpe: str, title: str, source: str):
        if cpe and cpe not in seen:
            seen.add(cpe)
            suggestions.append(CPESuggestion(cpe_name=cpe, title=title, source=source))

    # 1 ── Suggestion heuristique (construction locale, instantané)
    if vendor and product:
        v, p = _slug(vendor), _slug(product)
        ver = _slug(version) if version else "*"
        heuristic = f"cpe:2.3:a:{v}:{p}:{ver}:*:*:*:*:*:*:*"
        _add(heuristic, f"{vendor} {product} {version or '*'} (heuristique)", "heuristic")

    # 2 ── Recherche NVD CPE dictionary
    keywords = " ".join(filter(None, [vendor, product]))
    if keywords:
        headers = {}
        if settings.nvd_api_key:
            headers["apiKey"] = settings.nvd_api_key
        try:
            resp = httpx.get(
                _NVD_CPE_URL,
                params={"keywordSearch": keywords, "resultsPerPage": 15},
                headers=headers,
                timeout=15,
                follow_redirects=True,
            )
            if resp.status_code == 200:
                for item in resp.json().get("products", []):
                    cpe_obj = item.get("cpe", {})
                    cpe_name = cpe_obj.get("cpeName", "")
                    if not cpe_name or cpe_obj.get("deprecated"):
                        continue
                    titles = cpe_obj.get("titles", [])
                    title = next(
                        (t["title"] for t in titles if t.get("lang") == "en"),
                        cpe_name,
                    )
                    # Priorité aux CPEs dont la version correspond
                    if version and f":{_slug(version)}:" in cpe_name:
                        suggestions.insert(0, CPESuggestion(cpe_name=cpe_name, title=title, source="nvd"))
                        seen.add(cpe_name)
                    else:
                        _add(cpe_name, title, "nvd")
        except Exception as exc:
            logger.warning("CPE suggest NVD error: %s", exc)

    return suggestions[:12]


# ── CI Graph ──────────────────────────────────────────────────────────────────

@router.get("/{ci_id}/graph", response_model=CIGraph, dependencies=[_read_roles])
def get_ci_graph(
    ci_id: uuid.UUID,
    db: DbDep,
    depth: int = Query(3, ge=1, le=5),
):
    from collections import deque
    from app.network.models import CINetworkSegment as CINetSeg, NetworkSegment as NetSeg

    visited: dict[str, GraphNode] = {}
    edges: dict[str, GraphEdge] = {}
    queue: deque[tuple[uuid.UUID, int]] = deque([(ci_id, 0)])

    while queue:
        current_id, level = queue.popleft()
        key = str(current_id)
        if key in visited:
            continue

        ci = service.get_ci(db, current_id)
        if not ci:
            continue

        from app.network.models import DEFAULT_COLORS
        seg_rows = db.execute(
            select(NetSeg.name, NetSeg.seg_type, NetSeg.color)
            .join(CINetSeg, CINetSeg.segment_id == NetSeg.id)
            .where(CINetSeg.ci_id == current_id)
        ).all()
        segments = [
            GraphSegment(name=r.name, color=r.color or DEFAULT_COLORS.get(r.seg_type, "#94A3B8"))
            for r in seg_rows
        ]

        visited[key] = GraphNode(
            id=key,
            name=ci.name,
            ci_type=ci.ci_type,
            status=ci.status,
            criticality=ci.criticality,
            level=level,
            team=ci.team,
            location=ci.location,
            segments=segments,
        )

        if level < depth:
            rels = db.execute(
                select(CIRelation).where(
                    (CIRelation.source_ci_id == current_id) |
                    (CIRelation.target_ci_id == current_id)
                )
            ).scalars().all()

            for rel in rels:
                eid = str(rel.id)
                if eid not in edges:
                    edges[eid] = GraphEdge(
                        id=eid,
                        source=str(rel.source_ci_id),
                        target=str(rel.target_ci_id),
                        relation_type=rel.relation_type,
                    )
                neighbor = rel.target_ci_id if rel.source_ci_id == current_id else rel.source_ci_id
                if str(neighbor) not in visited:
                    queue.append((neighbor, level + 1))

    return CIGraph(nodes=list(visited.values()), edges=list(edges.values()))


# ── Tableau de bord Licences ──────────────────────────────────────────────────

class LicenseItemOut(BaseModel):
    ci_id: uuid.UUID
    ci_name: str
    vendor: Optional[str]
    product: str
    version: Optional[str]
    license_type: Optional[str]
    license_end_date: Optional[date]
    days_until_expiry: Optional[int]
    expiry_status: str   # ok | warning | critical | expired | no_date
    install_count: Optional[int]
    max_seats: Optional[int]
    utilization_pct: Optional[int]
    seat_status: str     # ok | warning | over | unknown


class LicenseDashboard(BaseModel):
    total_software: int
    licensed: int
    internal: int
    expiring_30d: int
    expiring_90d: int
    expired: int
    over_limit: int
    licenses: list[LicenseItemOut]


@router.get("/licenses/dashboard", response_model=LicenseDashboard, dependencies=[_read_roles])
def licenses_dashboard(db: DbDep):
    from datetime import date as date_cls
    today = date_cls.today()

    rows = (
        db.query(CI, SoftwareDetail)
        .join(SoftwareDetail, SoftwareDetail.ci_id == CI.id)
        .filter(CI.deleted_at.is_(None))
        .order_by(CI.name)
        .all()
    )

    total = len(rows)
    licensed = internal = exp30 = exp90 = expired_cnt = over_cnt = 0
    items: list[LicenseItemOut] = []

    for ci, sw in rows:
        if sw.is_internal:
            internal += 1
        if sw.license_type or sw.license_end_date or sw.max_seats:
            licensed += 1

        end = sw.license_end_date
        days: Optional[int] = None
        expiry_status = "no_date"
        if end:
            days = (end - today).days
            if days < 0:
                expiry_status = "expired"
                expired_cnt += 1
            elif days <= 30:
                expiry_status = "critical"
                exp30 += 1
                exp90 += 1
            elif days <= 90:
                expiry_status = "warning"
                exp90 += 1
            else:
                expiry_status = "ok"

        seat_status = "unknown"
        util_pct: Optional[int] = None
        if sw.max_seats and sw.install_count is not None:
            util_pct = round(sw.install_count / sw.max_seats * 100)
            if sw.install_count > sw.max_seats:
                seat_status = "over"
                over_cnt += 1
            elif util_pct >= 80:
                seat_status = "warning"
            else:
                seat_status = "ok"
        elif sw.install_count is not None and sw.max_seats is None:
            seat_status = "unknown"

        items.append(LicenseItemOut(
            ci_id=ci.id,
            ci_name=ci.name,
            vendor=sw.vendor,
            product=sw.product,
            version=sw.version,
            license_type=sw.license_type,
            license_end_date=end,
            days_until_expiry=days,
            expiry_status=expiry_status,
            install_count=sw.install_count,
            max_seats=sw.max_seats,
            utilization_pct=util_pct,
            seat_status=seat_status,
        ))

    # Tri : dépassement > critique > warning > expired > ok > no_date
    priority = {"over": 0, "critical": 1, "warning": 2, "expired": 3, "ok": 4, "no_date": 5, "unknown": 6}
    items.sort(key=lambda x: (
        priority.get(x.seat_status if x.seat_status == "over" else x.expiry_status, 9),
        x.days_until_expiry if x.days_until_expiry is not None else 9999,
    ))

    return LicenseDashboard(
        total_software=total,
        licensed=licensed,
        internal=internal,
        expiring_30d=exp30,
        expiring_90d=exp90,
        expired=expired_cnt,
        over_limit=over_cnt,
        licenses=items,
    )


# ── Vue Parc Virtuel ──────────────────────────────────────────────────────────

class VirtualStats(BaseModel):
    total_vms: int
    active_vms: int
    physical_hosts: int
    vms_without_host: int
    vms_with_cves: int


class VirtualVMOut(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    criticality: str
    team: Optional[str]
    location: Optional[str]
    cve_count: int
    host_id: Optional[uuid.UUID]
    host_name: Optional[str]


@router.get("/virtual/stats", response_model=VirtualStats, dependencies=[_read_roles])
def virtual_stats(db: DbDep):
    vm_ids = db.execute(
        select(CI.id)
        .join(HardwareDetail, HardwareDetail.ci_id == CI.id)
        .where(CI.deleted_at.is_(None), HardwareDetail.hw_subtype == "vm")
    ).scalars().all()

    total = len(vm_ids)
    if total == 0:
        return VirtualStats(total_vms=0, active_vms=0, physical_hosts=0, vms_without_host=0, vms_with_cves=0)

    active = db.execute(
        select(func.count())
        .select_from(CI)
        .join(HardwareDetail, HardwareDetail.ci_id == CI.id)
        .where(CI.deleted_at.is_(None), HardwareDetail.hw_subtype == "vm", CI.status == "in_service")
    ).scalar_one()

    # Hôtes physiques via relation hosted_on (VM = source, host = target)
    hosts = db.execute(
        select(func.count(CIRelation.target_ci_id.distinct()))
        .where(
            CIRelation.source_ci_id.in_(vm_ids),
            CIRelation.relation_type == "hosted_on",
        )
    ).scalar_one()

    vms_with_host = db.execute(
        select(func.count(CIRelation.source_ci_id.distinct()))
        .where(
            CIRelation.source_ci_id.in_(vm_ids),
            CIRelation.relation_type == "hosted_on",
        )
    ).scalar_one()

    vms_with_cves = db.execute(
        select(func.count(CICve.ci_id.distinct()))
        .where(CICve.ci_id.in_(vm_ids))
    ).scalar_one()

    return VirtualStats(
        total_vms=total,
        active_vms=active,
        physical_hosts=hosts,
        vms_without_host=total - vms_with_host,
        vms_with_cves=vms_with_cves,
    )


@router.get("/virtual/", response_model=list[VirtualVMOut], dependencies=[_read_roles])
def list_virtual_vms(
    db: DbDep,
    status:      Optional[str] = None,
    criticality: Optional[str] = None,
    search:      Optional[str] = Query(None, max_length=200),
):
    q = (
        db.query(CI)
        .join(HardwareDetail, HardwareDetail.ci_id == CI.id)
        .where(CI.deleted_at.is_(None), HardwareDetail.hw_subtype == "vm")
    )
    if status:
        q = q.filter(CI.status == status)
    if criticality:
        q = q.filter(CI.criticality == criticality)
    if search:
        q = q.filter(CI.name.ilike(f"%{search}%"))
    vms = q.order_by(CI.name).all()

    vm_ids = [vm.id for vm in vms]

    # Batch-load CVE counts
    cve_rows = db.execute(
        select(CICve.ci_id, func.count()).where(CICve.ci_id.in_(vm_ids)).group_by(CICve.ci_id)
    ).all() if vm_ids else []
    cve_counts = {r[0]: r[1] for r in cve_rows}

    # Batch-load hosts via hosted_on (VM → host physique)
    host_rows = db.execute(
        select(CIRelation.source_ci_id, CIRelation.target_ci_id)
        .where(
            CIRelation.source_ci_id.in_(vm_ids),
            CIRelation.relation_type == "hosted_on",
        )
    ).all() if vm_ids else []
    vm_to_host_id: dict[uuid.UUID, uuid.UUID] = {r[0]: r[1] for r in host_rows}

    host_ids = list(set(vm_to_host_id.values()))
    host_name_map: dict[uuid.UUID, str] = {}
    if host_ids:
        for hid, hname in db.execute(select(CI.id, CI.name).where(CI.id.in_(host_ids))).all():
            host_name_map[hid] = hname

    result = []
    for vm in vms:
        host_id = vm_to_host_id.get(vm.id)
        result.append(VirtualVMOut(
            id=vm.id,
            name=vm.name,
            status=vm.status,
            criticality=vm.criticality,
            team=vm.team,
            location=vm.location,
            cve_count=cve_counts.get(vm.id, 0),
            host_id=host_id,
            host_name=host_name_map.get(host_id) if host_id else None,
        ))
    return result


# ── CI CRUD ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=CIList, dependencies=[_read_roles])
def list_cis(
    db: DbDep,
    ci_type:    Optional[str]  = Query(None, pattern="^(hardware|software)$"),
    status:     Optional[str]  = None,
    criticality: Optional[str] = None,
    search:     Optional[str]  = Query(None, max_length=200),
    has_cves:      Optional[bool] = Query(None),
    has_key_users: Optional[bool] = Query(None),
    hw_subtype:    Optional[str]  = Query(None, pattern="^(server|vm|workstation|terminal_server|network_device)$"),
    skip:          int            = Query(0, ge=0),
    limit:         int            = Query(50, ge=1, le=200),
):
    total, cis = service.list_cis(db, ci_type, status, criticality, search, has_cves, has_key_users, hw_subtype, skip, limit)

    # Batch-load CVE counts (1 requête pour toute la page)
    ci_ids = [ci.id for ci in cis]
    cve_counts: dict = {}
    if ci_ids:
        rows = db.execute(
            select(CICve.ci_id, func.count()).where(CICve.ci_id.in_(ci_ids)).group_by(CICve.ci_id)
        ).all()
        cve_counts = {r[0]: r[1] for r in rows}

    out_items = []
    for ci in cis:
        out = CIOut.model_validate(ci)
        out.cve_count = cve_counts.get(ci.id, 0)
        out_items.append(out)

    return CIList(total=total, items=out_items)


def _diff_ci(ci, data: "CIUpdate") -> dict:
    changes: dict = {}
    for field in ["name", "description", "status", "criticality", "team", "location"]:
        new_val = getattr(data, field, None)
        if new_val is not None:
            old_val = getattr(ci, field, None)
            if str(old_val) != str(new_val):
                changes[field] = {
                    "before": str(old_val) if old_val is not None else None,
                    "after": str(new_val),
                }
    return changes


@router.get("/expiring", dependencies=[_read_roles])
def list_expiring(
    db: DbDep,
    horizon:     int          = Query(90, ge=1, le=365),
    ci_type:     Optional[str] = Query(None),
    team:        Optional[str] = Query(None),
    include_expired: bool     = Query(True),
):
    today   = date.today()
    limit_d = today + timedelta(days=horizon)
    items   = []

    # ── Hardware : garantie ───────────────────────────────────────────────────
    q_hw = (
        select(CI, HardwareDetail.warranty_end_date)
        .join(HardwareDetail, HardwareDetail.ci_id == CI.id)
        .where(
            CI.ci_type == "hardware",
            CI.deleted_at.is_(None),
            HardwareDetail.warranty_end_date.isnot(None),
            HardwareDetail.warranty_end_date <= limit_d,
        )
    )
    if not include_expired:
        q_hw = q_hw.where(HardwareDetail.warranty_end_date >= today)
    if team:
        q_hw = q_hw.where(CI.team == team)
    for ci, exp_date in db.execute(q_hw).all():
        items.append({
            "ci_id": str(ci.id), "ci_name": ci.name, "ci_type": "hardware",
            "team": ci.team, "location": ci.location, "status": ci.status,
            "expiry_type": "warranty", "expiry_date": exp_date.isoformat(),
            "days_remaining": (exp_date - today).days,
        })

    # ── Hardware : leasing ────────────────────────────────────────────────────
    q_lease = (
        select(CI, HardwareDetail.leasing_end_date)
        .join(HardwareDetail, HardwareDetail.ci_id == CI.id)
        .where(
            CI.ci_type == "hardware",
            CI.deleted_at.is_(None),
            HardwareDetail.leasing_end_date.isnot(None),
            HardwareDetail.leasing_end_date <= limit_d,
        )
    )
    if not include_expired:
        q_lease = q_lease.where(HardwareDetail.leasing_end_date >= today)
    if team:
        q_lease = q_lease.where(CI.team == team)
    for ci, exp_date in db.execute(q_lease).all():
        items.append({
            "ci_id": str(ci.id), "ci_name": ci.name, "ci_type": "hardware",
            "team": ci.team, "location": ci.location, "status": ci.status,
            "expiry_type": "leasing", "expiry_date": exp_date.isoformat(),
            "days_remaining": (exp_date - today).days,
        })

    # ── Software : fin de licence ─────────────────────────────────────────────
    q_lic = (
        select(CI, SoftwareDetail.license_end_date)
        .join(SoftwareDetail, SoftwareDetail.ci_id == CI.id)
        .where(
            CI.ci_type == "software",
            CI.deleted_at.is_(None),
            SoftwareDetail.license_end_date.isnot(None),
            SoftwareDetail.license_end_date <= limit_d,
        )
    )
    if not include_expired:
        q_lic = q_lic.where(SoftwareDetail.license_end_date >= today)
    if team:
        q_lic = q_lic.where(CI.team == team)
    for ci, exp_date in db.execute(q_lic).all():
        items.append({
            "ci_id": str(ci.id), "ci_name": ci.name, "ci_type": "software",
            "team": ci.team, "location": ci.location, "status": ci.status,
            "expiry_type": "license", "expiry_date": exp_date.isoformat(),
            "days_remaining": (exp_date - today).days,
        })

    # ── Software : EOL éditeur ────────────────────────────────────────────────
    q_eol = (
        select(CI, SoftwareDetail.eol_date)
        .join(SoftwareDetail, SoftwareDetail.ci_id == CI.id)
        .where(
            CI.ci_type == "software",
            CI.deleted_at.is_(None),
            SoftwareDetail.eol_date.isnot(None),
            SoftwareDetail.eol_date <= limit_d,
        )
    )
    if not include_expired:
        q_eol = q_eol.where(SoftwareDetail.eol_date >= today)
    if team:
        q_eol = q_eol.where(CI.team == team)
    for ci, exp_date in db.execute(q_eol).all():
        items.append({
            "ci_id": str(ci.id), "ci_name": ci.name, "ci_type": "software",
            "team": ci.team, "location": ci.location, "status": ci.status,
            "expiry_type": "eol", "expiry_date": exp_date.isoformat(),
            "days_remaining": (exp_date - today).days,
        })

    # filtre ci_type après union (plus simple)
    if ci_type:
        items = [i for i in items if i["ci_type"] == ci_type]

    items.sort(key=lambda x: x["days_remaining"])
    return {"items": items, "total": len(items)}


EXPIRY_LABELS = {
    "warranty": "Fin de garantie",
    "leasing":  "Fin de leasing",
    "license":  "Fin de licence",
    "eol":      "EOL éditeur",
}

@router.get("/expiring/csv", dependencies=[_read_roles])
def expiring_csv(
    db: DbDep,
    horizon:         int           = Query(90, ge=1, le=365),
    ci_type:         Optional[str] = Query(None),
    team:            Optional[str] = Query(None),
    include_expired: bool          = Query(True),
):
    import csv as csv_mod, io
    result = list_expiring(db, horizon, ci_type, team, include_expired)
    buf = io.StringIO()
    w = csv_mod.writer(buf)
    w.writerow(["CI", "Type CI", "Équipe", "Localisation", "Statut", "Échéance", "Date", "Jours restants"])
    for item in result["items"]:
        ci_label = "Matériel" if item["ci_type"] == "hardware" else "Logiciel"
        w.writerow([
            item["ci_name"],
            ci_label,
            item["team"] or "",
            item["location"] or "",
            item["status"] or "",
            EXPIRY_LABELS.get(item["expiry_type"], item["expiry_type"]),
            item["expiry_date"],
            item["days_remaining"],
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="fin_de_vie.csv"'},
    )


@router.get("/export", dependencies=[_read_roles])
def export_cis(
    db: DbDep,
    ci_type:     Optional[str] = Query(None),
    status:      Optional[str] = Query(None),
    criticality: Optional[str] = Query(None),
    search:      Optional[str] = Query(None, max_length=200),
    hw_subtype:  Optional[str] = Query(None),
):
    import csv as csv_mod, io
    _, cis = service.list_cis(db, ci_type, status, criticality, search, None, None, hw_subtype, 0, 10_000)

    buf = io.StringIO()
    w = csv_mod.writer(buf)
    w.writerow([
        "ci_type", "name", "description", "status", "criticality", "team", "location",
        "manufacturer", "model", "serial_number", "hw_subtype", "os_name", "os_version",
        "purchase_date", "warranty_end_date", "supplier", "purchase_price",
        "vendor", "product", "version", "license_type", "license_end_date",
        "eol_date", "install_count", "is_internal",
    ])
    for ci in cis:
        hw = ci.hardware_details
        sw = ci.software_details
        w.writerow([
            ci.ci_type, ci.name, ci.description or "", ci.status, ci.criticality,
            ci.team or "", ci.location or "",
            (hw.manufacturer or "") if hw else "", (hw.model or "") if hw else "",
            (hw.serial_number or "") if hw else "", (hw.hw_subtype or "") if hw else "",
            (hw.os_name or "") if hw else "", (hw.os_version or "") if hw else "",
            (str(hw.purchase_date) if hw.purchase_date else "") if hw else "",
            (str(hw.warranty_end_date) if hw.warranty_end_date else "") if hw else "",
            (hw.supplier or "") if hw else "", (str(hw.purchase_price) if hw.purchase_price else "") if hw else "",
            (sw.vendor or "") if sw else "", (sw.product or "") if sw else "",
            (sw.version or "") if sw else "", (sw.license_type or "") if sw else "",
            (str(sw.license_end_date) if sw.license_end_date else "") if sw else "",
            (str(sw.eol_date) if sw.eol_date else "") if sw else "",
            (str(sw.install_count) if sw.install_count is not None else "") if sw else "",
            ("true" if sw.is_internal else "false") if sw else "",
        ])

    content = "﻿".encode() + buf.getvalue().encode("utf-8")  # BOM pour Excel
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="export_ci.csv"'},
    )


@router.get("/import/template", dependencies=[_read_roles])
def download_template():
    from .import_csv import TEMPLATE_HEADER, TEMPLATE_HW_EXAMPLE, TEMPLATE_SW_EXAMPLE
    content = "\n".join([TEMPLATE_HEADER, TEMPLATE_HW_EXAMPLE, TEMPLATE_SW_EXAMPLE]) + "\n"
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="template_import_ci.csv"'},
    )


@router.post("/import/preview", dependencies=[_write_roles])
def preview_import(file: UploadFile = File(...)):
    from .import_csv import parse_csv_preview
    content = file.file.read()
    rows = parse_csv_preview(content)
    return {"rows": rows, "total": len(rows)}


@router.post("/import", dependencies=[_write_roles])
def import_cis(db: DbDep, file: UploadFile = File(...)):
    from .import_csv import import_csv
    content = file.file.read()
    result = import_csv(db, content)
    return {
        "total":   result.total,
        "created": result.created,
        "updated": result.updated,
        "errors":  result.errors,
    }


# ── Actions de masse ──────────────────────────────────────────────────────────

class BulkDeleteRequest(BaseModel):
    ids: list[uuid.UUID]

class BulkMoveTeamRequest(BaseModel):
    ids: list[uuid.UUID]
    team: Optional[str]

class BulkExportRequest(BaseModel):
    ids: list[uuid.UUID]


@router.post("/bulk/delete", status_code=status.HTTP_200_OK,
             dependencies=[_ci_delete])
def bulk_delete(data: BulkDeleteRequest, db: DbDep, user: CurrentUser):
    if not data.ids:
        return {"deleted": 0}
    from app.audit import service as audit_svc
    deleted = 0
    for ci_id in data.ids:
        ci = service.get_ci(db, ci_id)
        if ci:
            name = ci.name
            id_str = str(ci.id)
            service.delete_ci(db, ci)
            audit_svc.record(db, "ci", id_str, name, "delete", {}, user)
            deleted += 1
    db.commit()
    return {"deleted": deleted}


@router.post("/bulk/move-team", status_code=status.HTTP_200_OK,
             dependencies=[_write_roles])
def bulk_move_team(data: BulkMoveTeamRequest, db: DbDep, user: CurrentUser):
    if not data.ids:
        return {"updated": 0}
    from app.audit import service as audit_svc
    updated = 0
    for ci_id in data.ids:
        ci = service.get_ci(db, ci_id)
        if ci:
            old_team = ci.team
            ci.team = data.team
            audit_svc.record(db, "ci", str(ci.id), ci.name, "update",
                             {"team": {"old": old_team, "new": data.team}}, user)
            updated += 1
    db.commit()
    return {"updated": updated}


@router.post("/bulk/export", dependencies=[_read_roles])
def bulk_export(data: BulkExportRequest, db: DbDep):
    import csv as csv_mod, io
    if not data.ids:
        return Response(content="", media_type="text/csv")

    cis = db.scalars(
        select(CI)
        .where(CI.id.in_(data.ids), CI.deleted_at.is_(None))
    ).all()

    buf = io.StringIO()
    w = csv_mod.writer(buf)
    w.writerow([
        "ci_type", "name", "description", "status", "criticality", "team", "location",
        "manufacturer", "model", "serial_number", "hw_subtype", "os_name", "os_version",
        "purchase_date", "warranty_end_date", "supplier", "purchase_price",
        "vendor", "product", "version", "license_type", "license_end_date",
        "eol_date", "install_count", "is_internal",
    ])
    for ci in cis:
        hw = ci.hardware_details
        sw = ci.software_details
        w.writerow([
            ci.ci_type, ci.name, ci.description or "", ci.status, ci.criticality,
            ci.team or "", ci.location or "",
            (hw.manufacturer or "") if hw else "", (hw.model or "") if hw else "",
            (hw.serial_number or "") if hw else "", (hw.hw_subtype or "") if hw else "",
            (hw.os_name or "") if hw else "", (hw.os_version or "") if hw else "",
            (str(hw.purchase_date) if hw.purchase_date else "") if hw else "",
            (str(hw.warranty_end_date) if hw.warranty_end_date else "") if hw else "",
            (hw.supplier or "") if hw else "", (str(hw.purchase_price) if hw.purchase_price else "") if hw else "",
            (sw.vendor or "") if sw else "", (sw.product or "") if sw else "",
            (sw.version or "") if sw else "", (sw.license_type or "") if sw else "",
            (str(sw.license_end_date) if sw.license_end_date else "") if sw else "",
            (str(sw.eol_date) if sw.eol_date else "") if sw else "",
            (str(sw.install_count) if sw.install_count is not None else "") if sw else "",
            ("true" if sw.is_internal else "false") if sw else "",
        ])

    content = "﻿".encode() + buf.getvalue().encode("utf-8")
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="export_selection.csv"'},
    )


@router.post("/", response_model=CIOut, status_code=status.HTTP_201_CREATED,
             dependencies=[_write_roles])
def create_ci(data: CICreate, db: DbDep, user: CurrentUser):
    ci = service.create_ci(db, data)
    from app.audit import service as audit_svc
    audit_svc.record(db, "ci", str(ci.id), ci.name, "create", {}, user)
    db.commit()
    return ci


@router.get("/{ci_id}", response_model=CIOut, dependencies=[_read_roles])
def get_ci(ci_id: uuid.UUID, db: DbDep):
    ci = service.get_ci(db, ci_id)
    if not ci:
        raise HTTPException(status_code=404, detail="CI introuvable")
    return ci


@router.patch("/{ci_id}", response_model=CIOut, dependencies=[_write_roles])
def update_ci(ci_id: uuid.UUID, data: CIUpdate, db: DbDep, user: CurrentUser):
    ci = service.get_ci(db, ci_id)
    if not ci:
        raise HTTPException(status_code=404, detail="CI introuvable")
    changes = _diff_ci(ci, data)
    updated = service.update_ci(db, ci, data)
    if changes:
        from app.audit import service as audit_svc
        audit_svc.record(db, "ci", str(updated.id), updated.name, "update", changes, user)
        db.commit()
    return updated


@router.delete("/{ci_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[_ci_delete])
def delete_ci(ci_id: uuid.UUID, db: DbDep, user: CurrentUser):
    ci = service.get_ci(db, ci_id)
    if not ci:
        raise HTTPException(status_code=404, detail="CI introuvable")
    name = ci.name
    ci_id_str = str(ci.id)
    service.delete_ci(db, ci)
    from app.audit import service as audit_svc
    audit_svc.record(db, "ci", ci_id_str, name, "delete", {}, user)
    db.commit()


# ── Relations ─────────────────────────────────────────────────────────────────

@router.get("/{ci_id}/relations", response_model=list[CIRelationOut], dependencies=[_read_roles])
def list_relations(ci_id: uuid.UUID, db: DbDep):
    return service.list_relations(db, ci_id)


@router.post("/{ci_id}/relations", response_model=CIRelationOut,
             status_code=status.HTTP_201_CREATED, dependencies=[_write_roles])
def create_relation(ci_id: uuid.UUID, data: CIRelationCreate, db: DbDep):
    ci = service.get_ci(db, ci_id)
    if not ci:
        raise HTTPException(status_code=404, detail="CI source introuvable")
    target = service.get_ci(db, data.target_ci_id)
    if not target:
        raise HTTPException(status_code=404, detail="CI cible introuvable")
    if ci_id == data.target_ci_id:
        raise HTTPException(status_code=400, detail="Un CI ne peut pas se référencer lui-même")
    rel = service.create_relation(db, ci_id, data)
    return {
        "id": rel.id,
        "source_ci_id": rel.source_ci_id,
        "source_ci_name": ci.name,
        "target_ci_id": rel.target_ci_id,
        "target_ci_name": target.name,
        "relation_type": rel.relation_type,
        "created_at": rel.created_at,
    }


@router.delete("/{ci_id}/relations/{relation_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[_write_roles])
def delete_relation(ci_id: uuid.UUID, relation_id: uuid.UUID, db: DbDep):
    if not service.delete_relation(db, relation_id, ci_id):
        raise HTTPException(status_code=404, detail="Relation introuvable")


# ── Maintenances ──────────────────────────────────────────────────────────────

@router.get("/{ci_id}/maintenance", response_model=list[MaintenanceScheduleOut],
            dependencies=[_read_roles])
def list_maintenance(ci_id: uuid.UUID, db: DbDep):
    ci = service.get_ci(db, ci_id)
    if not ci:
        raise HTTPException(status_code=404, detail="CI introuvable")
    return service.list_schedules(db, ci_id)


@router.post("/{ci_id}/maintenance", response_model=MaintenanceScheduleOut,
             status_code=status.HTTP_201_CREATED, dependencies=[_write_roles])
def create_maintenance(ci_id: uuid.UUID, data: MaintenanceScheduleCreate, db: DbDep):
    ci = service.get_ci(db, ci_id)
    if not ci:
        raise HTTPException(status_code=404, detail="CI introuvable")
    return service.create_schedule(db, ci_id, data)


@router.post("/{ci_id}/maintenance/{schedule_id}/log",
             response_model=MaintenanceLogOut, status_code=status.HTTP_201_CREATED,
             dependencies=[_write_roles])
def log_maintenance(
    ci_id: uuid.UUID, schedule_id: uuid.UUID,
    data: MaintenanceLogCreate, db: DbDep, user: CurrentUser,
):
    ci = service.get_ci(db, ci_id)
    if not ci:
        raise HTTPException(status_code=404, detail="CI introuvable")
    return service.log_maintenance(db, schedule_id, ci_id, user.id, data.notes)


@router.patch("/{ci_id}/maintenance/{schedule_id}", response_model=MaintenanceScheduleOut,
              dependencies=[_write_roles])
def update_maintenance(ci_id: uuid.UUID, schedule_id: uuid.UUID, data: MaintenanceScheduleUpdate, db: DbDep):
    sched = service.update_schedule(db, schedule_id, ci_id, data)
    if not sched:
        raise HTTPException(status_code=404, detail="Maintenance introuvable")
    return sched


@router.delete("/{ci_id}/maintenance/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[_write_roles])
def delete_maintenance(ci_id: uuid.UUID, schedule_id: uuid.UUID, db: DbDep):
    if not service.delete_schedule(db, schedule_id, ci_id):
        raise HTTPException(status_code=404, detail="Maintenance introuvable")


# ── Maintenances globales ─────────────────────────────────────────────────────

@maintenance_router.get("/", response_model=list[MaintenanceGlobalItem],
                        dependencies=[require_perm("ci", "read")])
def list_global_maintenance(
    db: DbDep,
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    kind: Optional[str] = Query(None),
):
    return service.list_all_schedules(db, from_date, to_date, kind)


class MaintenanceImportError(BaseModel):
    row: int
    ci_name: str
    message: str

class MaintenanceImportResult(BaseModel):
    created: int
    errors: list[MaintenanceImportError]


@maintenance_router.post("/import", response_model=MaintenanceImportResult,
                         dependencies=[require_perm("changes", "write")])
async def import_maintenance_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    import csv, io as _io
    from app.auth.models import User as UserModel
    from app.cmdb.schemas import MaintenanceScheduleCreate as MSCreate

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except Exception:
        text = content.decode("latin-1")

    reader = csv.DictReader(_io.StringIO(text))
    VALID_KINDS = {"maintenance", "update", "patch", "audit"}
    created = 0
    errors: list[dict] = []

    for i, row in enumerate(reader, start=2):
        ci_name       = (row.get("ci_name") or "").strip()
        title         = (row.get("title") or "").strip()
        kind_val      = (row.get("kind") or "maintenance").strip().lower()
        date_str      = (row.get("date") or "").strip()
        rrule_val     = (row.get("rrule") or "").strip() or None
        assignee_mail = (row.get("assignee_email") or "").strip() or None

        def _err(msg: str):
            errors.append({"row": i, "ci_name": ci_name, "message": msg})

        if not ci_name:
            _err("ci_name requis"); continue
        if not title:
            _err("title requis"); continue
        if kind_val not in VALID_KINDS:
            _err(f"kind invalide — valeurs acceptées : {', '.join(sorted(VALID_KINDS))}"); continue

        try:
            from datetime import date as date_cls
            next_due = date_cls.fromisoformat(date_str)
        except ValueError:
            _err(f"date invalide (attendu YYYY-MM-DD) : {date_str!r}"); continue

        ci = db.scalar(
            select(CI).where(
                func.lower(CI.name) == ci_name.lower(),
                CI.deleted_at.is_(None),
            )
        )
        if not ci:
            _err("CI introuvable — vérifiez le nom exact"); continue

        assigned_to = None
        if assignee_mail:
            u = db.scalar(
                select(UserModel).where(func.lower(UserModel.email) == assignee_mail.lower())
            )
            if u:
                assigned_to = u.id

        data = MSCreate(
            title=title, kind=kind_val,
            next_due_date=next_due,
            rrule=rrule_val,
            remind_days=[30, 7],
            assigned_to=assigned_to,
        )
        service.create_schedule(db, ci.id, data)
        created += 1

    return {"created": created, "errors": errors}


# ── SLA ───────────────────────────────────────────────────────────────────────

class SlaContractOut(BaseModel):
    id: uuid.UUID
    name: str
    provider: Optional[str]
    level: Optional[str]
    contract_ref: Optional[str]
    support_contact: Optional[str]
    response_time: Optional[str]
    contract_end_date: Optional[date]
    notes: Optional[str]
    ci_count: int
    days_until_expiry: Optional[int]
    expiry_status: str   # "ok" | "warning" | "critical" | "expired" | "no_date"


class SlaDashboard(BaseModel):
    total: int
    active: int
    expiring_30d: int
    expiring_90d: int
    expired: int
    cis_without_sla: int
    contracts: list[SlaContractOut]


@sla_router.get("/dashboard", response_model=SlaDashboard, dependencies=[_sla_read])
def sla_dashboard(db: DbDep):
    from datetime import date as date_cls
    today = date_cls.today()

    slas = service.list_slas(db)

    # Batch-load CI counts par SLA
    ci_counts_rows = db.execute(
        select(CI.sla_id, func.count()).where(
            CI.sla_id.isnot(None), CI.deleted_at.is_(None)
        ).group_by(CI.sla_id)
    ).all()
    ci_counts: dict[uuid.UUID, int] = {r[0]: r[1] for r in ci_counts_rows}

    cis_without_sla = db.execute(
        select(func.count()).select_from(CI).where(
            CI.sla_id.is_(None), CI.deleted_at.is_(None)
        )
    ).scalar_one()

    contracts: list[SlaContractOut] = []
    active = expired = expiring_30 = expiring_90 = 0

    for sla in slas:
        end = sla.contract_end_date
        days: Optional[int] = None
        status_str = "no_date"

        if end:
            days = (end - today).days
            if days < 0:
                status_str = "expired"
                expired += 1
            elif days <= 30:
                status_str = "critical"
                expiring_30 += 1
                expiring_90 += 1
                active += 1
            elif days <= 90:
                status_str = "warning"
                expiring_90 += 1
                active += 1
            else:
                status_str = "ok"
                active += 1
        else:
            active += 1

        contracts.append(SlaContractOut(
            id=sla.id,
            name=sla.name,
            provider=sla.provider,
            level=sla.level,
            contract_ref=sla.contract_ref,
            support_contact=sla.support_contact,
            response_time=sla.response_time,
            contract_end_date=end,
            notes=sla.notes,
            ci_count=ci_counts.get(sla.id, 0),
            days_until_expiry=days,
            expiry_status=status_str,
        ))

    contracts.sort(key=lambda c: (
        {"expired": 0, "critical": 1, "warning": 2, "ok": 3, "no_date": 4}.get(c.expiry_status, 5),
        c.days_until_expiry if c.days_until_expiry is not None else 9999,
    ))

    return SlaDashboard(
        total=len(slas),
        active=active,
        expiring_30d=expiring_30,
        expiring_90d=expiring_90,
        expired=expired,
        cis_without_sla=cis_without_sla,
        contracts=contracts,
    )


@sla_router.get("/", response_model=list[SlaOut], dependencies=[_sla_read])
def list_slas(db: DbDep):
    return service.list_slas(db)


@sla_router.post("/", response_model=SlaOut, status_code=status.HTTP_201_CREATED,
                 dependencies=[_sla_write])
def create_sla(data: SlaCreate, db: DbDep):
    return service.create_sla(db, data)


@sla_router.get("/{sla_id}", response_model=SlaOut, dependencies=[_sla_read])
def get_sla(sla_id: uuid.UUID, db: DbDep):
    sla = service.get_sla(db, sla_id)
    if not sla:
        raise HTTPException(status_code=404, detail="SLA introuvable")
    return sla


@sla_router.patch("/{sla_id}", response_model=SlaOut, dependencies=[_sla_write])
def update_sla(sla_id: uuid.UUID, data: SlaUpdate, db: DbDep):
    sla = service.get_sla(db, sla_id)
    if not sla:
        raise HTTPException(status_code=404, detail="SLA introuvable")
    return service.update_sla(db, sla, data)


@sla_router.delete("/{sla_id}", status_code=status.HTTP_204_NO_CONTENT,
                   dependencies=[require_role("admin")])
def delete_sla(sla_id: uuid.UUID, db: DbDep):
    sla = service.get_sla(db, sla_id)
    if not sla:
        raise HTTPException(status_code=404, detail="SLA introuvable")
    service.delete_sla(db, sla)
