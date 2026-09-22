"""Schémas Pydantic pour le journal d'audit (lecture seule)."""
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    action: str
    changes: Optional[dict] = None
    performed_by_id: Optional[uuid.UUID] = None
    performed_by_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogList(BaseModel):
    items: list[AuditLogOut]
    total: int
