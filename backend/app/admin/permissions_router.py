"""
Router permissions (/api/admin/permissions/…).
  GET /              : matrice modules × rôles avec permissions effectives.
  PATCH /{role_slug} : mise à jour des permissions d'un rôle (JSON {module:action: bool}).
  POST /{role_slug}/reset : restauration des valeurs par défaut.
  POST /roles        : création d'un rôle personnalisé.
  DELETE /roles/{slug}: suppression d'un rôle non intégré.
  Le rôle 'admin' est toujours all-access (*) et ne peut pas être modifié.
"""
import re
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.auth.models import Role, UserRole

router = APIRouter(prefix="/api/admin/permissions", tags=["permissions"])
DbDep = Annotated[Session, Depends(get_db)]

MODULES = [
    {"key": "ci",          "label": "CIs",              "actions": ["read", "write", "delete"]},
    {"key": "incidents",   "label": "Incidents",         "actions": ["read", "write", "delete"]},
    {"key": "changes",     "label": "Changements",       "actions": ["read", "write", "delete"]},
    {"key": "contracts",   "label": "Contrats SLA",      "actions": ["read", "write", "delete"]},
    {"key": "licences",    "label": "Licences",          "actions": ["read", "write", "delete"]},
    {"key": "cve",         "label": "Vulnérabilités",    "actions": ["read", "write"]},
    {"key": "monitoring",  "label": "Monitoring",        "actions": ["read", "write"]},
    {"key": "network",     "label": "Segments réseau",   "actions": ["read", "write", "delete"]},
    {"key": "connectors",  "label": "Connecteurs",       "actions": ["read", "write"]},
    {"key": "keyusers",    "label": "Key Users",         "actions": ["read", "write", "delete"]},
    {"key": "reports",     "label": "Rapports",          "actions": ["read"]},
    {"key": "audit",       "label": "Audit",             "actions": ["read"]},
    {"key": "users",       "label": "Utilisateurs",      "actions": ["read", "write", "delete"]},
    {"key": "settings",    "label": "Paramètres",        "actions": ["read", "write"]},
]

# Valeurs par défaut pour les rôles en ancien format (clés "ci:hardware", etc.)
_DEFAULTS: dict[str, dict[str, bool]] = {
    "it-infra": {
        "ci:read": True,  "ci:write": True,  "ci:delete": True,
        "incidents:read": True,  "incidents:write": True,  "incidents:delete": False,
        "changes:read": True,    "changes:write": True,    "changes:delete": False,
        "contracts:read": True,  "contracts:write": False, "contracts:delete": False,
        "licences:read": True,   "licences:write": False,  "licences:delete": False,
        "cve:read": True,    "cve:write": True,
        "monitoring:read": True, "monitoring:write": False,
        "network:read": True,    "network:write": True,    "network:delete": False,
        "connectors:read": True, "connectors:write": False,
        "keyusers:read": True,   "keyusers:write": True,   "keyusers:delete": False,
        "reports:read": True,
        "audit:read": True,
        "users:read": False,     "users:write": False,     "users:delete": False,
        "settings:read": False,  "settings:write": False,
    },
    "it-application": {
        "ci:read": True,  "ci:write": True,  "ci:delete": False,
        "incidents:read": True,  "incidents:write": True,  "incidents:delete": False,
        "changes:read": True,    "changes:write": True,    "changes:delete": False,
        "contracts:read": True,  "contracts:write": False, "contracts:delete": False,
        "licences:read": True,   "licences:write": True,   "licences:delete": False,
        "cve:read": True,        "cve:write": True,
        "monitoring:read": True, "monitoring:write": False,
        "network:read": True,    "network:write": False,   "network:delete": False,
        "connectors:read": False,"connectors:write": False,
        "keyusers:read": True,   "keyusers:write": True,   "keyusers:delete": False,
        "reports:read": True,
        "audit:read": False,
        "users:read": False,     "users:write": False,     "users:delete": False,
        "settings:read": False,  "settings:write": False,
    },
    "viewer": {
        "ci:read": True,  "ci:write": False, "ci:delete": False,
        "incidents:read": True,  "incidents:write": False, "incidents:delete": False,
        "changes:read": True,    "changes:write": False,   "changes:delete": False,
        "contracts:read": True,  "contracts:write": False, "contracts:delete": False,
        "licences:read": True,   "licences:write": False,  "licences:delete": False,
        "cve:read": True,        "cve:write": False,
        "monitoring:read": False,"monitoring:write": False,
        "network:read": True,    "network:write": False,   "network:delete": False,
        "connectors:read": False,"connectors:write": False,
        "keyusers:read": True,   "keyusers:write": False,  "keyusers:delete": False,
        "reports:read": True,
        "audit:read": False,
        "users:read": False,     "users:write": False,     "users:delete": False,
        "settings:read": False,  "settings:write": False,
    },
}

