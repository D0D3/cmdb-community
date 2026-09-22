"""Endpoints admin pour configurer SSO SAML 2.0 et les mappings groupe→rôle."""
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import get_settings
from app.core.deps import require_role
from app.connectors.models import Connector
from app.connectors.crypto import encrypt_config, decrypt_config
from app.auth.models import Role, RoleGroupMapping

router = APIRouter(prefix="/api/admin/saml", tags=["saml admin"])
DbDep = Annotated[Session, Depends(get_db)]
settings = get_settings()

_SENSITIVE = {"sp_key"}


def _mask(cfg: dict) -> dict:
    return {k: "***" if k in _SENSITIVE and v else v for k, v in cfg.items()}


def _get_connector(db: Session) -> Optional[Connector]:
    return db.query(Connector).filter(Connector.connector_type == "saml").first()


# ── GET — lire la config actuelle ─────────────────────────────────────────────

@router.get("", dependencies=[require_role("admin")])
def get_saml_config(db: DbDep):
    domain = settings.domain
    connector = _get_connector(db)
    sp_entity_id = f"https://{domain}/saml/metadata"
    sp_acs_url   = f"https://{domain}/api/auth/saml/callback"

    if not connector or not connector.config_encrypted:
        return {
            "configured":   False,
            "enabled":      False,
            "sp_entity_id": sp_entity_id,
            "sp_acs_url":   sp_acs_url,
            "config":       None,
        }

    cfg = decrypt_config(connector.config_encrypted)
    # Préserve l'entity_id SP si l'utilisateur en a défini un
    sp_entity_id = cfg.get("sp_entity_id") or sp_entity_id

    return {
        "configured":   True,
        "enabled":      connector.enabled,
        "sp_entity_id": sp_entity_id,
        "sp_acs_url":   sp_acs_url,
        "config":       _mask(cfg),
    }


# ── POST — créer ou mettre à jour ─────────────────────────────────────────────

class SamlConfigIn(BaseModel):
    idp_entity_id: str
    idp_sso_url:   str
    idp_cert:      str
    attr_email:    str = "email"
    attr_name:     str = "displayName"
    attr_groups:   str = "groups"
    sp_entity_id:  Optional[str] = None
    sp_cert:       Optional[str] = None
    sp_key:        Optional[str] = None
    enabled:       bool = True


@router.post("", dependencies=[require_role("admin")])
def save_saml_config(data: SamlConfigIn, db: DbDep):
    cfg = data.model_dump(exclude_none=True)
    enabled = cfg.pop("enabled", True)
    encrypted = encrypt_config(cfg)

    connector = _get_connector(db)
    if connector:
        connector.config_encrypted = encrypted
        connector.enabled = enabled
        connector.name = "SSO SAML"
    else:
        connector = Connector(
            name="SSO SAML",
            connector_type="saml",
            config_encrypted=encrypted,
            enabled=enabled,
        )
        db.add(connector)
    db.commit()
    return {"ok": True}


# ── DELETE — supprimer la config ──────────────────────────────────────────────

@router.delete("", dependencies=[require_role("admin")], status_code=204)
def delete_saml_config(db: DbDep):
    connector = _get_connector(db)
    if connector:
        db.delete(connector)
        db.commit()


# ── GET /metadata — XML SP pour l'IdP ────────────────────────────────────────

@router.get("/metadata", dependencies=[require_role("admin")])
def get_sp_metadata_xml(db: DbDep):
    from app.auth.saml_backend import resolve_saml_config, get_sp_metadata
    cfg = resolve_saml_config()
    if not cfg:
        raise HTTPException(400, "SAML non configuré ou désactivé")
    try:
        xml = get_sp_metadata(cfg, settings.domain)
    except Exception as exc:
        raise HTTPException(400, f"Erreur metadata : {exc}")
    return Response(content=xml, media_type="application/xml")


# ── GET /oidc-status — état de la config OIDC (env vars) ─────────────────────

@router.get("/oidc-status", dependencies=[require_role("admin")])
def get_oidc_status():
    """Retourne l'état OIDC configuré via variables d'environnement."""
    from app.auth.oidc import resolve_oidc_config
    cfg = resolve_oidc_config()
    if not cfg:
        return {"enabled": False, "issuer": None, "client_id": None, "provider": None}
    issuer = cfg.get("issuer", "")
    provider = "Microsoft Entra ID" if "microsoft" in issuer or "windows" in issuer or "azure" in issuer else \
               "Google" if "google" in issuer else \
               "Okta" if "okta" in issuer else "OIDC Provider"
    client_id = cfg.get("client_id", "")
    return {
        "enabled":   True,
        "issuer":    issuer,
        "client_id": client_id[:8] + "…" + client_id[-4:] if len(client_id) > 12 else client_id,
        "provider":  provider,
    }


# ── Mappings groupe IdP → rôle CMDB ──────────────────────────────────────────

VALID_SOURCES = {"saml", "oidc", "ldap"}


class GroupMappingIn(BaseModel):
    source:     str   # saml | oidc | ldap
    group_name: str
    role_id:    str


class GroupMappingOut(BaseModel):
    id:         str
    source:     str
    group_name: str
    role_id:    str
    role_name:  str
    role_slug:  str


@router.get("/group-mappings", dependencies=[require_role("admin")])
def list_group_mappings(db: DbDep) -> list[GroupMappingOut]:
    rows = (
        db.query(RoleGroupMapping)
        .join(Role, Role.id == RoleGroupMapping.role_id)
        .order_by(RoleGroupMapping.source, RoleGroupMapping.group_name)
        .all()
    )
    return [
        GroupMappingOut(
            id=str(r.id),
            source=r.source,
            group_name=r.group_name,
            role_id=str(r.role_id),
            role_name=r.role.name,
            role_slug=r.role.slug,
        )
        for r in rows
    ]


@router.post("/group-mappings", dependencies=[require_role("admin")], status_code=201)
def create_group_mapping(data: GroupMappingIn, db: DbDep) -> GroupMappingOut:
    if data.source not in VALID_SOURCES:
        raise HTTPException(400, f"Source invalide — valeurs acceptées : {', '.join(sorted(VALID_SOURCES))}")
    if not data.group_name.strip():
        raise HTTPException(400, "Le nom du groupe ne peut pas être vide")
    role = db.query(Role).filter(Role.id == uuid.UUID(data.role_id)).first()
    if not role:
        raise HTTPException(404, "Rôle introuvable")
    existing = db.query(RoleGroupMapping).filter(
        RoleGroupMapping.source == data.source,
        RoleGroupMapping.group_name == data.group_name.strip(),
        RoleGroupMapping.role_id == role.id,
    ).first()
    if existing:
        raise HTTPException(409, "Ce mapping existe déjà")
    mapping = RoleGroupMapping(
        source=data.source,
        group_name=data.group_name.strip(),
        role_id=role.id,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return GroupMappingOut(
        id=str(mapping.id),
        source=mapping.source,
        group_name=mapping.group_name,
        role_id=str(mapping.role_id),
        role_name=role.name,
        role_slug=role.slug,
    )


@router.delete("/group-mappings/{mapping_id}", dependencies=[require_role("admin")], status_code=204)
def delete_group_mapping(mapping_id: uuid.UUID, db: DbDep):
    mapping = db.query(RoleGroupMapping).filter(RoleGroupMapping.id == mapping_id).first()
    if not mapping:
        raise HTTPException(404, "Mapping introuvable")
    db.delete(mapping)
    db.commit()
