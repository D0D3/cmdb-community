"""
Logique rapports planifiés.
  run_job()                    : génère le rapport (CSV ou PDF) et l'envoie par SMTP.
  check_and_run_scheduled_jobs : appelé par la tâche Celery report_jobs — exécute entre 7h00 et 7h59 UTC.
  _is_due()                    : daily (chaque jour), weekly (lundi), monthly (1er du mois).
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional
import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.reports.models import ReportJob
from app.reports.schemas import ReportJobCreate, ReportJobUpdate


def list_jobs(db: Session) -> list[ReportJob]:
    return db.query(ReportJob).order_by(ReportJob.created_at.desc()).all()


def get_job(db: Session, job_id: uuid.UUID) -> Optional[ReportJob]:
    return db.query(ReportJob).filter(ReportJob.id == job_id).first()


def create_job(db: Session, data: ReportJobCreate, created_by: uuid.UUID) -> ReportJob:
    job = ReportJob(
        name=data.name,
        report_type=data.report_type,
        format=data.format,
        schedule=data.schedule,
        recipients=data.recipients,
        created_by=created_by,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def update_job(db: Session, job: ReportJob, data: ReportJobUpdate) -> ReportJob:
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(job, field, val)
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    return job


def delete_job(db: Session, job: ReportJob) -> None:
    db.delete(job)
    db.commit()


def run_job(db: Session, job: ReportJob) -> tuple[bool, str]:
    """Génère le rapport et l'envoie par email. Retourne (success, message)."""
    if not job.recipients:
        return False, "Aucun destinataire configuré"

    try:
        data_bytes, filename, mime = _generate(db, job)
    except Exception as e:
        return False, f"Erreur de génération : {e}"

    from app.notifications.email import send_email_with_attachment
    from app.core.config import get_settings
    domain = get_settings().domain

    subject = f"[CMDB] Rapport : {job.name}"
    html = _report_email_html(job.name, job.report_type, domain)

    ok = send_email_with_attachment(
        to=job.recipients,
        subject=subject,
        html_body=html,
        attachment_name=filename,
        attachment_data=data_bytes,
        attachment_mime=mime,
    )

    if ok:
        job.last_run_at = datetime.now(timezone.utc)
        job.updated_at = datetime.now(timezone.utc)
        db.commit()

    return ok, "OK" if ok else "Échec d'envoi SMTP"


def _generate(db: Session, job: ReportJob) -> tuple[bytes, str, str]:
    from datetime import date
    suffix = date.today().isoformat()

    if job.format == "csv":
        from app.reports.csv_export import export_inventory, export_cves, export_deadlines
        if job.report_type == "inventory":
            return export_inventory(db), f"inventaire_{suffix}.csv", "text/csv"
        elif job.report_type == "hardware":
            return export_inventory(db, "hardware"), f"materiel_{suffix}.csv", "text/csv"
        elif job.report_type == "software":
            return export_inventory(db, "software"), f"logiciels_{suffix}.csv", "text/csv"
        elif job.report_type == "cves":
            return export_cves(db), f"cves_{suffix}.csv", "text/csv"
        elif job.report_type == "deadlines":
            return export_deadlines(db), f"echeances_{suffix}.csv", "text/csv"
        elif job.report_type == "incidents":
            return _export_incidents_csv(db), f"incidents_{suffix}.csv", "text/csv"
        elif job.report_type == "changes":
            return _export_changes_csv(db), f"rfc_{suffix}.csv", "text/csv"

    elif job.format == "pdf":
        from app.reports.pdf_export import pdf_inventory, pdf_cves
        if job.report_type in ("inventory", "hardware", "software"):
            ci_type = None if job.report_type == "inventory" else job.report_type
            return pdf_inventory(db, ci_type), f"inventaire_{suffix}.pdf", "application/pdf"
        elif job.report_type == "cves":
            return pdf_cves(db), f"cves_{suffix}.pdf", "application/pdf"

    raise ValueError(f"Combinaison report_type={job.report_type} + format={job.format} non supportée")


def _export_incidents_csv(db: Session) -> bytes:
    import csv, io
    from app.incidents.models import Incident
    rows = db.query(Incident).filter(Incident.status.in_(["open", "investigating"])).order_by(Incident.created_at.desc()).all()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["ID", "Titre", "Sévérité", "Statut", "Créé le"])
    for r in rows:
        w.writerow([str(r.id)[:8].upper(), r.title, r.severity, r.status, r.created_at.date()])
    return out.getvalue().encode("utf-8-sig")


def _export_changes_csv(db: Session) -> bytes:
    import csv, io
    from app.lifecycle.models import ChangeRequest
    rows = db.query(ChangeRequest).filter(
        ChangeRequest.status.in_(["pending_approval", "approved", "in_progress"])
    ).order_by(ChangeRequest.created_at.desc()).all()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["ID", "Titre", "Type", "Statut", "Priorité", "Créé le"])
    for r in rows:
        w.writerow([str(r.id)[:8].upper(), r.title, r.change_type, r.status, r.priority, r.created_at.date()])
    return out.getvalue().encode("utf-8-sig")


def _report_email_html(name: str, report_type: str, domain: str = "") -> str:
    url = f"https://{domain}" if domain else ""
    return f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#6d28d9;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">CMDB — Rapport planifié</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p>Bonjour,</p>
    <p>Votre rapport <strong>{name}</strong> est disponible en pièce jointe.</p>
    {f'<p style="margin-top:24px"><a href="{url}/reports" style="background:#6d28d9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Accéder aux rapports</a></p>' if url else ''}
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Ce message a été généré automatiquement par la CMDB.</p>
  </div>
</body></html>"""


def check_and_run_scheduled_jobs(db: Session) -> int:
    """Exécute les jobs planifiés dont l'heure est venue. Retourne le nb de jobs lancés."""
    from datetime import date, timedelta
    now = datetime.now(timezone.utc)
    jobs = db.query(ReportJob).filter(
        ReportJob.is_active.is_(True),
        ReportJob.schedule != "manual",
        sa.func.json_array_length(ReportJob.recipients) > 0,
    ).all()

    ran = 0
    for job in jobs:
        if not _is_due(job, now):
            continue
        ok, msg = run_job(db, job)
        if ok:
            ran += 1
    return ran


def _is_due(job: ReportJob, now: datetime) -> bool:
    """Vérifie si le job doit tourner maintenant (entre 7h00 et 7h59 UTC)."""
    if now.hour != 7:
        return False
    last = job.last_run_at

    if job.schedule == "daily":
        return last is None or last.date() < now.date()

    if job.schedule == "weekly":
        return now.weekday() == 0 and (last is None or (now.date() - last.date()).days >= 6)

    if job.schedule == "monthly":
        return now.day == 1 and (last is None or last.month != now.month or last.year != now.year)

    return False
