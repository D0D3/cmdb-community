"""Schémas Pydantic pour l'agent natif (tokens, rapport système, résultat upsert CI)."""
import uuid
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, field_validator

HW_SUBTYPES = ("server", "vm", "workstation", "terminal_server", "network_device")


class AgentTokenCreate(BaseModel):
    name: str
    description: Optional[str] = None


class AgentTokenOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: Optional[str]
    revoked: bool
    last_seen_at: Optional[datetime]
    last_seen_hostname: Optional[str]
    created_at: datetime


class AgentTokenCreated(AgentTokenOut):
    """Retourné une seule fois à la création — contient le token brut."""
    raw_token: str


class DiskInfo(BaseModel):
    mount: str
    device: str
    total_gb: float
    free_gb: float


class AgentReport(BaseModel):
    agent_version: str
    hostname: str
    hw_subtype: Literal["server", "vm", "workstation", "terminal_server", "network_device"] = "workstation"
    os_name: str
    os_version: str
    os_build: Optional[str] = None
    cpu_model: Optional[str] = None
    cpu_count: int = 0
    ram_gb: float = 0.0
    disks: list[DiskInfo] = []
    mac_address: Optional[str] = None
    ip_address: Optional[str] = None

    @field_validator("mac_address", mode="before")
    @classmethod
    def normalise_mac(cls, v):
        if v:
            return v.upper().replace("-", ":")
        return v


class AgentReportResult(BaseModel):
    action: Literal["created", "updated"]
    ci_id: uuid.UUID
    ci_name: str
