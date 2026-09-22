import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator, ConfigDict


class ConnectorCreate(BaseModel):
    name:           str
    connector_type: str
    enabled:        bool = False
    config:         dict = {}

    @field_validator("connector_type")
    @classmethod
    def _valid_type(cls, v: str) -> str:
        from app.connectors.models import CONNECTOR_TYPES
        if v not in CONNECTOR_TYPES:
            raise ValueError(f"Type invalide. Valeurs : {', '.join(CONNECTOR_TYPES)}")
        return v


class ConnectorUpdate(BaseModel):
    name:                Optional[str]  = None
    enabled:             Optional[bool] = None
    config:              Optional[dict] = None
    sync_interval_hours: Optional[int]  = None


class ConnectorOut(BaseModel):
    id:             uuid.UUID
    name:           str
    connector_type: str
    enabled:        bool
    config:              Optional[dict]     = None
    sync_interval_hours: Optional[int]      = None
    last_test_at:        Optional[datetime] = None
    last_test_ok:        Optional[bool]     = None
    last_test_message:   Optional[str]      = None
    last_sync_at:        Optional[datetime] = None
    last_sync_result:    Optional[dict]     = None
    created_at:     datetime
    updated_at:     datetime

    model_config = {"from_attributes": True}


class SyncLogOut(BaseModel):
    id:           uuid.UUID
    connector_id: uuid.UUID
    started_at:   datetime
    finished_at:  Optional[datetime] = None
    status:       str
    result:       Optional[dict]    = None
    error:        Optional[str]     = None
    triggered_by: str

    model_config = ConfigDict(from_attributes=True)


class TestResult(BaseModel):
    ok:      bool
    message: str
