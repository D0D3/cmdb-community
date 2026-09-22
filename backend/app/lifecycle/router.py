"""
Router cycle de vie (/api/changes/… et /api/maintenance/…).
Changements RFC : CRUD, transitions de statut, CI liés, commentaires.
Maintenances    : CRUD, vue calendrier (liste/mois/semaine), marquer réalisé.
"""
import uuid
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role, require_perm, CurrentUser
from . import service
from .schemas import (
    ChangeRequestCreate, ChangeRequestUpdate, ChangeRequestOut,
    ChangeList, ChangeStats, StatusTransition,
    ChangeCommentCreate, ChangeCommentOut,
)

DbDep   = Annotated[Session, Depends(get_db)]
_read   = require_perm("changes", "read")
_write  = require_perm("changes", "write")
_admin  = require_role("admin")

changes_router = APIRouter(prefix="/api/changes", tags=["changes"])


@changes_router.get("/stats", response_model=ChangeStats, dependencies=[_read])
def get_stats(db: DbDep):
    return service.get_stats(db)


@changes_router.get("/", response_model=ChangeList, dependencies=[_read])
def list_changes(
    db: DbDep,
    status: Optional[str] = Query(None),
    change_type: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    return service.list_changes(db, status, change_type, priority, skip, limit)


@changes_router.post("/", response_model=ChangeRequestOut, dependencies=[_write])
def create_change(payload: ChangeRequestCreate, db: DbDep, actor: CurrentUser):
    return service.create_change(db, payload, actor)


@changes_router.get("/{change_id}", response_model=ChangeRequestOut, dependencies=[_read])
def get_change(change_id: uuid.UUID, db: DbDep):
    return service.get_change(db, change_id)


@changes_router.patch("/{change_id}", response_model=ChangeRequestOut, dependencies=[_write])
def update_change(change_id: uuid.UUID, payload: ChangeRequestUpdate, db: DbDep):
    return service.update_change(db, change_id, payload)


@changes_router.patch("/{change_id}/status", response_model=ChangeRequestOut, dependencies=[_write])
def transition_status(change_id: uuid.UUID, payload: StatusTransition, db: DbDep, actor: CurrentUser):
    return service.transition_status(db, change_id, payload, actor)


@changes_router.delete("/{change_id}", status_code=204, dependencies=[_admin])
def delete_change(change_id: uuid.UUID, db: DbDep):
    service.delete_change(db, change_id)


@changes_router.post("/{change_id}/comments", response_model=ChangeCommentOut, dependencies=[_write])
def add_comment(change_id: uuid.UUID, payload: ChangeCommentCreate, db: DbDep, actor: CurrentUser):
    return service.add_comment(db, change_id, payload, actor)


@changes_router.get("/{change_id}/comments", response_model=list[ChangeCommentOut], dependencies=[_read])
def list_comments(change_id: uuid.UUID, db: DbDep):
    return service.list_comments(db, change_id)