_ALL_PERMS = {f"{m['key']}:{a}": True for m in MODULES for a in m["actions"]}


def _is_new_format(perms: dict) -> bool:
    return bool(perms) and any(
        ":" in k and isinstance(v, bool) for k, v in perms.items()
    )


def _effective_perms(role: Role) -> dict[str, bool]:
    perms = role.permissions or {}
    if role.slug == "admin" or perms.get("*") == "write":
        return _ALL_PERMS.copy()
    if _is_new_format(perms):
        return {k: bool(v) for k, v in perms.items()}
    return _DEFAULTS.get(role.slug, {f"{m['key']}:{a}": False for m in MODULES for a in m["actions"]})


@router.get("", dependencies=[require_role("admin")])
def get_permissions_matrix(db: DbDep):
    roles = db.query(Role).order_by(Role.created_at).all()
    return {
        "modules": MODULES,
        "roles": [
            {
                "slug": r.slug,
                "name": r.name,
                "is_builtin": r.is_builtin,
                "is_admin": r.slug == "admin",
                "permissions": _effective_perms(r),
            }
            for r in roles
        ],
    }


class PermissionsUpdate(BaseModel):
    permissions: dict[str, bool]


class RoleCreate(BaseModel):
    name: str
    slug: str

    @field_validator("slug")
    @classmethod
    def slug_format(cls, v: str) -> str:
        if not re.match(r'^[a-z0-9-]{2,50}$', v):
            raise ValueError("Le slug doit contenir uniquement des lettres minuscules, chiffres et tirets (2-50 car.)")
        return v


@router.get("/roles", dependencies=[require_role("admin")])
def list_roles(db: DbDep):
    roles = db.query(Role).order_by(Role.created_at).all()
    return [
        {
            "id": str(r.id),
            "slug": r.slug,
            "name": r.name,
            "is_builtin": r.is_builtin,
            "permissions": _effective_perms(r),
        }
        for r in roles
    ]


@router.post("/roles", dependencies=[require_role("admin")], status_code=201)
def create_role(data: RoleCreate, db: DbDep):
    if db.query(Role).filter(Role.slug == data.slug).first():
        raise HTTPException(status_code=409, detail="Un rôle avec ce slug existe déjà")
    empty_perms = {f"{m['key']}:{a}": False for m in MODULES for a in m["actions"]}
    role = Role(slug=data.slug, name=data.name, is_builtin=False, permissions=empty_perms)
    db.add(role)
    db.commit()
    db.refresh(role)
    return {"id": str(role.id), "slug": role.slug, "name": role.name, "is_builtin": False, "permissions": empty_perms}


@router.delete("/roles/{role_slug}", dependencies=[require_role("admin")], status_code=204)
def delete_role(role_slug: str, db: DbDep):
    PROTECTED = {"admin", "it-infra", "it-application", "viewer"}
    if role_slug in PROTECTED:
        raise HTTPException(status_code=400, detail="Les rôles intégrés ne peuvent pas être supprimés")
    role = db.query(Role).filter(Role.slug == role_slug).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rôle introuvable")
    db.query(UserRole).filter(UserRole.role_id == role.id).delete()
    db.delete(role)
    db.commit()


@router.patch("/{role_slug}", dependencies=[require_role("admin")])
def update_role_permissions(role_slug: str, data: PermissionsUpdate, db: DbDep):
    if role_slug == "admin":
        raise HTTPException(status_code=400, detail="Les permissions admin ne peuvent pas être modifiées")
    role = db.query(Role).filter(Role.slug == role_slug).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rôle introuvable")
    role.permissions = data.permissions
    db.commit()
    return {"slug": role_slug, "permissions": role.permissions}


@router.post("/{role_slug}/reset", dependencies=[require_role("admin")])
def reset_role_permissions(role_slug: str, db: DbDep):
    if role_slug == "admin":
        raise HTTPException(status_code=400, detail="Les permissions admin ne peuvent pas être modifiées")
    if role_slug not in _DEFAULTS:
        raise HTTPException(status_code=400, detail="Pas de valeurs par défaut pour ce rôle")
    role = db.query(Role).filter(Role.slug == role_slug).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rôle introuvable")
    role.permissions = _DEFAULTS[role_slug]
    db.commit()
    return {"slug": role_slug, "permissions": role.permissions}
