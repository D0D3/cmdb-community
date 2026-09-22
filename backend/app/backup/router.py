"""
Router FastAPI — Administration > Sauvegardes (/api/admin/backup).

Toutes les routes exigent le rôle "admin" (dependencies=[_admin]).

Architecture des exécutions (runs) :
  POST /jobs/{jid}/run  → crée un BackupRun status="running" en DB, retourne immédiatement,
                          puis exécute le pg_dump en BackgroundTask pour ne pas bloquer l'API.
  Le run est mis à jour (success/error) à la fin du background task.

Pourquoi BackgroundTask et pas Celery pour les runs manuels ?
  Simplicité — le bouton "Lancer" de l'UI veut un retour immédiat (run_id + status="running").
  Celery est utilisé pour la planification automatique (beat toutes les heures).

Téléchargement d'archive :
  GET /runs/{rid}/download retourne un FileResponse.
  Le frontend ne peut pas utiliser <a href> car le navigateur n'envoie pas le header
  Authorization — il faut passer par axios avec responseType='blob' (voir frontend/src/api/backup.ts).

Sécurité passwords/clés SSH :
  JobOut expose remote_has_password (bool) et remote_has_ssh_key (bool) au lieu des valeurs.
  À la mise à jour (PATCH), si remote_password/remote_ssh_key est null dans le payload,
  on conserve la valeur existante en base (l'UI envoie null quand le champ est laissé vide).
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.backup.models import BackupJob, BackupRun, SCHEDULES, REMOTE_TYPES
from app.backup.service import (
    run_backup, restore_backup, delete_run, push_to_remote, log_restore, BACKUP_DIR
)

router = APIRouter(prefix="/api/admin/backup", tags=["backup"])

DbDep  = Annotated[Session, Depends(get_db)]
_admin = require_role("admin")

# ── Schémas ───────────────────────────────────────────────────────────────────

class JobIn(BaseModel):
    name:            str
    schedule:        str = "manual"
    schedule_hour:     Optional[int] = 2    # 0-23
    schedule_minute:   Optional[int] = 0    # 0-59
    schedule_weekday:  Optional[int] = None  # 0-6 (0=lundi) — weekly seulement
    schedule_monthday: Optional[int] = None  # 1-31 — monthly seulement
    retention_count: int = 7
    include_uploads: bool = True
    is_active:       bool = True
    # Destination distante
    remote_enabled:   bool           = False
    remote_type:      Optional[str]  = None   # sftp | smb
    remote_host:      Optional[str]  = None
    remote_port:      Optional[int]  = None
    remote_user:      Optional[str]  = None
    remote_password:  Optional[str]  = None   # None = inchangé si déjà défini
    remote_path:      Optional[str]  = None
    remote_ssh_key:   Optional[str]  = None
    remote_smb_share: Optional[str]  = None


class JobOut(BaseModel):
    id:              str
    name:            str
    schedule:        str
    schedule_hour:     Optional[int]
    schedule_minute:   Optional[int]
    schedule_weekday:  Optional[int]
    schedule_monthday: Optional[int]
    retention_count: int
    include_uploads: bool
    is_active:       bool
    last_run_at:     Optional[str]
    created_at:      str
    run_count:       int = 0
    # Destination distante
    remote_enabled:   bool
    remote_type:      Optional[str]
    remote_host:      Optional[str]
    remote_port:      Optional[int]
    remote_user:      Optional[str]
    remote_has_password: bool        # masqué : indique juste si défini
    remote_path:      Optional[str]
    remote_has_ssh_key:  bool        # masqué
    remote_smb_share: Optional[str]


class RunOut(BaseModel):
    id:          str
    job_id:      str
    job_name:    str
    status:      str
    filename:    Optional[str]
    size_bytes:  Optional[int]
    error_msg:   Optional[str]
    started_at:  str
    finished_at: Optional[str]


def _job_out(j: BackupJob, db: Session) -> JobOut:
    count = db.query(BackupRun).filter(BackupRun.job_id == j.id).count()
    return JobOut(
        id=str(j.id), name=j.name, schedule=j.schedule,
        schedule_hour=j.schedule_hour,
        schedule_minute=j.schedule_minute,
        schedule_weekday=j.schedule_weekday,
        schedule_monthday=j.schedule_monthday,
        retention_count=j.retention_count, include_uploads=j.include_uploads,
        is_active=j.is_active,
        last_run_at=j.last_run_at.isoformat() if j.last_run_at else None,
        created_at=j.created_at.isoformat(),
        run_count=count,
        remote_enabled=j.remote_enabled,
        remote_type=j.remote_type,
        remote_host=j.remote_host,
        remote_port=j.remote_port,
        remote_user=j.remote_user,
        remote_has_password=bool(j.remote_password),
        remote_path=j.remote_path,
        remote_has_ssh_key=bool(j.remote_ssh_key),
        remote_smb_share=j.remote_smb_share,
    )


def _run_out(r: BackupRun, job_name: str) -> RunOut:
    return RunOut(
        id=str(r.id), job_id=str(r.job_id), job_name=job_name,
        status=r.status, filename=r.filename, size_bytes=r.size_bytes,
        error_msg=r.error_msg,
        started_at=r.started_at.isoformat(),
        finished_at=r.finished_at.isoformat() if r.finished_at else None,
    )


# ── Jobs ──────────────────────────────────────────────────────────────────────

@router.get("/jobs", response_model=list[JobOut], dependencies=[_admin])
def list_jobs(db: DbDep):
    return [_job_out(j, db) for j in db.query(BackupJob).order_by(BackupJob.created_at).all()]


def _validate_job(data: JobIn) -> None:
    if data.schedule not in SCHEDULES:
        raise HTTPException(400, "Planification invalide")
    if not 1 <= data.retention_count <= 90:
        raise HTTPException(400, "Rétention entre 1 et 90")
    if data.remote_enabled and data.remote_type and data.remote_type not in REMOTE_TYPES:
        raise HTTPException(400, "Type distant invalide (sftp ou smb)")
    if data.schedule_hour is not None and not 0 <= data.schedule_hour <= 23:
        raise HTTPException(400, "Heure invalide (0-23)")
    if data.schedule_minute is not None and not 0 <= data.schedule_minute <= 59:
        raise HTTPException(400, "Minute invalide (0-59)")
    if data.schedule_weekday is not None and not 0 <= data.schedule_weekday <= 6:
        raise HTTPException(400, "Jour de semaine invalide (0=lundi … 6=dimanche)")
    if data.schedule_monthday is not None and not 1 <= data.schedule_monthday <= 31:
        raise HTTPException(400, "Jour du mois invalide (1-31)")


@router.post("/jobs", response_model=JobOut, dependencies=[_admin])
def create_job(data: JobIn, db: DbDep):
    _validate_job(data)
    j = BackupJob(**data.model_dump())
    db.add(j)
    db.commit()
    db.refresh(j)
    return _job_out(j, db)


@router.patch("/jobs/{jid}", response_model=JobOut, dependencies=[_admin])
def update_job(jid: uuid.UUID, data: JobIn, db: DbDep):
    j = db.get(BackupJob, jid)
    if not j:
        raise HTTPException(404, "Job introuvable")
    _validate_job(data)
    for k, v in data.model_dump().items():
        # Conserver le mot de passe / clé SSH existants si l'utilisateur n'en fournit pas
        if k == "remote_password" and v is None:
            continue
        if k == "remote_ssh_key" and v is None:
            continue
        setattr(j, k, v)
    j.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(j)
    return _job_out(j, db)


@router.delete("/jobs/{jid}", dependencies=[_admin])
def delete_job(jid: uuid.UUID, db: DbDep):
    j = db.get(BackupJob, jid)
    if not j:
        raise HTTPException(404, "Job introuvable")
    # Supprimer les fichiers associés
    for run in j.runs:
        if run.filename:
            (BACKUP_DIR / run.filename).unlink(missing_ok=True)
    db.delete(j)
    db.commit()
    return {"ok": True}


@router.post("/jobs/{jid}/test-remote", dependencies=[_admin])
def test_remote(jid: uuid.UUID, db: DbDep):
    """Teste la connexion au serveur distant sans effectuer de backup."""
    j = db.get(BackupJob, jid)
    if not j:
        raise HTTPException(404, "Job introuvable")
    if not j.remote_enabled or not j.remote_type or not j.remote_host:
        raise HTTPException(400, "Destination distante non configurée")
    try:
        if j.remote_type == "sftp":
            import paramiko, io
            transport = paramiko.Transport((j.remote_host, j.remote_port or 22))
            if j.remote_ssh_key:
                key_file = io.StringIO(j.remote_ssh_key)
                try:
                    pkey = paramiko.RSAKey.from_private_key(key_file, password=j.remote_password or None)
                except paramiko.SSHException:
                    key_file.seek(0)
                    pkey = paramiko.Ed25519Key.from_private_key(key_file, password=j.remote_password or None)
                transport.connect(username=j.remote_user, pkey=pkey)
            else:
                transport.connect(username=j.remote_user, password=j.remote_password)
            transport.close()
        elif j.remote_type == "smb":
            import smbclient
            smbclient.register_session(j.remote_host, username=j.remote_user,
                                       password=j.remote_password, port=j.remote_port or 445)
            unc = f"\\\\{j.remote_host}\\{(j.remote_smb_share or '').strip('/\\')}"
            smbclient.stat(unc)
        return {"ok": True, "message": f"Connexion {j.remote_type.upper()} réussie vers {j.remote_host}"}
    except Exception as exc:
        raise HTTPException(400, f"Échec de connexion : {exc}")


@router.post("/jobs/{jid}/run", response_model=RunOut, dependencies=[_admin])
def trigger_job(jid: uuid.UUID, background: BackgroundTasks, db: DbDep):
    j = db.get(BackupJob, jid)
    if not j:
        raise HTTPException(404, "Job introuvable")
    # Crée le run "running" immédiatement, exécute en background
    run = BackupRun(job_id=j.id, status="running", started_at=datetime.now(timezone.utc))
    db.add(run)
    db.commit()
    db.refresh(run)
    run_id = run.id

    def _bg():
        from app.core.database import SessionLocal
        with SessionLocal() as s:
            r = s.get(BackupRun, run_id)
            jo = s.get(BackupJob, jid)
            if r and jo:
                # Réutilise run_backup en mode "run existant"
                from app.backup.service import _pg_url, _env_pg, _apply_retention, BACKUP_DIR
                import io, json, tarfile, subprocess, os
                from pathlib import Path
                BACKUP_DIR.mkdir(parents=True, exist_ok=True)
                try:
                    from datetime import datetime, timezone
                    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
                    base = f"cmdb_backup_{ts}"
                    archive = BACKUP_DIR / f"{base}.tar.gz"
                    dump_tmp = BACKUP_DIR / f"{base}_db.dump"
                    import re, os as _os
                    env = _env_pg()
                    res = subprocess.run(
                        ["pg_dump", "-Fc", "-d", _pg_url(), "-f", str(dump_tmp)],
                        capture_output=True, text=True, env=env,
                    )
                    if res.returncode != 0:
                        raise RuntimeError(res.stderr.strip())
                    meta = json.dumps({"cmdb_backup_version": "1", "created_at": ts,
                                       "includes_uploads": jo.include_uploads}, indent=2).encode()
                    with tarfile.open(archive, "w:gz") as tar:
                        tar.add(str(dump_tmp), arcname="db.dump")
                        if jo.include_uploads:
                            up = Path("/app/uploads")
                            if up.exists():
                                tar.add(str(up), arcname="uploads")
                        ti = tarfile.TarInfo(name="metadata.json")
                        ti.size = len(meta)
                        tar.addfile(ti, io.BytesIO(meta))
                    dump_tmp.unlink(missing_ok=True)
                    r.status = "success"
                    r.filename = archive.name
                    r.size_bytes = archive.stat().st_size
                    r.finished_at = datetime.now(timezone.utc)
                    jo.last_run_at = r.finished_at
                    jo.updated_at = r.finished_at
                    # Export distant
                    if jo.remote_enabled and jo.remote_type and jo.remote_host:
                        try:
                            push_to_remote(jo, archive)
                        except Exception as exc_remote:
                            r.error_msg = f"[avertissement] Envoi distant échoué : {exc_remote}"
                    _apply_retention(s, jo)
                except Exception as exc:
                    dump_tmp.unlink(missing_ok=True)
                    r.status = "error"
                    r.error_msg = str(exc)
                    r.finished_at = datetime.now(timezone.utc)
                s.commit()

    background.add_task(_bg)
    return _run_out(run, j.name)


# ── Runs ──────────────────────────────────────────────────────────────────────

@router.get("/runs", response_model=list[RunOut], dependencies=[_admin])
def list_runs(db: DbDep, job_id: Optional[str] = None, limit: int = 100):
    q = db.query(BackupRun).order_by(BackupRun.started_at.desc())
    if job_id:
        q = q.filter(BackupRun.job_id == uuid.UUID(job_id))
    runs = q.limit(limit).all()
    names = {str(j.id): j.name for j in db.query(BackupJob).all()}
    return [_run_out(r, names.get(str(r.job_id), "?")) for r in runs]


@router.post("/runs/{rid}/cancel", dependencies=[_admin])
def cancel_run(rid: uuid.UUID, db: DbDep):
    """
    Annule un run bloqué en 'running'.

    Si le run est déjà terminé (success/error), on répond quand même 200 OK
    avec already_done=True plutôt qu'une erreur 400 — le frontend affiche alors
    un toast informatif au lieu d'un toast d'erreur.
    Cas typique : le backup s'est terminé en < 1 s, le cache React UI affichait
    encore "En cours" quand l'utilisateur a cliqué Stop.

    Note : cette opération ne tue pas le pg_dump en cours (pas de référence au PID).
    Elle marque seulement le run en DB. Si pg_dump tourne encore en arrière-plan,
    il finira naturellement mais son résultat sera ignoré (la DB est déjà à jour).
    """
    r = db.get(BackupRun, rid)
    if not r:
        raise HTTPException(404, "Exécution introuvable")
    if r.status != "running":
        return {"ok": True, "already_done": True, "status": r.status}
    r.status = "error"
    r.error_msg = "Annulé manuellement"
    r.finished_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "already_done": False}


@router.delete("/runs/{rid}", dependencies=[_admin])
def remove_run(rid: uuid.UUID, db: DbDep):
    r = db.get(BackupRun, rid)
    if not r:
        raise HTTPException(404, "Exécution introuvable")
    delete_run(db, r)
    return {"ok": True}


@router.get("/runs/{rid}/download", dependencies=[_admin])
def download_run(rid: uuid.UUID, db: DbDep):
    r = db.get(BackupRun, rid)
    if not r or r.status != "success" or not r.filename:
        raise HTTPException(404, "Fichier indisponible")
    path = BACKUP_DIR / r.filename
    if not path.exists():
        raise HTTPException(404, "Fichier absent du disque")
    return FileResponse(
        str(path), media_type="application/gzip",
        filename=r.filename,
    )


@router.post("/runs/{rid}/restore", dependencies=[_admin])
def restore_from_run(rid: uuid.UUID, db: DbDep):
    """Restaure directement depuis une archive existante dans la liste."""
    r = db.get(BackupRun, rid)
    if not r or r.status != "success" or not r.filename:
        raise HTTPException(404, "Archive indisponible")
    path = BACKUP_DIR / r.filename
    if not path.exists():
        raise HTTPException(404, f"Fichier introuvable sur le disque : {r.filename}")
    try:
        restore_backup(path)
        log_restore(db, source_type="local", source_ref=r.filename, status="success", run_id=r.id)
        return {"ok": True, "message": f"Restauration depuis « {r.filename} » terminée avec succès."}
    except Exception as exc:
        log_restore(db, source_type="local", source_ref=r.filename, status="error", error_msg=str(exc), run_id=r.id)
        raise HTTPException(500, str(exc))


# ── Restauration (upload externe) ─────────────────────────────────────────────

class RestoreLogOut(BaseModel):
    id:          str
    source_type: str
    source_ref:  Optional[str]
    run_id:      Optional[str]
    status:      str
    error_msg:   Optional[str]
    started_at:  str
    finished_at: Optional[str]


@router.get("/restore-logs", response_model=list[RestoreLogOut], dependencies=[_admin])
def list_restore_logs(db: DbDep, limit: int = 50):
    from app.backup.models import RestoreLog
    logs = db.query(RestoreLog).order_by(RestoreLog.started_at.desc()).limit(limit).all()
    return [
        RestoreLogOut(
            id=str(l.id), source_type=l.source_type, source_ref=l.source_ref,
            run_id=str(l.run_id) if l.run_id else None,
            status=l.status, error_msg=l.error_msg,
            started_at=l.started_at.isoformat(),
            finished_at=l.finished_at.isoformat() if l.finished_at else None,
        )
        for l in logs
    ]


@router.post("/restore", dependencies=[_admin])
async def restore(db: DbDep, file: UploadFile = File(...)):
    """
    Restauration depuis un upload externe (.tar.gz).

    Ordre des paramètres : DbDep DOIT être en premier.
    DbDep = Annotated[Session, Depends(get_db)] — si on ajoute = Depends(get_db)
    comme valeur par défaut en plus, FastAPI lève une AssertionError à l'import.
    """
    if not file.filename or not file.filename.endswith(".tar.gz"):
        raise HTTPException(400, "Fichier .tar.gz attendu")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    orig_name = file.filename
    tmp = BACKUP_DIR / f"restore_upload_{uuid.uuid4().hex[:8]}.tar.gz"
    try:
        content = await file.read()
        tmp.write_bytes(content)
        restore_backup(tmp)
        log_restore(db, source_type="upload", source_ref=orig_name, status="success")
        return {"ok": True, "message": "Restauration terminée avec succès."}
    except Exception as exc:
        log_restore(db, source_type="upload", source_ref=orig_name, status="error", error_msg=str(exc))
        raise HTTPException(500, str(exc))
    finally:
        tmp.unlink(missing_ok=True)
