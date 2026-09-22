"""
Service audit.
  record()     : crée une entrée AuditLog — appelé dans les routers après chaque mutation.
  list_audit() : requête filtrée paginée, retourne (items, total).
"""
from typing import Optional, TYPE_CHECKING
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .models import AuditLog

if TYPE_CHECKING:
    from app.auth.models import User


def record(
    db: Session,
    entity_type: str,
    entity_id: str,
    entity_name: str,
    action: str,
    changes: Optional[dict] = None,
    user: Optional["User"] = None,
) -> AuditLog:
    log = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        action=action,
        changes=changes or {},
        performed_by_id=user.id if user else None,
        performed_by_name=user.full_name if user else None,
    )
    db.add(log)
    return log


def list_audit(
    db: Session,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[AuditLog], int]:
    q = select(AuditLog)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if entity_id:
        q = q.where(AuditLog.entity_id == entity_id)
    if action:
        q = q.where(AuditLog.action == action)
    q = q.order_by(AuditLog.created_at.desc())

    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    items = list(db.scalars(q.offset(skip).limit(limit)).all())
    return items, total
