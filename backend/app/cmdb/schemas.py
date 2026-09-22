"""Schémas Pydantic CMDB : CIHardwareIn/Out, CISoftwareIn/Out, CIRelationIn/Out, filtres liste."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Literal
from pydantic import BaseModel, field_validator


# ── Détails matériel ─────────────────────────────────────────────────────────

class HardwareDetailIn(BaseModel):
    hw_subtype:         Optional[Literal["server", "vm", "workstation", "terminal_server", "network_device"]] = None
    os_name:            Optional[str]     = None
    os_version:         Optional[str]     = None
    os_build:           Optional[str]     = None
    manufacturer:       Optional[str]     = None
    model:              Optional[str]     = None
    serial_number:      Optional[str]     = None
    purchase_date:      Optional[date]    = None
    warranty_end_date:  Optional[date]    = None
    supplier:           Optional[str]     = None
    purchase_price:     Optional[Decimal] = None
    # M41
    ip_address:         Optional[str]     = None
    host_ci_id:         Optional[uuid.UUID] = None
    acquisition_type:   Optional[Literal["purchase", "leasing", "rental"]] = None
    leasing_provider:   Optional[str]     = None
    leasing_start_date: Optional[date]    = None
    leasing_end_date:   Optional[date]    = None
    monthly_cost:       Optional[Decimal] = None


class HardwareDetailOut(HardwareDetailIn):
    hw_subtype:       Optional[str] = None  # output accepte toute valeur DB
    acquisition_type: Optional[str] = None
    model_config = {"from_attributes": True}


# ── Détails logiciel ─────────────────────────────────────────────────────────

class SoftwareDetailIn(BaseModel):
    vendor:            Optional[str]  = None
    product:           str
    version:           Optional[str]  = None
    cpe_name:          Optional[str]  = None
    is_internal:       bool           = False
    license_type:      Optional[str]  = None
    license_end_date:  Optional[date] = None
    eol_date:          Optional[date] = None
    install_count:     Optional[int]  = None
    max_seats:         Optional[int]  = None
    # M40
    license_subtype:   Optional[Literal["perpetual", "subscription", "saas", "oem", "academic", "open_source"]] = None
    license_key:       Optional[str]          = None
    pack_id:           Optional[uuid.UUID]    = None
    # M41
    integrator_name:   Optional[str] = None
    integrator_contact: Optional[str] = None
    integrator_phone:  Optional[str] = None
    integrator_email:  Optional[str] = None
    # OSV
    osv_ecosystem:     Optional[str] = None
    osv_package:       Optional[str] = None


class SoftwareDetailOut(SoftwareDetailIn):
    license_subtype: Optional[str] = None  # output accepte toute valeur DB
    model_config = {"from_attributes": True}


# ── CI ────────────────────────────────────────────────────────────────────────

CIType = Literal["hardware", "software"]
CIStatus = Literal["ordered", "in_stock", "in_service", "maintenance", "retired"]
CICriticality = Literal["low", "medium", "high", "critical"]


class CICreate(BaseModel):
    ci_type: CIType
    name: str
    description: Optional[str] = None
    status: CIStatus = "in_service"
    criticality: CICriticality = "medium"
    owner_id: Optional[uuid.UUID] = None
    team: Optional[str] = None
    location: Optional[str] = None
    sla_id: Optional[uuid.UUID] = None
    attributes: dict = {}
    hardware: Optional[HardwareDetailIn] = None
    software: Optional[SoftwareDetailIn] = None

    @field_validator("hardware", mode="after")
    @classmethod
    def hw_only_if_hardware(cls, v, info):
        if v is not None and info.data.get("ci_type") != "hardware":
            raise ValueError("hardware uniquement pour ci_type='hardware'")
        return v

    @field_validator("software", mode="after")
    @classmethod
    def sw_only_if_software(cls, v, info):
        if v is not None and info.data.get("ci_type") != "software":
            raise ValueError("software uniquement pour ci_type='software'")
        return v


class CIUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[CIStatus] = None
    criticality: Optional[CICriticality] = None
    owner_id: Optional[uuid.UUID] = None
    team: Optional[str] = None
    location: Optional[str] = None
    sla_id: Optional[uuid.UUID] = None
    attributes: Optional[dict] = None
    hardware: Optional[HardwareDetailIn] = None
    software: Optional[SoftwareDetailIn] = None


class CIOut(BaseModel):
    id: uuid.UUID
    ci_type: str
    name: str
    description: Optional[str]
    status: str
    criticality: str
    owner_id: Optional[uuid.UUID]
    team: Optional[str]
    location: Optional[str]
    sla_id: Optional[uuid.UUID]
    attributes: dict
    created_at: datetime
    updated_at: datetime
    hardware_details: Optional[HardwareDetailOut] = None
    software_details: Optional[SoftwareDetailOut] = None
    cve_count: int = 0

    model_config = {"from_attributes": True}


class CIList(BaseModel):
    total: int
    items: list[CIOut]


# ── Relations ─────────────────────────────────────────────────────────────────

RelationType = Literal["hosted_on", "depends_on", "assigned_to", "connected_to"]


class CIRelationCreate(BaseModel):
    target_ci_id: uuid.UUID
    relation_type: RelationType


class CIRelationOut(BaseModel):
    id: uuid.UUID
    source_ci_id: uuid.UUID
    source_ci_name: str
    target_ci_id: uuid.UUID
    target_ci_name: str
    relation_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── SLA ───────────────────────────────────────────────────────────────────────

class SlaCreate(BaseModel):
    name: str
    level: Optional[str] = None
    contract_ref: Optional[str] = None
    provider: Optional[str] = None
    support_contact: Optional[str] = None
    response_time: Optional[str] = None
    contract_end_date: Optional[date] = None
    notes: Optional[str] = None


class SlaUpdate(SlaCreate):
    name: Optional[str] = None


class SlaOut(SlaCreate):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Maintenances ──────────────────────────────────────────────────────────────

class MaintenanceScheduleCreate(BaseModel):
    title: str
    kind: Literal["maintenance", "update", "patch", "audit"] = "maintenance"
    rrule: Optional[str] = None
    next_due_date: date
    remind_days: list[int] = [30, 7]
    assigned_to: Optional[uuid.UUID] = None


class MaintenanceScheduleOut(MaintenanceScheduleCreate):
    id: uuid.UUID
    ci_id: uuid.UUID
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MaintenanceLogCreate(BaseModel):
    notes: Optional[str] = None


class MaintenanceScheduleUpdate(BaseModel):
    title: Optional[str] = None
    kind: Optional[Literal["maintenance", "update", "patch", "audit"]] = None
    next_due_date: Optional[date] = None
    rrule: Optional[str] = None
    remind_days: Optional[list[int]] = None
    assigned_to: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class MaintenanceGlobalItem(BaseModel):
    id: uuid.UUID
    ci_id: uuid.UUID
    ci_name: str
    ci_type: str
    title: str
    kind: str
    next_due_date: date
    rrule: Optional[str]
    remind_days: list[int]
    assigned_to: Optional[uuid.UUID]
    assignee_name: Optional[str]
    is_active: bool
    created_at: datetime


class MaintenanceLogOut(BaseModel):
    id: uuid.UUID
    schedule_id: Optional[uuid.UUID]
    ci_id: uuid.UUID
    performed_at: datetime
    performed_by: Optional[uuid.UUID]
    notes: Optional[str]

    model_config = {"from_attributes": True}
