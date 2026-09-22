"""
Service Backup — logique métier de sauvegarde et restauration.

Points d'attention pour qui maintient ce fichier :

1. pg_dump / pg_restore ne sont disponibles que si postgresql-client est installé
   dans le conteneur. C'est dans le Dockerfile RACINE (/opt/docker/cmdb/Dockerfile),
   pas dans backend/Dockerfile (qui n'est pas utilisé par docker-compose).

2. Le mot de passe PostgreSQL est injecté via PGPASSWORD (variable d'env), jamais
   passé en argument CLI — il serait visible dans `ps aux` et les logs système.

3. pg_restore renvoie exit code 1 pour des avertissements mineurs (ex. SET transaction_timeout=0
   non reconnu par pg16 quand le dump vient de pg17). On accepte donc exit 0 ET 1 comme succès.
   Seul exit >= 2 indique une vraie erreur de restauration.

4. /app/uploads est monté comme volume Docker — impossible de rmtree() le point de montage.
   La restauration vide le contenu (fichiers + sous-dossiers) puis copie depuis la sauvegarde.

5. Les fonctions run_backup() et restore_backup() sont synchrones et bloquantes.
   Elles sont toujours appelées depuis un BackgroundTask FastAPI ou une tâche Celery,
   jamais directement dans un handler de requête.
"""
from __future__ import annotations
import io
import json
import logging
import os
import re
import subprocess
import tarfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.backup.models import BackupJob, BackupRun
from app.core.config import get_settings

logger = logging.getLogger(__name__)

BACKUP_DIR = Path("/app/backups")


def _pg_url() -> str:
    """Retire le driver SQLAlchemy (+psycopg, +psycopg2…) pour obtenir une URL native PostgreSQL."""
    url = get_settings().database_url
    return re.sub(r"^postgresql\+\w+://", "postgresql://", url)


def _env_pg() -> dict:
    """
    Construit l'environnement pour pg_dump/pg_restore avec PGPASSWORD.
    Passer le mot de passe en variable d'env est la méthode recommandée par PostgreSQL :
    évite l'exposition dans les arguments de ligne de commande (visibles via ps/proc).
    """
    m = re.match(r"postgresql://([^:]+):([^@]+)@([^/]+)/(.+)", _pg_url())
    if not m:
        return {}
    env = os.environ.copy()
    env["PGPASSWORD"] = m.group(2)
    return env


def run_backup(db: Session, job: BackupJob) -> BackupRun:
    """Exécute une sauvegarde et retourne le BackupRun associé."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    run = BackupRun(job_id=job.id, status="running", started_at=datetime.now(timezone.utc))
    db.add(run)
    db.commit()

    try:
        ts        = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        base_name = f"cmdb_backup_{ts}"
        archive   = BACKUP_DIR / f"{base_name}.tar.gz"
        dump_tmp  = BACKUP_DIR / f"{base_name}_db.dump"

        # ── 1. pg_dump ────────────────────────────────────────────────
        result = subprocess.run(
            ["pg_dump", "-Fc", "-d", _pg_url(), "-f", str(dump_tmp)],
            capture_output=True, text=True, env=_env_pg(),
        )
        if result.returncode != 0:
            raise RuntimeError(f"pg_dump: {result.stderr.strip()}")

        # ── 2. Archive tar.gz ─────────────────────────────────────────
        meta = {
            "cmdb_backup_version": "1",
            "created_at":          ts,
            "includes_uploads":    job.include_uploads,
        }
        meta_bytes = json.dumps(meta, indent=2).encode()

        with tarfile.open(archive, "w:gz") as tar:
            tar.add(str(dump_tmp), arcname="db.dump")

            if job.include_uploads:
                uploads = Path("/app/uploads")
                if uploads.exists():
                    tar.add(str(uploads), arcname="uploads")

            info      = tarfile.TarInfo(name="metadata.json")
            info.size = len(meta_bytes)
            tar.addfile(info, io.BytesIO(meta_bytes))

        dump_tmp.unlink(missing_ok=True)

        # ── 3. Mise à jour du run ─────────────────────────────────────
        run.status      = "success"
        run.filename    = archive.name
        run.size_bytes  = archive.stat().st_size
        run.finished_at = datetime.now(timezone.utc)
        job.last_run_at = run.finished_at
        job.updated_at  = run.finished_at

        # ── 4. Export distant ─────────────────────────────────────────
        # L'échec de l'envoi distant ne fait PAS échouer le backup local :
        # l'archive est déjà créée et sécurisée. On signale juste en avertissement.
        if job.remote_enabled and job.remote_type and job.remote_host:
            try:
                dest = push_to_remote(job, archive)
                logger.info("Archive envoyée vers %s", dest)
            except Exception as exc_remote:
                logger.warning("Envoi distant échoué (backup conservé localement) : %s", exc_remote)
                run.error_msg = f"[avertissement] Envoi distant échoué : {exc_remote}"

        # ── 5. Rétention ──────────────────────────────────────────────
        # Appliquée après l'export distant pour ne pas supprimer des archives
        # avant qu'elles aient eu la chance d'être envoyées.
        _apply_retention(db, job)

    except Exception as exc:
        logger.exception("Backup job %s failed", job.id)
        dump_tmp.unlink(missing_ok=True)
        run.status      = "error"
        run.error_msg   = str(exc)
        run.finished_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(run)
    return run


def restore_backup(archive_path: Path) -> None:
    """Restaure une archive de sauvegarde (DB + uploads)."""
    if not archive_path.exists():
        raise FileNotFoundError(f"Archive introuvable : {archive_path}")

    pg_url  = _pg_url()
    env     = _env_pg()
    tmp_dir = BACKUP_DIR / f"restore_{uuid.uuid4().hex[:8]}"
    tmp_dir.mkdir(parents=True)

    try:
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(tmp_dir, filter="data")

        dump = tmp_dir / "db.dump"
        if not dump.exists():
            raise RuntimeError("Archive invalide : db.dump absent")

        result = subprocess.run(
            ["pg_restore", "-Fc", "-d", pg_url,
             "--clean",       # DROP les objets avant de les recréer
             "--if-exists",   # évite les erreurs si un objet n'existe pas encore
             "--no-owner",    # ignore les SET ROLE — l'utilisateur courant devient propriétaire
             "--no-acl",      # ignore les GRANT/REVOKE — évite les erreurs de permission
             str(dump)],
            capture_output=True, text=True, env=env,
        )
        # Exit 1 = avertissements acceptables (ex. SET transaction_timeout non reconnu par pg16
        # quand le dump vient de pg17). Exit >= 2 = vraie erreur de restauration.
        if result.returncode not in (0, 1):
            raise RuntimeError(f"pg_restore: {result.stderr.strip()}")

        uploads_src = tmp_dir / "uploads"
        if uploads_src.exists():
            import shutil
            dest = Path("/app/uploads")
            dest.mkdir(parents=True, exist_ok=True)
            # /app/uploads est un volume Docker monté : rmtree() sur le point de montage
            # lève OSError (Device or resource busy). On vide le contenu item par item.
            for item in dest.iterdir():
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
            for item in uploads_src.iterdir():
                dst = dest / item.name
                if item.is_dir():
                    shutil.copytree(item, dst)
                else:
                    shutil.copy2(item, dst)

    finally:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)


def log_restore(
    db: "Session",
    source_type: str,
    source_ref: str,
    status: str,
    error_msg: str | None = None,
    run_id: "uuid.UUID | None" = None,
) -> None:
    """Enregistre une restauration dans restore_logs."""
    from app.backup.models import RestoreLog
    now = datetime.now(timezone.utc)
    log = RestoreLog(
        source_type=source_type,
        source_ref=source_ref,
        run_id=run_id,
        status=status,
        error_msg=error_msg,
        started_at=now,
        finished_at=now,
    )
    db.add(log)
    db.commit()


def _apply_retention(db: Session, job: BackupJob) -> None:
    """
    Applique la politique de rétention : garde les N derniers runs réussis,
    supprime les plus anciens (fichier physique + enregistrement DB).
    Les runs en erreur/annulés ne sont pas comptés dans la rétention —
    ils restent visibles dans l'historique jusqu'à suppression manuelle.
    """
    runs = (
        db.query(BackupRun)
        .filter(BackupRun.job_id == job.id, BackupRun.status == "success")
        .order_by(BackupRun.started_at.desc())
        .all()
    )
    for old in runs[job.retention_count:]:
        if old.filename:
            (BACKUP_DIR / old.filename).unlink(missing_ok=True)
        db.delete(old)


def delete_run(db: Session, run: BackupRun) -> None:
    """Supprime un run et son fichier."""
    if run.filename:
        (BACKUP_DIR / run.filename).unlink(missing_ok=True)
    db.delete(run)
    db.commit()


def push_to_remote(job: BackupJob, archive: Path) -> str:
    """Pousse l'archive vers le serveur distant configuré. Retourne un message de statut."""
    if job.remote_type == "sftp":
        return _push_sftp(job, archive)
    if job.remote_type == "smb":
        return _push_smb(job, archive)
    raise ValueError(f"Type distant inconnu : {job.remote_type}")


