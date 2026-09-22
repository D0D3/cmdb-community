"""Logique transitions workflow RFC et association CI aux changements."""
from __future__ import annotations
import uuid
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.auth.models import User
from app.cmdb.models import CI
from .models import ChangeRequest, ChangeCI, ChangeComment
from .schemas import (
    ChangeRequestCreate, ChangeRequestUpdate, StatusTransition,
    ChangeRequestOut, ChangeRequestSummary, ChangeCIOut,
    ChangeCommentCreate, ChangeCommentOut, ChangeList, ChangeStats,
)

# Transitions autorisées : statut courant → statuts cibles possibles
TRANSITIONS: dict[str, list[str]] = {
    "draft":            ["pending_approval", "cancelled"],
    "pending_approval": ["approved", "rejected", "draft"],
    "approved":         ["in_progress", "cancelled"],
    "in_progress":      ["completed", "cancelled"],
    "completed":        [],
    "rejected":         ["draft"],
    "cancelled":        ["draft"],
}


def _ci_links_out(links: list[ChangeCI], db: Session) -> list[ChangeCIOut]:
    out = []
    for lnk in links:
        ci = db.get(CI, lnk.ci_id)
        out.append(ChangeCIOut(
            ci_id=lnk.ci_id,
            impact=lnk.impact,
            ci_name=ci.name if ci else None,
            ci_type=ci.ci_type if ci else None,
            ci_status=ci.status if ci else None,
        ))
    return out


def _to_summary(cr: ChangeRequest, db: Session) -> ChangeRequestSummary:
    requester = db.get(User, cr.requester_id) if cr.requester_id else None
    approver = db.get(User, cr.approver_id) if cr.approver_id else None
    return ChangeRequestSummary(
        id=cr.id,
        title=cr.title,
        change_type=cr.change_type,
        status=cr.status,
        priority=cr.priority,
        risk=cr.risk,
        requester_name=requester.full_name if requester else None,
        approver_name=approver.full_name if approver else None,
        planned_start=cr.planned_start,
        planned_end=cr.planned_end,
        ci_count=len(cr.ci_links),
        created_at=cr.created_at,
        updated_at=cr.updated_at,
    )


def _to_out(cr: ChangeRequest, db: Session) -> ChangeRequestOut:
    requester = db.get(User, cr.requester_id) if cr.requester_id else None
    approver = db.get(User, cr.approver_id) if cr.approver_id else None
    return ChangeRequestOut(
        id=cr.id,
        title=cr.title,
        description=cr.description,
        change_type=cr.change_type,
        status=cr.status,
        priority=cr.priority,
        risk=cr.risk,
        requester_id=cr.requester_id,
        requester_name=requester.full_name if requester else None,
        approver_id=cr.approver_id,
        approver_name=approver.full_name if approver else None,
        planned_start=cr.planned_start,
        planned_end=cr.planned_end,
        actual_start=cr.actual_start,
        actual_end=cr.actual_end,
        rollback_plan=cr.rollback_plan,
        notes=cr.notes,
        ci_links=_ci_links_out(cr.ci_links, db),
        created_at=cr.created_at,
        updated_at=cr.updated_at,
    )


def list_changes(
    db: Session,
    status_filter: Optional[str],
    change_type: Optional[str],
    priority: Optional[str],
    skip: int,
    limit: int,
) -> ChangeList:
    q = db.query(ChangeRequest)
    if status_filter:
        q = q.filter(ChangeRequest.status == status_filter)
    if change_type:
        q = q.filter(ChangeRequest.change_type == change_type)
    if priority:
        q = q.filter(ChangeRequest.priority == priority)
    total = q.count()
    items = q.order_by(ChangeRequest.created_at.desc()).offset(skip).limit(limit).all()
    return ChangeList(items=[_to_summary(cr, db) for cr in items], total=total)


def get_stats(db: Session) -> ChangeStats:
    all_cr = db.query(ChangeRequest).all()
    counts: dict[str, int] = {
        s: 0 for s in ["draft", "pending_approval", "approved", "in_progress", "completed", "rejected", "cancelled"]
    }
    for cr in all_cr:
        counts[cr.status] = counts.get(cr.status, 0) + 1
    return ChangeStats(total=len(all_cr), **counts)


