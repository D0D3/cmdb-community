import uuid
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel

IncidentSeverity = Literal['low', 'medium', 'high', 'critical']
IncidentStatus   = Literal['open', 'investigating', 'resolved', 'closed']


class IncidentCommentOut(BaseModel):
    id: uuid.UUID
    author_id: Optional[uuid.UUID]
    author_name: Optional[str]
    body: str
    created_at: datetime
    model_config = {"from_attributes": True}


class IncidentHistoryOut(BaseModel):
    id: uuid.UUID
    author_id: Optional[uuid.UUID]
    author_name: Optional[str]
    from_status: str
    to_status: str
    comment: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class IncidentCILink(BaseModel):
    ci_id: uuid.UUID
    ci_name: str
    ci_type: str


class IncidentOut(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str]
    severity: IncidentSeverity
    status: IncidentStatus
    reporter_id: Optional[uuid.UUID]
    reporter_name: Optional[str]
    assignee_id: Optional[uuid.UUID]
    assignee_name: Optional[str]
    resolved_at: Optional[datetime]
    closed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    external_ticket_url: Optional[str] = None
    ci_links: list[IncidentCILink] = []
    comments: list[IncidentCommentOut] = []
    history: list[IncidentHistoryOut] = []
    model_config = {"from_attributes": True}


class IncidentSummary(BaseModel):
    id: uuid.UUID
    title: str
    severity: IncidentSeverity
    status: IncidentStatus
    reporter_name: Optional[str]
    assignee_name: Optional[str]
    ci_count: int
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime]
    model_config = {"from_attributes": True}


class IncidentList(BaseModel):
    items: list[IncidentSummary]
    total: int


class IncidentStats(BaseModel):
    open: int
    investigating: int
    resolved: int
    closed: int
    critical: int
    high: int
    mttr_hours: Optional[float]   # mean time to resolve en heures


class IncidentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    severity: IncidentSeverity = 'medium'
    assignee_id: Optional[uuid.UUID] = None
    ci_ids: list[uuid.UUID] = []


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[IncidentSeverity] = None
    assignee_id: Optional[uuid.UUID] = None
    ci_ids: Optional[list[uuid.UUID]] = None
    external_ticket_url: Optional[str] = None


class IncidentStatusTransition(BaseModel):
    status: IncidentStatus
    comment: Optional[str] = None


class IncidentCommentCreate(BaseModel):
    body: str
