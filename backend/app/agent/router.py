"""
Router agent natif (/api/agent/…).
  Tokens  : CRUD admin — le token brut (cagt_…) n'est retourné qu'à la création.
  /report : endpoint public (auth via Bearer token agent) — upsert CI + HardwareDetail.
            Identification : MAC d'abord, hostname ensuite (évite les doublons).
  /download/* : téléchargement du script Python, config, installeurs Shell/PowerShell.
                L'installeur pré-configuré exige de soumettre le token brut pour validation.
"""
import hashlib
import secrets
import uuid as uuid_mod
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role, get_current_user
from app.auth.models import User
from app.cmdb.models import CI, HardwareDetail

from .auth import verify_agent_token
from .models import AgentToken
from .schemas import (
    AgentReport, AgentReportResult,
    AgentTokenCreate, AgentTokenOut, AgentTokenCreated,
)
from .template import (
    AGENT_VERSION,
    generate_script, generate_config,
    generate_installer_linux, generate_installer_windows, generate_installer_macos,
    generate_native_script_linux, generate_native_script_windows, generate_native_script_macos,
    generate_native_installer_linux, generate_native_installer_windows, generate_native_installer_macos,
)

agent_router = APIRouter(prefix="/api/agent", tags=["agent"])

_TOKEN_PREFIX = "cagt_"
_admin = require_role("admin")


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Tokens ────────────────────────────────────────────────────────────────────

@agent_router.post(
    "/tokens",
    response_model=AgentTokenCreated,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_admin],
)
def create_token(
    payload: AgentTokenCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw = _TOKEN_PREFIX + secrets.token_hex(32)
    token = AgentToken(
        name=payload.name,
        description=payload.description,
        token_hash=_hash(raw),
        revoked=False,
        created_by_id=current_user.id,
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    out = AgentTokenCreated.model_validate(token)
    out.raw_token = raw
    return out


@agent_router.get(
    "/tokens",
    response_model=list[AgentTokenOut],
    dependencies=[_admin],
)
def list_tokens(db: Session = Depends(get_db)):
    return db.scalars(select(AgentToken).order_by(AgentToken.created_at.desc())).all()


@agent_router.delete(
    "/tokens/{token_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_admin],
)
def revoke_token(token_id: uuid_mod.UUID, db: Session = Depends(get_db)):
    token = db.get(AgentToken, token_id)
    if not token:
        raise HTTPException(404, "Token introuvable")
    token.revoked = True
    db.commit()


# ── Version (publique — utilisée par l'agent pour détecter les MAJ) ──────────

@agent_router.get("/version")
def agent_version():
    return {"agent_version": AGENT_VERSION}


# ── Rapport système ───────────────────────────────────────────────────────────

@agent_router.post("/report", response_model=AgentReportResult)
def receive_report(
    report: AgentReport,
    token: Annotated[AgentToken, Depends(verify_agent_token)],
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    # Mise à jour last_seen sur le token
    token.last_seen_at = now
    token.last_seen_hostname = report.hostname

    # Chercher CI existant par MAC puis par hostname
    ci = _find_ci_by_mac(db, report.mac_address)
    if not ci and report.hostname:
        ci = _find_ci_by_hostname(db, report.hostname)

    agent_attrs = {
        "agent_mac":       report.mac_address,
        "agent_hostname":  report.hostname,
        "agent_ip":        report.ip_address,
        "agent_cpu_model": report.cpu_model,
        "agent_cpu_count": report.cpu_count,
        "agent_ram_gb":    report.ram_gb,
        "agent_disks":     [d.model_dump() for d in report.disks],
        "agent_version":   report.agent_version,
        "agent_last_seen": now.isoformat(),
    }

    if ci:
        ci.attributes = {**(ci.attributes or {}), **agent_attrs}
        hw = db.get(HardwareDetail, ci.id)
        if hw:
            hw.hw_subtype  = report.hw_subtype
            hw.os_name     = report.os_name
            hw.os_version  = report.os_version
            hw.os_build    = report.os_build
        else:
            db.add(HardwareDetail(
                ci_id=ci.id,
                hw_subtype=report.hw_subtype,
                os_name=report.os_name,
                os_version=report.os_version,
                os_build=report.os_build,
            ))
        action = "updated"
    else:
        ci = CI(
            name=report.hostname,
            ci_type="hardware",
            status="in_service",
            attributes=agent_attrs,
        )
        db.add(ci)
        db.flush()
        db.add(HardwareDetail(
            ci_id=ci.id,
            hw_subtype=report.hw_subtype,
            os_name=report.os_name,
            os_version=report.os_version,
            os_build=report.os_build,
        ))
        action = "created"

    db.commit()
    return AgentReportResult(action=action, ci_id=ci.id, ci_name=ci.name)


def _find_ci_by_mac(db: Session, mac: str | None) -> CI | None:
    if not mac:
        return None
    candidates = db.scalars(
        select(CI).where(CI.ci_type == "hardware", CI.attributes.is_not(None))
    ).all()
    return next((c for c in candidates if (c.attributes or {}).get("agent_mac") == mac), None)


def _find_ci_by_hostname(db: Session, hostname: str) -> CI | None:
    candidates = db.scalars(
        select(CI).where(CI.ci_type == "hardware", CI.attributes.is_not(None))
    ).all()
    return next(
        (c for c in candidates if (c.attributes or {}).get("agent_hostname") == hostname),
        None,
    )


# ── Téléchargements ───────────────────────────────────────────────────────────

@agent_router.get(
    "/download/script",
    dependencies=[_admin],
)
def download_script():
    return Response(
        content=generate_script(),
        media_type="text/x-python",
        headers={"Content-Disposition": 'attachment; filename="cmdb_agent.py"'},
    )


@agent_router.get(
    "/download/native",
    dependencies=[_admin],
)
def download_native_script(os: str = Query(..., pattern="^(linux|windows|macos)$")):
    """Télécharge le script natif brut (Shell ou PowerShell) sans credentials embarqués."""
    generators = {
        "linux":   (generate_native_script_linux,   "cmdb-agent-linux.sh",   "text/x-shellscript"),
        "windows": (generate_native_script_windows,  "cmdb-agent-windows.ps1", "text/plain"),
        "macos":   (generate_native_script_macos,    "cmdb-agent-macos.sh",   "text/x-shellscript"),
    }
    gen_fn, filename, mime = generators[os]
    return Response(
        content=gen_fn(),
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@agent_router.get(
    "/download/config",
    dependencies=[_admin],
)
def download_config(
    token_id: uuid_mod.UUID = Query(..., description="ID du token agent"),
    hw_subtype: str = Query("workstation"),
    db: Session = Depends(get_db),
):
    from app.core.config import get_settings
    token = db.get(AgentToken, token_id)
    if not token or token.revoked:
        raise HTTPException(404, "Token introuvable ou révoqué")
    cmdb_url = f"https://{get_settings().domain}"
    content = generate_config(cmdb_url, f"<token non affiché — créez un nouveau token>", hw_subtype)
    return Response(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": 'attachment; filename="cmdb_agent.conf"'},
    )


@agent_router.get(
    "/download/installer",
    dependencies=[_admin],
)
def download_installer(
    os: str = Query(..., pattern="^(linux|windows|macos)$"),
    hw_subtype: str = Query("workstation"),
    token_id: uuid_mod.UUID = Query(..., description="ID du token agent"),
    db: Session = Depends(get_db),
):
    from app.core.config import get_settings
    token = db.get(AgentToken, token_id)
    if not token or token.revoked:
        raise HTTPException(404, "Token introuvable ou révoqué")

    # Le token brut n'est plus accessible — on exige de recréer pour les installeurs
    raise HTTPException(
        status_code=409,
        detail=(
            "Le token brut n'est disponible qu'à la création. "
            "Pour générer un installeur pré-configuré, créez un nouveau token."
        ),
    )


@agent_router.post(
    "/tokens/{token_id}/native-installer",
    dependencies=[_admin],
)
def generate_native_installer_for_token(
    token_id: uuid_mod.UUID,
    os: str = Query(..., pattern="^(linux|windows|macos)$"),
    hw_subtype: str = Query("workstation"),
    raw_token: str = Query(..., description="Token brut (visible uniquement à la création)"),
    db: Session = Depends(get_db),
):
    """Génère un installeur natif (Shell/PowerShell) auto-configuré avec les credentials."""
    token = db.get(AgentToken, token_id)
    if not token or token.revoked:
        raise HTTPException(404, "Token introuvable ou révoqué")
    if _hash(raw_token) != token.token_hash:
        raise HTTPException(403, "Token brut incorrect")

    from app.core.config import get_settings
    cmdb_url = f"https://{get_settings().domain}"

    generators = {
        "linux":   (generate_native_installer_linux,   "cmdb_agent_installer_native_linux.sh",    "text/x-shellscript"),
        "windows": (generate_native_installer_windows,  "cmdb_agent_installer_native_windows.ps1", "text/plain"),
        "macos":   (generate_native_installer_macos,    "cmdb_agent_installer_native_macos.sh",    "text/x-shellscript"),
    }
    gen_fn, filename, mime = generators[os]
    content = gen_fn(cmdb_url, raw_token, hw_subtype)
    return Response(
        content=content,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@agent_router.post(
    "/tokens/{token_id}/installer",
    dependencies=[_admin],
)
def generate_installer_for_token(
    token_id: uuid_mod.UUID,
    os: str = Query(..., pattern="^(linux|windows|macos)$"),
    hw_subtype: str = Query("workstation"),
    raw_token: str = Query(..., description="Token brut (visible uniquement à la création)"),
    db: Session = Depends(get_db),
):
    """Génère un installeur auto-configuré. Fournir le token brut obtenu à la création."""
    token = db.get(AgentToken, token_id)
    if not token or token.revoked:
        raise HTTPException(404, "Token introuvable ou révoqué")

    # Vérifier que le token brut correspond bien
    if _hash(raw_token) != token.token_hash:
        raise HTTPException(403, "Token brut incorrect")

    from app.core.config import get_settings
    cmdb_url = f"https://{get_settings().domain}"

    generators = {
        "linux":   (generate_installer_linux,   "cmdb_agent_installer_linux.sh",    "text/x-shellscript"),
        "windows": (generate_installer_windows,  "cmdb_agent_installer_windows.ps1", "text/plain"),
        "macos":   (generate_installer_macos,    "cmdb_agent_installer_macos.sh",    "text/x-shellscript"),
    }
    gen_fn, filename, mime = generators[os]
    content = gen_fn(cmdb_url, raw_token, hw_subtype)
    return Response(
        content=content,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
