"""
Router audit (/api/audit/…).
Consultation du journal d'audit : filtres par type d'entité, ID, action (create/update/delete).
/audit/ci/{ci_id} : raccourci pour l'historique complet d'un CI spécifique.
"""
import uuid
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import require_role, require_perm
from . import service
from .schemas import AuditLogList

DbDep = Annotated[Session, Depends(get_db)]
_read_roles = require_perm("audit", "read")

audit_router = APIRouter(prefix="/api/audit", tags=["audit"])


@audit_router.get("/", response_model=AuditLogList, dependencies=[_read_roles])
def list_audit(
    db: DbDep,
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    items, total = service.list_audit(db, entity_type, entity_id, action, skip, limit)
    return {"items": items, "total": total}


@audit_router.get("/ci/{ci_id}", response_model=AuditLogList, dependencies=[_read_roles])
def list_ci_audit(
    ci_id: uuid.UUID,
    db: DbDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    items, total = service.list_audit(db, "ci", str(ci_id), skip=skip, limit=limit)
    return {"items": items, "total": total}
