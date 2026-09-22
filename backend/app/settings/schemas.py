"""Schémas Pydantic paramètres (timezone, format date/nb/monnaie), listes de référence, packs licence."""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

# ── App Settings ──────────────────────────────────────────────────────────────

class SettingOut(BaseModel):
    key: str
    value: Optional[str]
    updated_at: datetime
    model_config = {"from_attributes": True}

class SettingsPatch(BaseModel):
    timezone:      Optional[str] = None
    date_format:   Optional[str] = None
    number_format: Optional[str] = None
    currency:      Optional[str] = None

class SettingsOut(BaseModel):
    timezone:      str
    date_format:   str
    number_format: str
    currency:      str


# ── Reference Lists ───────────────────────────────────────────────────────────

class RefItemCreate(BaseModel):
    category: str
    value: str
    sort_order: int = 0

class RefItemUpdate(BaseModel):
    value:      Optional[str] = None
    sort_order: Optional[int] = None
    active:     Optional[bool] = None

class RefItemOut(BaseModel):
    id:         uuid.UUID
    category:   str
    value:      str
    sort_order: int
    active:     bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ── License Packs ─────────────────────────────────────────────────────────────

class LicensePackCreate(BaseModel):
    name:        str
    license_key: Optional[str] = None
    total_seats: Optional[int] = None
    notes:       Optional[str] = None

class LicensePackUpdate(BaseModel):
    name:        Optional[str] = None
    license_key: Optional[str] = None
    total_seats: Optional[int] = None
    notes:       Optional[str] = None

class LicensePackOut(BaseModel):
    id:          uuid.UUID
    name:        str
    license_key: Optional[str]
    total_seats: Optional[int]
    notes:       Optional[str]
    created_at:  datetime
    updated_at:  datetime
    assigned_count: int = 0
    assigned_seats: int = 0
    model_config = {"from_attributes": True}
