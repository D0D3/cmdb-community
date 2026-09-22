"""
Routers paramètres (/api/settings, /api/reflists, /api/license-packs).
  settings_router : timezone, date_format, number_format, currency.
  reflist_router  : CRUD des listes de référence (équipes, fournisseurs, localisations…).
  packs_router    : packs de licences logicielles avec comptage d'assignations.
"""
from __future__ import annotations
import uuid
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin, get_current_user
from app.auth.models import User
from app.settings.models import AppSetting, ReferenceListItem
from app.cmdb.models import LicensePack, SoftwareDetail
from app.settings.schemas import (
    SettingsPatch, SettingsOut,
    RefItemCreate, RefItemUpdate, RefItemOut,
    LicensePackCreate, LicensePackUpdate, LicensePackOut,
)

settings_router = APIRouter(prefix="/api/settings", tags=["settings"])
reflist_router  = APIRouter(prefix="/api/reflists",  tags=["reference-lists"])
packs_router    = APIRouter(prefix="/api/license-packs", tags=["license-packs"])

_DEFAULTS: dict[str, str] = {
    "timezone":      "Europe/Paris",
    "date_format":   "DD/MM/YYYY",
    "number_format": "FR",
    "currency":      "EUR",
}

REFLIST_CATEGORIES = Literal[
    "team", "vendor", "manufacturer", "product",
    "location", "acquisition_type", "leasing_provider"
]


def _get_setting(db: Session, key: str) -> str:
    row = db.get(AppSetting, key)
    return row.value if row else _DEFAULTS.get(key, "")


def _set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))


# ── Settings ──────────────────────────────────────────────────────────────────

@settings_router.get("", response_model=SettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return SettingsOut(
        timezone=      _get_setting(db, "timezone"),
        date_format=   _get_setting(db, "date_format"),
        number_format= _get_setting(db, "number_format"),
        currency=      _get_setting(db, "currency"),
    )


@settings_router.patch("", response_model=SettingsOut)
def patch_settings(
    body: SettingsPatch,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    for key, val in body.model_dump(exclude_none=True).items():
        _set_setting(db, key, val)
    db.commit()
    return get_settings(db)


# ── Reference lists ───────────────────────────────────────────────────────────

@reflist_router.get("", response_model=list[RefItemOut])
def list_refitems(
    category: str | None = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(ReferenceListItem)
    if category:
        q = q.where(ReferenceListItem.category == category)
    if active_only:
        q = q.where(ReferenceListItem.active == True)  # noqa: E712
    q = q.order_by(ReferenceListItem.category, ReferenceListItem.sort_order, ReferenceListItem.value)
    return db.scalars(q).all()


@reflist_router.post("", response_model=RefItemOut, status_code=201)
def create_refitem(
    body: RefItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    item = ReferenceListItem(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@reflist_router.patch("/{item_id}", response_model=RefItemOut)
def update_refitem(
    item_id: uuid.UUID,
    body: RefItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    item = db.get(ReferenceListItem, item_id)
    if not item:
        raise HTTPException(404, "Item introuvable")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@reflist_router.delete("/{item_id}", status_code=204)
def delete_refitem(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    item = db.get(ReferenceListItem, item_id)
    if not item:
        raise HTTPException(404, "Item introuvable")
    db.delete(item)
    db.commit()


# ── License Packs ─────────────────────────────────────────────────────────────

def _pack_out(pack: LicensePack, db: Session) -> LicensePackOut:
    assigned = db.scalars(
        select(SoftwareDetail).where(SoftwareDetail.pack_id == pack.id)
    ).all()
    return LicensePackOut(
        id=pack.id,
        name=pack.name,
        license_key=pack.license_key,
        total_seats=pack.total_seats,
        notes=pack.notes,
        created_at=pack.created_at,
        updated_at=pack.updated_at,
        assigned_count=len(assigned),
        assigned_seats=sum(s.max_seats or 0 for s in assigned),
    )


@packs_router.get("", response_model=list[LicensePackOut])
def list_packs(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    packs = db.scalars(select(LicensePack).order_by(LicensePack.name)).all()
    return [_pack_out(p, db) for p in packs]


@packs_router.post("", response_model=LicensePackOut, status_code=201)
def create_pack(
    body: LicensePackCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    pack = LicensePack(**body.model_dump())
    db.add(pack)
    db.commit()
    db.refresh(pack)
    return _pack_out(pack, db)


@packs_router.patch("/{pack_id}", response_model=LicensePackOut)
def update_pack(
    pack_id: uuid.UUID,
    body: LicensePackUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    pack = db.get(LicensePack, pack_id)
    if not pack:
        raise HTTPException(404, "Pack introuvable")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(pack, k, v)
    db.commit()
    db.refresh(pack)
    return _pack_out(pack, db)


@packs_router.delete("/{pack_id}", status_code=204)
def delete_pack(
    pack_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    pack = db.get(LicensePack, pack_id)
    if not pack:
        raise HTTPException(404, "Pack introuvable")
    db.scalars(select(SoftwareDetail).where(SoftwareDetail.pack_id == pack_id)).all()
    for sw in db.scalars(select(SoftwareDetail).where(SoftwareDetail.pack_id == pack_id)).all():
        sw.pack_id = None
    db.delete(pack)
    db.commit()
