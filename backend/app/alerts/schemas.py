import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, HttpUrl


# ── Alertes ───────────────────────────────────────────────────────────────────

class AlertOut(BaseModel):
    id: uuid.UUID
    kind: str
    severity: str
    title: str
    body: Optional[str]
    ci_id: Optional[uuid.UUID]
    cve_id: Optional[str]
    dedup_key: str
    resolved_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}

    @property
    def is_open(self) -> bool:
        return self.resolved_at is None


class AlertList(BaseModel):
    total: int
    items: list[AlertOut]


class AlertStats(BaseModel):
    open: int
    critical: int
    warning: int
    info_count: int  # "info" est un mot réservé Python


# ── Échéances ─────────────────────────────────────────────────────────────────

class DeadlineOut(BaseModel):
    ci_id: Optional[uuid.UUID]
    ci_name: str
    ci_type: Optional[str]
    deadline_type: str
    deadline_label: str
    deadline_date: date
    days_remaining: int
    severity: str  # critical / warning / info


class DeadlineList(BaseModel):
    total: int
    items: list[DeadlineOut]


# ── Webhooks ──────────────────────────────────────────────────────────────────

class WebhookCreate(BaseModel):
    name: str
    url: str
    secret: str = ""
    event_filter: str = "*"


class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    secret: Optional[str] = None
    is_active: Optional[bool] = None
    event_filter: Optional[str] = None


class WebhookOut(BaseModel):
    id: uuid.UUID
    name: str
    url: str
    is_active: bool
    event_filter: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeliveryOut(BaseModel):
    id: uuid.UUID
    endpoint_id: uuid.UUID
    alert_id: Optional[uuid.UUID]
    status_code: Optional[int]
    success: bool
    attempt: int
    delivered_at: datetime

    model_config = {"from_attributes": True}
