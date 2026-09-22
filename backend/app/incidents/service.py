"""Logique transitions de statut des incidents et enregistrement des actions timeline."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from app.incidents.models import Incident, IncidentCI, IncidentComment, IncidentHistory
from app.incidents.schemas import IncidentCreate, IncidentUpdate, IncidentStats
from app.cmdb.models import CI
from app.auth.models import User

TRANSITIONS: dict[str, list[str]] = {
    "open":          ["investigating", "resolved", "closed"],
    "investigating": ["resolved", "closed"],
    "resolved":      ["closed", "open"],   # réouverture possible
    "closed":        [],
}


def _enrich(inc: Incident, db: Session) -> dict:
    """Ajoute les champs calculés non stockés en colonne."""
    reporter = db.get(User, inc.reporter_id) if inc.reporter_id else None
    assignee = db.get(User, inc.assignee_id) if inc.assignee_id else None

    ci_links = []
    for link in inc.ci_links:
        ci = db.get(CI, link.ci_id)
        if ci:
            ci_links.append({"ci_id": link.ci_id, "ci_name": ci.name, "ci_type": ci.ci_type})

    comments = []
    for c in inc.comments:
        author = db.get(User, c.author_id) if c.author_id else None
        comments.append({
            "id":          c.id,
            "author_id":   c.author_id,
            "author_name": author.full_name if author else None,
            "body":        c.body,
            "created_at":  c.created_at,
        })

    history = []
    for h in inc.history:
        author = db.get(User, h.author_id) if h.author_id else None
        history.append({
            "id":          h.id,
            "author_id":   h.author_id,
            "author_name": author.full_name if author else None,
            "from_status": h.from_status,
            "to_status":   h.to_status,
            "comment":     h.comment,
            "created_at":  h.created_at,
        })

    return {
        "id":                   inc.id,
        "title":                inc.title,
        "description":          inc.description,
        "severity":             inc.severity,
        "status":               inc.status,
        "reporter_id":          inc.reporter_id,
        "reporter_name":        reporter.full_name if reporter else None,
        "assignee_id":          inc.assignee_id,
        "assignee_name":        assignee.full_name if assignee else None,
        "resolved_at":          inc.resolved_at,
        "closed_at":            inc.closed_at,
        "created_at":           inc.created_at,
        "updated_at":           inc.updated_at,
        "external_ticket_url":  inc.external_ticket_url,
        "ci_links":             ci_links,
        "comments":             comments,
        "history":              history,
    }


def _enrich_summary(inc: Incident, db: Session) -> dict:
    reporter = db.get(User, inc.reporter_id) if inc.reporter_id else None
    assignee = db.get(User, inc.assignee_id) if inc.assignee_id else None
    return {
        "id":            inc.id,
        "title":         inc.title,
        "severity":      inc.severity,
        "status":        inc.status,
        "reporter_name": reporter.full_name if reporter else None,
        "assignee_name": assignee.full_name if assignee else None,
        "ci_count":      len(inc.ci_links),
        "created_at":    inc.created_at,
        "updated_at":    inc.updated_at,
        "resolved_at":   inc.resolved_at,
    }


def get_stats(db: Session) -> IncidentStats:
    rows = db.execute(
        select(Incident.status, func.count()).group_by(Incident.status)
    ).all()
    by_status = {r[0]: r[1] for r in rows}

    sev_rows = db.execute(
        select(Incident.severity, func.count())
        .where(Incident.status.in_(["open", "investigating"]))
        .group_by(Incident.severity)
    ).all()
    by_sev = {r[0]: r[1] for r in sev_rows}

    # MTTR en heures sur les incidents résolus/fermés
    resolved = db.execute(
        select(Incident.created_at, Incident.resolved_at)
        .where(Incident.resolved_at.is_not(None))
    ).all()
    mttr: Optional[float] = None
    if resolved:
        durations = [
            (r.resolved_at - r.created_at).total_seconds() / 3600
            for r in resolved
            if r.resolved_at and r.created_at
        ]
        if durations:
            mttr = round(sum(durations) / len(durations), 1)

    return IncidentStats(
        open=by_status.get("open", 0),
        investigating=by_status.get("investigating", 0),
        resolved=by_status.get("resolved", 0),
        closed=by_status.get("closed", 0),
        critical=by_sev.get("critical", 0),
        high=by_sev.get("high", 0),
        mttr_hours=mttr,
    )


def list_incidents(
    db: Session,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Incident], int]:
    q = select(Incident).options(
        selectinload(Incident.ci_links),
        selectinload(Incident.comments),
        selectinload(Incident.history),
    ).order_by(Incident.created_at.desc())

    if status:
        q = q.where(Incident.status == status)
    if severity:
        q = q.where(Incident.severity == severity)
    if search:
        q = q.where(Incident.title.ilike(f"%{search}%"))

    total = db.scalar(select(func.count()).select_from(q.subquery()))
    items = db.execute(q.offset(skip).limit(limit)).scalars().all()
    return list(items), total or 0


def get_incident(db: Session, incident_id: uuid.UUID) -> Optional[Incident]:
    return db.execute(
        select(Incident)
        .options(
            selectinload(Incident.ci_links),
            selectinload(Incident.comments),
            selectinload(Incident.history),
        )
        .where(Incident.id == incident_id)
    ).scalar_one_or_none()


def create_incident(db: Session, data: IncidentCreate, reporter_id: uuid.UUID) -> Incident:
    inc = Incident(
        title=data.title,
        description=data.description,
        severity=data.severity,
        status="open",
        reporter_id=reporter_id,
        assignee_id=data.assignee_id,
    )
    db.add(inc)
    db.flush()
    for ci_id in data.ci_ids:
        db.add(IncidentCI(incident_id=inc.id, ci_id=ci_id))
    db.commit()
    db.refresh(inc)
    return inc


def update_incident(db: Session, inc: Incident, data: IncidentUpdate) -> Incident:
    if data.title is not None:
        inc.title = data.title
    if data.description is not None:
        inc.description = data.description
    if data.severity is not None:
        inc.severity = data.severity
    if data.assignee_id is not None:
        inc.assignee_id = data.assignee_id
    if data.ci_ids is not None:
        db.query(IncidentCI).filter(IncidentCI.incident_id == inc.id).delete()
        for ci_id in data.ci_ids:
            db.add(IncidentCI(incident_id=inc.id, ci_id=ci_id))
    if data.external_ticket_url is not None:
        inc.external_ticket_url = data.external_ticket_url or None
    inc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inc)
    return inc


def transition_status(
    db: Session,
    inc: Incident,
    new_status: str,
    comment_body: Optional[str],
    author_id: uuid.UUID,
) -> Incident:
    allowed = TRANSITIONS.get(inc.status, [])
    if new_status not in allowed:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Transition {inc.status} → {new_status} non autorisée",
        )
    now = datetime.now(timezone.utc)
    old_status = inc.status
    inc.status = new_status
    if new_status == "resolved":
        inc.resolved_at = now
    if new_status == "closed":
        inc.closed_at = now
    if new_status == "open":   # réouverture
        inc.resolved_at = None
        inc.closed_at = None
    inc.updated_at = now

    db.add(IncidentHistory(
        incident_id=inc.id,
        author_id=author_id,
        from_status=old_status,
        to_status=new_status,
        comment=comment_body or None,
    ))

    if comment_body:
        db.add(IncidentComment(incident_id=inc.id, author_id=author_id, body=comment_body))

    db.commit()
    db.refresh(inc)
    return inc


def add_comment(db: Session, inc: Incident, body: str, author_id: uuid.UUID) -> IncidentComment:
    c = IncidentComment(incident_id=inc.id, author_id=author_id, body=body)
    db.add(c)
    inc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(c)
    return c


def delete_incident(db: Session, inc: Incident) -> None:
    db.delete(inc)
    db.commit()
