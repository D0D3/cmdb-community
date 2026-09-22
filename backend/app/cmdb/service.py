"""
Logique métier CMDB : création/mise à jour des CI, calcul de conformité licences.
Utilise selectinload() sur les relations pour éviter les requêtes N+1 dans les listes.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from sqlalchemy import exists
from app.cmdb.models import CI, HardwareDetail, SoftwareDetail, CIRelation, Sla, MaintenanceSchedule, MaintenanceLog, CICve
from app.keyusers.models import CIKeyUser
from app.cmdb.schemas import CICreate, CIUpdate, CIRelationCreate, SlaCreate, SlaUpdate, MaintenanceScheduleCreate, MaintenanceScheduleUpdate


# ── CI ────────────────────────────────────────────────────────────────────────

def _ci_query(db: Session):
    return (
        db.query(CI)
        .options(
            selectinload(CI.hardware_details),
            selectinload(CI.software_details),
        )
        .filter(CI.deleted_at.is_(None))
    )


def list_cis(
    db: Session,
    ci_type: Optional[str] = None,
    status: Optional[str] = None,
    criticality: Optional[str] = None,
    search: Optional[str] = None,
    has_cves: Optional[bool] = None,
    has_key_users: Optional[bool] = None,
    hw_subtype: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[CI]]:
    q = _ci_query(db)
    if ci_type:
        q = q.filter(CI.ci_type == ci_type)
    if hw_subtype:
        q = q.filter(CI.ci_type == "hardware")
        q = q.join(HardwareDetail, HardwareDetail.ci_id == CI.id).filter(
            HardwareDetail.hw_subtype == hw_subtype
        )
    if status:
        q = q.filter(CI.status == status)
    if criticality:
        q = q.filter(CI.criticality == criticality)
    if search:
        pattern = f"%{search}%"
        q = q.filter(or_(CI.name.ilike(pattern), CI.description.ilike(pattern)))
    if has_cves is True:
        q = q.filter(exists().where(CICve.ci_id == CI.id))
    elif has_cves is False:
        q = q.filter(~exists().where(CICve.ci_id == CI.id))
    if has_key_users is True:
        q = q.filter(exists().where(CIKeyUser.ci_id == CI.id))
    elif has_key_users is False:
        q = q.filter(~exists().where(CIKeyUser.ci_id == CI.id))
    total = q.count()
    items = q.order_by(CI.name).offset(skip).limit(limit).all()
    return total, items


def get_ci(db: Session, ci_id: uuid.UUID) -> Optional[CI]:
    return _ci_query(db).filter(CI.id == ci_id).first()


def create_ci(db: Session, data: CICreate) -> CI:
    ci = CI(
        ci_type=data.ci_type,
        name=data.name,
        description=data.description,
        status=data.status,
        criticality=data.criticality,
        owner_id=data.owner_id,
        team=data.team,
        location=data.location,
        sla_id=data.sla_id,
        attributes=data.attributes,
    )
    db.add(ci)
    db.flush()

    if data.hardware and data.ci_type == "hardware":
        db.add(HardwareDetail(ci_id=ci.id, **data.hardware.model_dump()))
    elif data.software and data.ci_type == "software":
        db.add(SoftwareDetail(ci_id=ci.id, **data.software.model_dump()))

    db.commit()
    db.refresh(ci)
    return ci


def update_ci(db: Session, ci: CI, data: CIUpdate) -> CI:
    simple_fields = ["name", "description", "status", "criticality", "owner_id", "team", "location", "sla_id", "attributes"]
    for field in simple_fields:
        value = getattr(data, field, None)
        if value is not None:
            setattr(ci, field, value)

    if data.hardware and ci.ci_type == "hardware":
        if ci.hardware_details:
            for k, v in data.hardware.model_dump(exclude_none=True).items():
                setattr(ci.hardware_details, k, v)
        else:
            db.add(HardwareDetail(ci_id=ci.id, **data.hardware.model_dump()))

    if data.software and ci.ci_type == "software":
        if ci.software_details:
            for k, v in data.software.model_dump(exclude_none=True).items():
                setattr(ci.software_details, k, v)
        else:
            db.add(SoftwareDetail(ci_id=ci.id, **data.software.model_dump()))

    db.commit()
    db.refresh(ci)
    return ci


def delete_ci(db: Session, ci: CI) -> None:
    ci.deleted_at = datetime.now(timezone.utc)
    db.commit()


# ── Relations ─────────────────────────────────────────────────────────────────

def list_relations(db: Session, ci_id: uuid.UUID) -> list[dict]:
    from sqlalchemy.orm import aliased
    SourceCI = aliased(CI, name="source_ci")
    TargetCI = aliased(CI, name="target_ci")
    rows = (
        db.query(CIRelation, SourceCI.name, TargetCI.name)
        .join(SourceCI, CIRelation.source_ci_id == SourceCI.id)
        .join(TargetCI, CIRelation.target_ci_id == TargetCI.id)
        .filter(
            or_(CIRelation.source_ci_id == ci_id, CIRelation.target_ci_id == ci_id)
        )
        .all()
    )
    result = []
    for rel, src_name, tgt_name in rows:
        result.append({
            "id": rel.id,
            "source_ci_id": rel.source_ci_id,
            "source_ci_name": src_name,
            "target_ci_id": rel.target_ci_id,
            "target_ci_name": tgt_name,
            "relation_type": rel.relation_type,
            "created_at": rel.created_at,
        })
    return result


def create_relation(db: Session, source_id: uuid.UUID, data: CIRelationCreate) -> CIRelation:
    rel = CIRelation(
        source_ci_id=source_id,
        target_ci_id=data.target_ci_id,
        relation_type=data.relation_type,
    )
    db.add(rel)
    db.commit()
    db.refresh(rel)
    return rel


def delete_relation(db: Session, relation_id: uuid.UUID, ci_id: uuid.UUID) -> bool:
    rel = db.query(CIRelation).filter(
        CIRelation.id == relation_id,
        or_(CIRelation.source_ci_id == ci_id, CIRelation.target_ci_id == ci_id),
    ).first()
    if not rel:
        return False
    db.delete(rel)
    db.commit()
    return True


# ── SLA ───────────────────────────────────────────────────────────────────────

def list_slas(db: Session) -> list[Sla]:
    return db.query(Sla).order_by(Sla.name).all()


def get_sla(db: Session, sla_id: uuid.UUID) -> Optional[Sla]:
    return db.query(Sla).filter(Sla.id == sla_id).first()


def create_sla(db: Session, data: SlaCreate) -> Sla:
    sla = Sla(**data.model_dump())
    db.add(sla)
    db.commit()
    db.refresh(sla)
    return sla


def update_sla(db: Session, sla: Sla, data: SlaUpdate) -> Sla:
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(sla, k, v)
    db.commit()
    db.refresh(sla)
    return sla


def delete_sla(db: Session, sla: Sla) -> None:
    db.delete(sla)
    db.commit()


# ── Maintenances ──────────────────────────────────────────────────────────────

def list_schedules(db: Session, ci_id: uuid.UUID) -> list[MaintenanceSchedule]:
    return db.query(MaintenanceSchedule).filter(
        MaintenanceSchedule.ci_id == ci_id, MaintenanceSchedule.is_active == True
    ).all()


def create_schedule(db: Session, ci_id: uuid.UUID, data: MaintenanceScheduleCreate) -> MaintenanceSchedule:
    sched = MaintenanceSchedule(ci_id=ci_id, **data.model_dump())
    db.add(sched)
    db.commit()
    db.refresh(sched)
    return sched


def log_maintenance(db: Session, schedule_id: uuid.UUID, ci_id: uuid.UUID, performed_by: uuid.UUID, notes: Optional[str]) -> MaintenanceLog:
    log = MaintenanceLog(schedule_id=schedule_id, ci_id=ci_id, performed_by=performed_by, notes=notes)
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def update_schedule(db: Session, schedule_id: uuid.UUID, ci_id: uuid.UUID, data: MaintenanceScheduleUpdate) -> Optional[MaintenanceSchedule]:
    sched = db.query(MaintenanceSchedule).filter(
        MaintenanceSchedule.id == schedule_id,
        MaintenanceSchedule.ci_id == ci_id,
    ).first()
    if not sched:
        return None
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(sched, field, val)
    db.commit()
    db.refresh(sched)
    return sched


def delete_schedule(db: Session, schedule_id: uuid.UUID, ci_id: uuid.UUID) -> bool:
    sched = db.query(MaintenanceSchedule).filter(
        MaintenanceSchedule.id == schedule_id,
        MaintenanceSchedule.ci_id == ci_id,
    ).first()
    if not sched:
        return False
    db.delete(sched)
    db.commit()
    return True


def list_all_schedules(
    db: Session,
    from_date=None,
    to_date=None,
    kind: Optional[str] = None,
) -> list[dict]:
    from sqlalchemy import select, outerjoin
    from app.auth.models import User

    q = (
        db.query(MaintenanceSchedule, CI, User)
        .join(CI, CI.id == MaintenanceSchedule.ci_id)
        .outerjoin(User, User.id == MaintenanceSchedule.assigned_to)
        .filter(CI.deleted_at.is_(None), MaintenanceSchedule.is_active.is_(True))
    )
    if from_date:
        q = q.filter(MaintenanceSchedule.next_due_date >= from_date)
    if to_date:
        q = q.filter(MaintenanceSchedule.next_due_date <= to_date)
    if kind:
        q = q.filter(MaintenanceSchedule.kind == kind)
    q = q.order_by(MaintenanceSchedule.next_due_date)

    result = []
    for sched, ci, user in q.all():
        result.append({
            "id": sched.id,
            "ci_id": sched.ci_id,
            "ci_name": ci.name,
            "ci_type": ci.ci_type,
            "title": sched.title,
            "kind": sched.kind,
            "next_due_date": sched.next_due_date,
            "rrule": sched.rrule,
            "remind_days": sched.remind_days or [],
            "assigned_to": sched.assigned_to,
            "assignee_name": user.full_name if user else None,
            "is_active": sched.is_active,
            "created_at": sched.created_at,
        })
    return result