def create_change(db: Session, payload: ChangeRequestCreate, requester: User) -> ChangeRequestOut:
    cr = ChangeRequest(
        title=payload.title,
        description=payload.description,
        change_type=payload.change_type,
        priority=payload.priority,
        risk=payload.risk,
        requester_id=requester.id,
        approver_id=payload.approver_id,
        planned_start=payload.planned_start,
        planned_end=payload.planned_end,
        rollback_plan=payload.rollback_plan,
        notes=payload.notes,
    )
    db.add(cr)
    db.flush()

    for lnk in payload.ci_links:
        db.add(ChangeCI(change_id=cr.id, ci_id=lnk.ci_id, impact=lnk.impact))

    db.commit()
    db.refresh(cr)
    return _to_out(cr, db)


def get_change(db: Session, change_id: uuid.UUID) -> ChangeRequestOut:
    cr = db.get(ChangeRequest, change_id)
    if not cr:
        raise HTTPException(status_code=404, detail="RFC introuvable")
    return _to_out(cr, db)


def update_change(db: Session, change_id: uuid.UUID, payload: ChangeRequestUpdate) -> ChangeRequestOut:
    cr = db.get(ChangeRequest, change_id)
    if not cr:
        raise HTTPException(status_code=404, detail="RFC introuvable")
    if cr.status in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="RFC terminée, modification impossible")

    for field, val in payload.model_dump(exclude_unset=True, exclude={"ci_links"}).items():
        setattr(cr, field, val)

    if payload.ci_links is not None:
        for lnk in cr.ci_links:
            db.delete(lnk)
        db.flush()
        for lnk in payload.ci_links:
            db.add(ChangeCI(change_id=cr.id, ci_id=lnk.ci_id, impact=lnk.impact))

    db.commit()
    db.refresh(cr)
    return _to_out(cr, db)


def transition_status(
    db: Session, change_id: uuid.UUID, payload: StatusTransition, actor: User
) -> ChangeRequestOut:
    cr = db.get(ChangeRequest, change_id)
    if not cr:
        raise HTTPException(status_code=404, detail="RFC introuvable")

    allowed = TRANSITIONS.get(cr.status, [])
    if payload.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Transition '{cr.status}' → '{payload.status}' non autorisée"
        )

    cr.status = payload.status

    if payload.comment:
        db.add(ChangeComment(
            change_id=cr.id,
            author_id=actor.id,
            author_name=actor.full_name,
            content=f"[{payload.status.upper()}] {payload.comment}",
        ))

    db.commit()
    db.refresh(cr)

    _notify_transition(db, cr, payload.status, payload.comment or "")

    return _to_out(cr, db)


def _notify_transition(db: Session, cr: ChangeRequest, new_status: str, comment: str) -> None:
    try:
        from app.notifications.email import (
            notify_rfc_submitted, notify_rfc_decision, notify_rfc_completed,
        )
        from app.core.config import get_settings
        domain = get_settings().domain

        requester = db.get(User, cr.requester_id) if cr.requester_id else None
        approver  = db.get(User, cr.approver_id)  if cr.approver_id  else None

        if new_status == "pending_approval" and approver and approver.email:
            notify_rfc_submitted(
                str(cr.id), cr.title,
                requester.full_name if requester else "Inconnu",
                approver.email, domain,
            )
        elif new_status in ("approved", "rejected") and requester and requester.email:
            notify_rfc_decision(
                str(cr.id), cr.title, new_status,
                requester.email, comment, domain,
            )
        elif new_status == "completed" and requester and requester.email:
            notify_rfc_completed(str(cr.id), cr.title, requester.email, domain)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Notification RFC échouée : %s", exc)


def delete_change(db: Session, change_id: uuid.UUID) -> None:
    cr = db.get(ChangeRequest, change_id)
    if not cr:
        raise HTTPException(status_code=404, detail="RFC introuvable")
    if cr.status not in ("draft", "cancelled", "rejected"):
        raise HTTPException(status_code=400, detail="Seules les RFC en draft/annulée/rejetée peuvent être supprimées")
    db.delete(cr)
    db.commit()


def add_comment(
    db: Session, change_id: uuid.UUID, payload: ChangeCommentCreate, actor: User
) -> ChangeCommentOut:
    cr = db.get(ChangeRequest, change_id)
    if not cr:
        raise HTTPException(status_code=404, detail="RFC introuvable")
    c = ChangeComment(
        change_id=change_id,
        author_id=actor.id,
        author_name=actor.full_name,
        content=payload.content,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return ChangeCommentOut.model_validate(c)


def list_comments(db: Session, change_id: uuid.UUID) -> list[ChangeCommentOut]:
    cr = db.get(ChangeRequest, change_id)
    if not cr:
        raise HTTPException(status_code=404, detail="RFC introuvable")
    return [ChangeCommentOut.model_validate(c) for c in cr.comments]
