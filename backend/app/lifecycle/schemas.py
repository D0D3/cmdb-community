from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel

ChangeType     = Literal["normal", "standard", "emergency"]
ChangeStatus   = Literal["draft", "pending_approval", "approved", "in_progress", "completed", "rejected", "cancelled"]
ChangePriority = Literal["low", "medium", "high", "critical"]
ChangeRisk     = Literal["low", "medium", "high"]
CIImpact       = Literal["info", "affected", "critical"]


class ChangeCIIn(BaseModel):
    ci_id: uuid.UUID
    impact: CIImpact = "affected"


class ChangeCIOut(BaseModel):
    ci_id: uuid.UUID
    impact: CIImpact
    ci_name: Optional[str] = None
    ci_type: Optional[str] = None
    ci_status: Optional[str] = None

    model_config = {"from_attributes": True}


class ChangeCommentCreate(BaseModel):
    content: str


class ChangeCommentOut(BaseModel):
    id: uuid.UUID
    change_id: uuid.UUID
    author_id: Optional[uuid.UUID] = None
    author_name: Optional[str] = None
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChangeRequestCreate(BaseModel):
    title: str
    description: Optional[str] = None
    change_type: ChangeType = "normal"
    priority: ChangePriority = "medium"
    risk: ChangeRisk = "medium"
    approver_id: Optional[uuid.UUID] = None
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    rollback_plan: Optional[str] = None
    notes: Optional[str] = None
    ci_links: list[ChangeCIIn] = []


class ChangeRequestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    change_type: Optional[ChangeType] = None
    priority: Optional[ChangePriority] = None
    risk: Optional[ChangeRisk] = None
    approver_id: Optional[uuid.UUID] = None
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    rollback_plan: Optional[str] = None
    notes: Optional[str] = None
    ci_links: Optional[list[ChangeCIIn]] = None


class StatusTransition(BaseModel):
    status: ChangeStatus
    comment: Optional[str] = None


class ChangeRequestOut(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    change_type: ChangeType
    status: ChangeStatus
    priority: ChangePriority
    risk: ChangeRisk
    requester_id: Optional[uuid.UUID] = None
    requester_name: Optional[str] = None
    approver_id: Optional[uuid.UUID] = None
    approver_name: Optional[str] = None
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    rollback_plan: Optional[str] = None
    notes: Optional[str] = None
    ci_links: list[ChangeCIOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChangeRequestSummary(BaseModel):
    id: uuid.UUID
    title: str
    change_type: ChangeType
    status: ChangeStatus
    priority: ChangePriority
    risk: ChangeRisk
    requester_name: Optional[str] = None
    approver_name: Optional[str] = None
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    ci_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChangeList(BaseModel):
    items: list[ChangeRequestSummary]
    total: int


class ChangeStats(BaseModel):
    total: int
    draft: int
    pending_approval: int
    approved: int
    in_progress: int
    completed: int
    rejected: int
    cancelled: int
