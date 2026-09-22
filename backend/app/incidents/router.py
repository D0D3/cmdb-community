"""
Router incidents ITSM (/api/incidents/…).
CRUD incidents, ajout d'actions à la timeline, lien CI, lien ticket externe (GLPI/Jira/URL).
Transitions de statut : ouvert → en_cours → résolu → fermé.
"""
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_role, require_perm
from app.incidents import service
from app.incidents.models import Incident
from app.incidents.schemas import (
    IncidentCreate, IncidentUpdate, IncidentOut, IncidentSummary,
    IncidentList, IncidentStats, IncidentStatusTransition, IncidentCommentCreate,
    IncidentCommentOut,
)

router = APIRouter(prefix="/api/incidents", tags=["incidents"])
DbDep = Annotated[Session, Depends(get_db)]
_read  = require_perm("incidents", "read")
_write = require_perm("incidents", "write")


def _get_or_404(incident_id: uuid.UUID, db: Session) -> Incident:
    inc = service.get_incident(db, incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident introuvable")
    return inc


@router.get("/stats", response_model=IncidentStats, dependencies=[_read])
def get_stats(db: DbDep):
    return service.get_stats(db)


@router.get("/", response_model=IncidentList, dependencies=[_read])
def list_incidents(
    db: DbDep,
    status_filter: Optional[str] = Query(None, alias="status"),
    severity: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
):
    items, total = service.list_incidents(db, status_filter, severity, search, skip, limit)
    summaries = [service._enrich_summary(i, db) for i in items]
    return IncidentList(items=[IncidentSummary(**s) for s in summaries], total=total)


@router.post("/", response_model=IncidentOut, status_code=status.HTTP_201_CREATED,
             dependencies=[_write])
def create_incident(data: IncidentCreate, db: DbDep, user: CurrentUser):
    inc = service.create_incident(db, data, user.id)
    # Notifications email selon sévérité
    try:
        from app.notifications import service as notif_svc
        from app.core.config import get_settings
        domain = get_settings().domain
        event = "incident_critical" if data.severity == "critical" else "incident_open"
        notif_svc.trigger(db, event, domain=domain,
                          incident_id=str(inc.id), title=inc.title,
                          severity=inc.severity, reporter=user.full_name)
    except Exception:
        pass
    return IncidentOut(**service._enrich(inc, db))


@router.get("/{incident_id}", response_model=IncidentOut, dependencies=[_read])
def get_incident(incident_id: uuid.UUID, db: DbDep):
    inc = _get_or_404(incident_id, db)
    return IncidentOut(**service._enrich(inc, db))


@router.patch("/{incident_id}", response_model=IncidentOut, dependencies=[_write])
def update_incident(incident_id: uuid.UUID, data: IncidentUpdate, db: DbDep):
    inc = _get_or_404(incident_id, db)
    inc = service.update_incident(db, inc, data)
    return IncidentOut(**service._enrich(inc, db))


@router.post("/{incident_id}/status", response_model=IncidentOut, dependencies=[_write])
def transition_status(incident_id: uuid.UUID, data: IncidentStatusTransition, db: DbDep, user: CurrentUser):
    inc = _get_or_404(incident_id, db)
    inc = service.transition_status(db, inc, data.status, data.comment, user.id)
    return IncidentOut(**service._enrich(inc, db))


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[require_role("admin")])
def delete_incident(incident_id: uuid.UUID, db: DbDep):
    inc = _get_or_404(incident_id, db)
    service.delete_incident(db, inc)


@router.get("/{incident_id}/comments", response_model=list[IncidentCommentOut], dependencies=[_read])
def list_comments(incident_id: uuid.UUID, db: DbDep):
    inc = _get_or_404(incident_id, db)
    from app.auth.models import User
    result = []
    for c in inc.comments:
        author = db.get(User, c.author_id) if c.author_id else None
        result.append(IncidentCommentOut(
            id=c.id, author_id=c.author_id,
            author_name=author.full_name if author else None,
            body=c.body, created_at=c.created_at,
        ))
    return result


@router.post("/{incident_id}/comments", response_model=IncidentCommentOut,
             status_code=status.HTTP_201_CREATED, dependencies=[_write])
def add_comment(incident_id: uuid.UUID, data: IncidentCommentCreate, db: DbDep, user: CurrentUser):
    inc = _get_or_404(incident_id, db)
    c = service.add_comment(db, inc, data.body, user.id)
    return IncidentCommentOut(
        id=c.id, author_id=c.author_id,
        author_name=user.full_name, body=c.body, created_at=c.created_at,
    )
