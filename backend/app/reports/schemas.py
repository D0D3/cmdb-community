"""Schémas Pydantic rapports planifiés (création, mise à jour, sortie enrichie)."""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, field_validator
import re

REPORT_TYPES = Literal["inventory", "hardware", "software", "cves", "deadlines", "incidents", "changes"]
REPORT_TYPE_LABELS: dict[str, str] = {
    "inventory":  "Inventaire complet",
    "hardware":   "Inventaire matériel",
    "software":   "Inventaire logiciels",
    "cves":       "Rapport CVE",
    "deadlines":  "Échéances",
    "incidents":  "Incidents ouverts",
    "changes":    "RFC actives",
}
SCHEDULE_LABELS: dict[str, str] = {
    "manual":  "Manuel",
    "daily":   "Quotidien (7h00 UTC)",
    "weekly":  "Hebdomadaire (lundi 7h00 UTC)",
    "monthly": "Mensuel (1er du mois, 7h00 UTC)",
}


class ReportJobCreate(BaseModel):
    name: str
    report_type: str
    format: Literal["csv", "pdf"] = "csv"
    schedule: Literal["manual", "daily", "weekly", "monthly"] = "manual"
    recipients: list[str] = []

    @field_validator("recipients")
    @classmethod
    def validate_emails(cls, v):
        pattern = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
        for email in v:
            if not pattern.match(email):
                raise ValueError(f"Adresse invalide : {email}")
        return v


class ReportJobUpdate(BaseModel):
    name: Optional[str] = None
    report_type: Optional[str] = None
    format: Optional[Literal["csv", "pdf"]] = None
    schedule: Optional[Literal["manual", "daily", "weekly", "monthly"]] = None
    recipients: Optional[list[str]] = None
    is_active: Optional[bool] = None


class ReportJobOut(BaseModel):
    id: uuid.UUID
    name: str
    report_type: str
    report_type_label: str
    format: str
    schedule: str
    schedule_label: str
    recipients: list[str]
    is_active: bool
    last_run_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_enriched(cls, job) -> "ReportJobOut":
        return cls(
            id=job.id,
            name=job.name,
            report_type=job.report_type,
            report_type_label=REPORT_TYPE_LABELS.get(job.report_type, job.report_type),
            format=job.format,
            schedule=job.schedule,
            schedule_label=SCHEDULE_LABELS.get(job.schedule, job.schedule),
            recipients=job.recipients or [],
            is_active=job.is_active,
            last_run_at=job.last_run_at,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )
