"""
Modèles SQLAlchemy — module Backup & Restauration.

Trois tables indépendantes mais reliées :
  BackupJob  ──1:N──▶  BackupRun  ──0:N──▶  RestoreLog
                          (CASCADE delete)    (SET NULL sur run_id)

Pourquoi SET NULL plutôt que CASCADE sur RestoreLog.run_id ?
  On veut garder la trace des restaurations même si l'archive source est
  supprimée (rétention atteinte). L'audit prime sur la cohérence de la FK.
"""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models_base import uuid_pk, now_utc

# Valeurs autorisées — validées dans le router, pas par une contrainte DB
# (évite une migration pour ajouter une valeur future)
SCHEDULES    = ("manual", "daily", "weekly", "monthly")
RUN_STATUSES = ("running", "success", "error")
REMOTE_TYPES = ("sftp", "smb")


class BackupJob(Base):
    """
    Configuration d'un job de sauvegarde.

    Un job = une règle (planification + rétention + destination optionnelle).
    L'exécution effective est trackée dans BackupRun.
    Plusieurs jobs peuvent coexister (ex. "Nuit quotidien" + "Semaine SFTP").
    """
    __tablename__ = "backup_jobs"

    id:              Mapped[uuid.UUID] = uuid_pk()
    name:            Mapped[str]       = mapped_column(String(100), nullable=False)
    schedule:        Mapped[str]       = mapped_column(String(20),  nullable=False, default="manual")
    retention_count: Mapped[int]       = mapped_column(Integer,     nullable=False, default=7)
    include_uploads: Mapped[bool]      = mapped_column(Boolean,     nullable=False, default=True)
    is_active:       Mapped[bool]      = mapped_column(Boolean,     nullable=False, default=True)
    # Mis à jour après chaque run réussi — sert à job_due() pour savoir si le job est à déclencher
    last_run_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:      Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc, server_default="now()")
    updated_at:      Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc, server_default="now()")

    # ── Paramètres de planification fine ─────────────────────────────────────
    # schedule_hour     : 0-23 — heure de déclenchement (Paris), défaut 2h
    # schedule_minute   : 0-59 — minute de déclenchement, défaut 0
    # schedule_weekday  : 0-6  — jour de la semaine pour "weekly"  (0=lundi, 6=dimanche)
    # schedule_monthday : 1-31 — jour du mois pour "monthly" ; si > dernier jour du mois, exécuté le dernier jour
    schedule_hour:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=2)
    schedule_minute:   Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
    schedule_weekday:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    schedule_monthday: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # ── Destination distante optionnelle ──────────────────────────────────────
    # Activée seulement si remote_enabled=True — les autres champs sont ignorés sinon.
    # remote_password sert aussi de passphrase pour la clé SSH en mode SFTP.
    # Les credentials sont stockés en clair : acceptable pour on-premise, à chiffrer
    # avec Fernet (comme les connecteurs) si le modèle de menace l'exige.
    remote_enabled:  Mapped[bool]           = mapped_column(Boolean,     nullable=False, default=False)
    remote_type:     Mapped[Optional[str]]  = mapped_column(String(10),  nullable=True)   # "sftp" | "smb"
    remote_host:     Mapped[Optional[str]]  = mapped_column(String(255), nullable=True)
    remote_port:     Mapped[Optional[int]]  = mapped_column(Integer,     nullable=True)   # défaut : 22 SFTP, 445 SMB
    remote_user:     Mapped[Optional[str]]  = mapped_column(String(100), nullable=True)
    remote_password: Mapped[Optional[str]]  = mapped_column(String(500), nullable=True)
    remote_path:     Mapped[Optional[str]]  = mapped_column(String(500), nullable=True)   # chemin relatif au home/share
    remote_ssh_key:  Mapped[Optional[str]]  = mapped_column(Text,        nullable=True)   # clé privée PEM complète (RSA/Ed25519)
    remote_smb_share: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)   # nom du share sans backslashs

    runs: Mapped[list["BackupRun"]] = relationship(
        "BackupRun", back_populates="job", cascade="all, delete-orphan",
        order_by="BackupRun.started_at.desc()",
    )


class BackupRun(Base):
    """
    Une exécution de job (réussie, en erreur, annulée ou encore en cours).

    Cycle de vie :
      1. Créé status="running" avant de lancer le pg_dump en BackgroundTask.
      2. Mis à jour "success" (filename + size_bytes renseignés) ou "error" (error_msg).
      3. Peut être forcé en "error" via le bouton Stop (error_msg="Annulé manuellement").
      4. Si l'API redémarre pendant le backup, le run reste en "running" dans la DB.
         _fix_stale_backup_runs() dans on_startup() le nettoie au prochain démarrage.

    filename : nom court uniquement (ex. "cmdb_backup_20260616_230110.tar.gz").
    Le chemin complet est toujours BACKUP_DIR / filename.
    """
    __tablename__ = "backup_runs"

    id:          Mapped[uuid.UUID]      = uuid_pk()
    job_id:      Mapped[uuid.UUID]      = mapped_column(ForeignKey("backup_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    status:      Mapped[str]            = mapped_column(String(20),  nullable=False, default="running")
    filename:    Mapped[Optional[str]]  = mapped_column(String(300), nullable=True)   # null si erreur avant création du fichier
    size_bytes:  Mapped[Optional[int]]  = mapped_column(Integer,     nullable=True)
    error_msg:   Mapped[Optional[str]]  = mapped_column(Text,        nullable=True)
    started_at:  Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=now_utc)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    job: Mapped["BackupJob"] = relationship("BackupJob", back_populates="runs")


class RestoreLog(Base):
    """
    Trace immuable d'une opération de restauration.

    Créé systématiquement après chaque tentative de restore (succès ou échec).
    run_id est NULL si la source est un upload externe ou si le run associé
    a été supprimé (ON DELETE SET NULL — voir ADR-013).
    """
    __tablename__ = "restore_logs"

    id:           Mapped[uuid.UUID]     = uuid_pk()
    source_type:  Mapped[str]           = mapped_column(String(20),  nullable=False, default="local")
    # Nom du fichier local, nom du fichier uploadé, ou chemin distant SFTP/SMB
    source_ref:   Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Lien vers le BackupRun d'origine — SET NULL si le run est supprimé (rétention)
    run_id:       Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("backup_runs.id", ondelete="SET NULL"), nullable=True)
    status:       Mapped[str]           = mapped_column(String(20),  nullable=False, default="success")
    error_msg:    Mapped[Optional[str]] = mapped_column(Text,        nullable=True)
    started_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=now_utc)
    finished_at:  Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
