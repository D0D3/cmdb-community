"""Schémas Pydantic CVE (liste, détail avec CIs affectés, statut CICve, stats)."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class CveOut(BaseModel):
    id: str
    summary: Optional[str]
    cvss_score: Optional[Decimal]
    cvss_severity: Optional[str]
    is_kev: bool
    published_at: Optional[datetime]
    source_url: Optional[str]
    ingested_at: datetime
    affected_count: int = 0

    model_config = {"from_attributes": True}


class CICveOut(BaseModel):
    ci_id: uuid.UUID
    ci_name: str
    ci_type: str
    cve_id: str
    matched_at: datetime
    status: str

    model_config = {"from_attributes": True}


class CveDetail(CveOut):
    affected_cis: list[CICveOut] = []


class CveList(BaseModel):
    total: int
    items: list[CveOut]


class CveStats(BaseModel):
    total: int
    critical: int
    high: int
    medium: int
    low: int
    kev_count: int
    open_count: int


class CICveStatusUpdate(BaseModel):
    status: str  # open | acknowledged | mitigated | not_affected
