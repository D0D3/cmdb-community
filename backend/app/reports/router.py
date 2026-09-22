"""
Router rapports (/api/reports/…).
  /csv/* : exports CSV (inventaire, matériel, logiciels, CVE, échéances, SLA, licences, incidents).
  /pdf/* : exports PDF (inventaire, CVE, rapport exécutif) via WeasyPrint.
  /jobs  : CRUD + exécution manuelle des rapports planifiés (admin uniquement).
"""
import uuid
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import CurrentUser, require_role, require_perm
from . import csv_export, pdf_export
from .schemas import ReportJobCreate, ReportJobUpdate, ReportJobOut
from . import service as rj_service

DbDep = Annotated[Session, Depends(get_db)]
_read  = require_perm("reports", "read")
_admin = require_role("admin")

reports_router = APIRouter(prefix="/api/reports", tags=["reports"])


def _csv_response(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _pdf_response(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@reports_router.get("/csv/inventory", dependencies=[_read])
def csv_inventory(db: DbDep):
    return _csv_response(csv_export.export_inventory(db), "inventaire_ci.csv")


@reports_router.get("/csv/hardware", dependencies=[_read])
def csv_hardware(db: DbDep):
    return _csv_response(csv_export.export_inventory(db, "hardware"), "inventaire_materiel.csv")


@reports_router.get("/csv/software", dependencies=[_read])
def csv_software(db: DbDep):
    return _csv_response(csv_export.export_inventory(db, "software"), "inventaire_logiciels.csv")


@reports_router.get("/csv/cves", dependencies=[_read])
def csv_cves(db: DbDep):
    return _csv_response(csv_export.export_cves(db), "rapport_cves.csv")


@reports_router.get("/csv/deadlines", dependencies=[_read])
def csv_deadlines(db: DbDep):
    return _csv_response(csv_export.export_deadlines(db), "echeances.csv")


@reports_router.get("/pdf/inventory", dependencies=[_read])
def pdf_inventory(db: DbDep, ci_type: Optional[str] = Query(None)):
    try:
        data = pdf_export.pdf_inventory(db, ci_type)
        return _pdf_response(data, "inventaire_cmdb.pdf")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@reports_router.get("/pdf/cves", dependencies=[_read])
def pdf_cves(db: DbDep):
    try:
        data = pdf_export.pdf_cves(db)
        return _pdf_response(data, "rapport_cves.pdf")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@reports_router.get("/pdf/executive", dependencies=[_read])
def pdf_executive(db: DbDep):
    try:
        data = pdf_export.pdf_executive(db)
        return _pdf_response(data, "rapport_executif_cmdb.pdf")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@reports_router.get("/csv/sla", dependencies=[_read])
def csv_sla(db: DbDep):
    return _csv_response(csv_export.export_sla(db), "contrats_sla.csv")


@reports_router.get("/csv/licenses", dependencies=[_read])
def csv_licenses(db: DbDep):
    return _csv_response(csv_export.export_licenses(db), "licences.csv")


@reports_router.get("/csv/incidents", dependencies=[_read])
def csv_incidents(db: DbDep):
    return _csv_response(csv_export.export_incidents(db), "incidents.csv")


# ── Rapports planifiés ────────────────────────────────────────────────────────

@reports_router.get("/jobs", response_model=list[ReportJobOut], dependencies=[_admin])
def list_report_jobs(db: DbDep):
    return [ReportJobOut.from_orm_enriched(j) for j in rj_service.list_jobs(db)]


@reports_router.post("/jobs", response_model=ReportJobOut, status_code=status.HTTP_201_CREATED,
                     dependencies=[_admin])
def create_report_job(data: ReportJobCreate, db: DbDep, user: CurrentUser):
    job = rj_service.create_job(db, data, user.id)
    return ReportJobOut.from_orm_enriched(job)


@reports_router.patch("/jobs/{job_id}", response_model=ReportJobOut, dependencies=[_admin])
def update_report_job(job_id: uuid.UUID, data: ReportJobUpdate, db: DbDep):
    job = rj_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable")
    return ReportJobOut.from_orm_enriched(rj_service.update_job(db, job, data))


@reports_router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_admin])
def delete_report_job(job_id: uuid.UUID, db: DbDep):
    job = rj_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable")
    rj_service.delete_job(db, job)


@reports_router.post("/jobs/{job_id}/run", response_model=dict, dependencies=[_admin])
def run_report_job_now(job_id: uuid.UUID, db: DbDep):
    job = rj_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable")
    ok, msg = rj_service.run_job(db, job)
    if not ok:
        raise HTTPException(status_code=503, detail=msg)
    return {"status": "sent", "message": msg}
