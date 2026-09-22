"""Branding — thème, couleur primaire, logo.

Logo par défaut : tant qu'aucun logo n'est uploadé (ou après suppression),
/api/branding/logo sert le logo Capybara embarqué (assets/capybara_logo.svg)
plutôt que 404 — la marque par défaut reste visible même sans configuration.
"""
from __future__ import annotations

import base64
import os
import re
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from .models import BrandingSetting

branding_router = APIRouter(prefix="/api/branding", tags=["branding"])
DbDep  = Annotated[Session, Depends(get_db)]
_admin = require_role("admin")

# Taille max logo : 2 Mo
MAX_LOGO_BYTES = 2 * 1024 * 1024
ALLOWED_MIMES  = {"image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif"}
HEX_RE         = re.compile(r"^#[0-9a-fA-F]{6}$")

_DEFAULT_LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "capybara_logo.svg")
_DEFAULT_LOGO_MIME = "image/svg+xml"


def _default_logo_bytes() -> bytes:
    with open(_DEFAULT_LOGO_PATH, "rb") as f:
        return f.read()


# ── Schémas ───────────────────────────────────────────────────────────────────

class BrandingOut(BaseModel):
    app_name:         str
    primary_color:    str
    sidebar_color:    str
    login_bg_enabled: bool
    has_logo:         bool
    updated_at:       Optional[datetime]

    model_config = {"from_attributes": True}


class BrandingUpdate(BaseModel):
    app_name:         Optional[str]  = None
    primary_color:    Optional[str]  = None
    sidebar_color:    Optional[str]  = None
    login_bg_enabled: Optional[bool] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create(db: Session) -> BrandingSetting:
    row = db.get(BrandingSetting, 1)
    if not row:
        row = BrandingSetting(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _to_out(row: BrandingSetting) -> BrandingOut:
    return BrandingOut(
        app_name=row.app_name,
        primary_color=row.primary_color,
        sidebar_color=row.sidebar_color,
        login_bg_enabled=row.login_bg_enabled,
        has_logo=True,  # toujours un logo à afficher : celui de l'admin, sinon le Capybara par défaut
        updated_at=row.updated_at,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@branding_router.get("", response_model=BrandingOut)
def get_branding(db: DbDep):
    """Public — chargé au démarrage pour appliquer le thème."""
    return _to_out(_get_or_create(db))


@branding_router.patch("", response_model=BrandingOut, dependencies=[_admin])
def update_branding(data: BrandingUpdate, db: DbDep):
    row = _get_or_create(db)
    if data.app_name is not None:
        if not data.app_name.strip():
            raise HTTPException(status_code=422, detail="app_name ne peut pas être vide")
        row.app_name = data.app_name.strip()[:100]
    if data.primary_color is not None:
        if not HEX_RE.match(data.primary_color):
            raise HTTPException(status_code=422, detail="primary_color doit être un code hex #RRGGBB")
        row.primary_color = data.primary_color.lower()
    if data.sidebar_color is not None:
        if not HEX_RE.match(data.sidebar_color):
            raise HTTPException(status_code=422, detail="sidebar_color doit être un code hex #RRGGBB")
        row.sidebar_color = data.sidebar_color.lower()
    if data.login_bg_enabled is not None:
        row.login_bg_enabled = data.login_bg_enabled
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@branding_router.post("/logo", response_model=BrandingOut,
                      status_code=status.HTTP_200_OK, dependencies=[_admin])
async def upload_logo(db: DbDep, file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_MIMES:
        raise HTTPException(
            status_code=415,
            detail=f"Format non supporté : {file.content_type}. Acceptés : PNG, JPEG, SVG, WebP, GIF",
        )
    data = await file.read()
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=413, detail="Logo trop volumineux (max 2 Mo)")

    row = _get_or_create(db)
    row.logo_data  = base64.b64encode(data).decode("ascii")
    row.logo_mime  = file.content_type
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@branding_router.delete("/logo", response_model=BrandingOut, dependencies=[_admin])
def delete_logo(db: DbDep):
    row = _get_or_create(db)
    row.logo_data  = None
    row.logo_mime  = None
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@branding_router.get("/logo")
def get_logo(db: DbDep):
    """Sert le logo brut (public) — logo custom si configuré, sinon le Capybara par défaut."""
    row = _get_or_create(db)
    if row.logo_data and row.logo_mime:
        content, mime = base64.b64decode(row.logo_data), row.logo_mime
    else:
        content, mime = _default_logo_bytes(), _DEFAULT_LOGO_MIME
    return Response(
        content=content,
        media_type=mime,
        headers={"Cache-Control": "public, max-age=3600"},
    )