def _push_sftp(job: BackupJob, archive: Path) -> str:
    import paramiko
    import io

    port = job.remote_port or 22
    transport = paramiko.Transport((job.remote_host, port))
    try:
        if job.remote_ssh_key:
            key_file = io.StringIO(job.remote_ssh_key)
            try:
                pkey = paramiko.RSAKey.from_private_key(key_file, password=job.remote_password or None)
            except paramiko.SSHException:
                key_file.seek(0)
                pkey = paramiko.Ed25519Key.from_private_key(key_file, password=job.remote_password or None)
            transport.connect(username=job.remote_user, pkey=pkey)
        else:
            transport.connect(username=job.remote_user, password=job.remote_password)

        sftp = paramiko.SFTPClient.from_transport(transport)
        remote_dir  = (job.remote_path or "/").rstrip("/")
        remote_path = f"{remote_dir}/{archive.name}"
        try:
            sftp.stat(remote_dir)
        except FileNotFoundError:
            sftp.mkdir(remote_dir)
        sftp.put(str(archive), remote_path)
        sftp.close()
    finally:
        transport.close()

    return f"sftp://{job.remote_host}:{port}{remote_dir}/{archive.name}"


def _push_smb(job: BackupJob, archive: Path) -> str:
    import smbclient

    host    = job.remote_host
    share   = (job.remote_smb_share or "").strip("/\\")
    remote_dir = (job.remote_path or "").strip("/\\")
    filename   = archive.name

    smbclient.register_session(
        host,
        username=job.remote_user,
        password=job.remote_password,
        port=job.remote_port or 445,
    )
    unc_dir = f"\\\\{host}\\{share}"
    if remote_dir:
        unc_dir = f"{unc_dir}\\{remote_dir}"
        try:
            smbclient.makedirs(unc_dir, exist_ok=True)
        except Exception:
            pass

    unc_path = f"{unc_dir}\\{filename}"
    with open(archive, "rb") as local_f:
        with smbclient.open_file(unc_path, mode="wb") as remote_f:
            remote_f.write(local_f.read())

    return f"\\\\{host}\\{share}\\{remote_dir}\\{filename}" if remote_dir else f"\\\\{host}\\{share}\\{filename}"


def job_due(job: BackupJob) -> bool:
    """
    Détermine si un job planifié doit être déclenché maintenant.
    Appelée par run_scheduled_backups() toutes les heures via Celery beat.

    La logique vérifie :
      1. que l'heure courante (Paris) correspond à schedule_hour
      2. que le job n'a pas déjà été exécuté dans cette fenêtre horaire
         (daily → aujourd'hui, weekly → cette semaine au bon jour,
          monthly → ce mois au bon jour)

    Valeurs par défaut si non configurées : hour=2, minute=0, weekday=0 (lundi), monthday=1.
    """
    import zoneinfo
    if not job.is_active or job.schedule == "manual":
        return False

    tz_paris = zoneinfo.ZoneInfo("Europe/Paris")
    now      = datetime.now(tz_paris)
    target_h = job.schedule_hour  if job.schedule_hour  is not None else 2
    target_m = job.schedule_minute if job.schedule_minute is not None else 0

    if now.hour != target_h or now.minute != target_m:
        return False

    if job.last_run_at is None:
        return True

    last = job.last_run_at.astimezone(tz_paris)

    if job.schedule == "daily":
        return last.date() < now.date()

    if job.schedule == "weekly":
        target_wd = job.schedule_weekday if job.schedule_weekday is not None else 0
        if now.weekday() != target_wd:
            return False
        # Semaine ISO courante — pas déjà exécuté cette semaine ce jour-là
        return not (last.isocalendar()[:2] == now.isocalendar()[:2] and last.weekday() == target_wd)

    if job.schedule == "monthly":
        import calendar
        target_md = job.schedule_monthday if job.schedule_monthday is not None else 1
        last_day  = calendar.monthrange(now.year, now.month)[1]
        effective = min(target_md, last_day)
        if now.day != effective:
            return False
        return not (last.year == now.year and last.month == now.month and last.day == effective)

    return False
