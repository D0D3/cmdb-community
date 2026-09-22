"""
Routers réseau (/api/network-segments et /api/ci/{id}/network-segments).
  CRUD segments, export/import CSV, assignation CI ↔ segment.
  Import CSV : upsert par nom (update si existe, create sinon), BOM Excel géré.
"""
import csv
import io
import uuid
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import require_role, require_perm
from app.network.models import NetworkSegment, CINetworkSegment, DEFAULT_COLORS, SEGMENT_TYPES

router = APIRouter(prefix="/api/network-segments", tags=["réseau"])
ci_net_router = APIRouter(prefix="/api/ci", tags=["réseau"])

DbDep = Annotated[Session, Depends(get_db)]
_admin = require_role("admin")
_read  = require_perm("network", "read")
_write = require_perm("network", "write")

CSV_FIELDS = ["name", "type", "vlan_id", "subnet", "description", "color"]


class SegmentIn(BaseModel):
    name: str
    type: str = "vlan"
    vlan_id: Optional[int] = None
    subnet: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class SegmentOut(BaseModel):
    id: str
    name: str
    type: str
    vlan_id: Optional[int] = None
    subnet: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    resolved_color: str
    ci_count: int = 0


class ImportResult(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[str]


def _seg_out(s: NetworkSegment) -> SegmentOut:
    return SegmentOut(
        id=str(s.id),
        name=s.name,
        type=s.seg_type,
        vlan_id=s.vlan_id,
        subnet=s.subnet,
        description=s.description,
        color=s.color,
        resolved_color=s.resolved_color(),
        ci_count=len(s.ci_links),
    )


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[SegmentOut], dependencies=[_read])
def list_segments(db: DbDep):
    return [_seg_out(s) for s in db.query(NetworkSegment).order_by(NetworkSegment.name).all()]


@router.post("", response_model=SegmentOut, dependencies=[_admin])
def create_segment(data: SegmentIn, db: DbDep):
    if data.type not in SEGMENT_TYPES:
        raise HTTPException(400, "Type de segment invalide")
    if db.query(NetworkSegment).filter(NetworkSegment.name == data.name).first():
        raise HTTPException(400, "Un segment avec ce nom existe déjà")
    seg = NetworkSegment(
        name=data.name, seg_type=data.type,
        vlan_id=data.vlan_id, subnet=data.subnet,
        description=data.description, color=data.color,
    )
    db.add(seg)
    db.commit()
    db.refresh(seg)
    return _seg_out(seg)


@router.patch("/{seg_id}", response_model=SegmentOut, dependencies=[_admin])
def update_segment(seg_id: uuid.UUID, data: SegmentIn, db: DbDep):
    seg = db.get(NetworkSegment, seg_id)
    if not seg:
        raise HTTPException(404, "Segment introuvable")
    if data.type not in SEGMENT_TYPES:
        raise HTTPException(400, "Type de segment invalide")
    dup = db.query(NetworkSegment).filter(
        NetworkSegment.name == data.name,
        NetworkSegment.id != seg_id,
    ).first()
    if dup:
        raise HTTPException(400, "Un segment avec ce nom existe déjà")
    seg.name = data.name
    seg.seg_type = data.type
    seg.vlan_id = data.vlan_id
    seg.subnet = data.subnet
    seg.description = data.description
    seg.color = data.color
    db.commit()
    db.refresh(seg)
    return _seg_out(seg)


@router.delete("/{seg_id}", dependencies=[_admin])
def delete_segment(seg_id: uuid.UUID, db: DbDep):
    seg = db.get(NetworkSegment, seg_id)
    if not seg:
        raise HTTPException(404, "Segment introuvable")
    db.delete(seg)
    db.commit()
    return {"ok": True}


# ── Export CSV ────────────────────────────────────────────────────────────────

@router.get("/export", dependencies=[_admin])
def export_segments(db: DbDep):
    """Exporte tous les segments réseau au format CSV."""
    segs = db.query(NetworkSegment).order_by(NetworkSegment.name).all()
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_FIELDS)
    writer.writeheader()
    for s in segs:
        writer.writerow({
            "name":        s.name,
            "type":        s.seg_type,
            "vlan_id":     s.vlan_id if s.vlan_id is not None else "",
            "subnet":      s.subnet or "",
            "description": s.description or "",
            "color":       s.color or "",
        })
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=segments_reseau.csv"},
    )


# ── Import CSV ────────────────────────────────────────────────────────────────

@router.post("/import", response_model=ImportResult, dependencies=[_admin])
async def import_segments(db: DbDep, file: UploadFile = File(...)):
    """Importe des segments depuis un fichier CSV.
    Comportement : mise à jour si le nom existe déjà, création sinon.
    Les segments non présents dans le fichier sont conservés.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # gère le BOM Excel
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "name" not in reader.fieldnames:
        raise HTTPException(400, "Fichier CSV invalide — colonne 'name' requise")

    created = updated = skipped = 0
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):  # line 1 = header
        name = (row.get("name") or "").strip()
        if not name:
            skipped += 1
            continue

        seg_type = (row.get("type") or "vlan").strip().lower()
        if seg_type not in SEGMENT_TYPES:
            errors.append(f"Ligne {i} — type invalide « {seg_type} » (ignoré)")
            skipped += 1
            continue

        vlan_raw = (row.get("vlan_id") or "").strip()
        try:
            vlan_id = int(vlan_raw) if vlan_raw else None
        except ValueError:
            vlan_id = None

        subnet = (row.get("subnet") or "").strip() or None
        description = (row.get("description") or "").strip() or None
        color_raw = (row.get("color") or "").strip()
        color = color_raw if color_raw.startswith("#") else None

        existing = db.query(NetworkSegment).filter(NetworkSegment.name == name).first()
        if existing:
            existing.seg_type = seg_type
            existing.vlan_id = vlan_id
            existing.subnet = subnet
            existing.description = description
            existing.color = color
            updated += 1
        else:
            db.add(NetworkSegment(
                name=name, seg_type=seg_type, vlan_id=vlan_id,
                subnet=subnet, description=description, color=color,
            ))
            created += 1

    db.commit()
    return ImportResult(created=created, updated=updated, skipped=skipped, errors=errors)


# ── CI ↔ Segment ─────────────────────────────────────────────────────────────

@ci_net_router.get("/{ci_id}/network-segments", response_model=list[SegmentOut], dependencies=[_read])
def get_ci_segments(ci_id: uuid.UUID, db: DbDep):
    links = db.query(CINetworkSegment).filter(CINetworkSegment.ci_id == ci_id).all()
    return [_seg_out(link.segment) for link in links]


@ci_net_router.post("/{ci_id}/network-segments/{seg_id}", dependencies=[_write])
def assign_segment(ci_id: uuid.UUID, seg_id: uuid.UUID, db: DbDep):
    if not db.get(NetworkSegment, seg_id):
        raise HTTPException(404, "Segment introuvable")
    if not db.get(CINetworkSegment, (ci_id, seg_id)):
        db.add(CINetworkSegment(ci_id=ci_id, segment_id=seg_id))
        db.commit()
    return {"ok": True}


@ci_net_router.delete("/{ci_id}/network-segments/{seg_id}", dependencies=[_write])
def unassign_segment(ci_id: uuid.UUID, seg_id: uuid.UUID, db: DbDep):
    link = db.get(CINetworkSegment, (ci_id, seg_id))
    if link:
        db.delete(link)
        db.commit()
    return {"ok": True}
