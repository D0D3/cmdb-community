"""
Logique métier d'authentification.

  authenticate_local   : vérifie email + mot de passe Argon2id, gère is_locked.
  upsert_ldap_user     : crée ou met à jour un compte depuis les attributs LDAP.
  upsert_oidc_user     : idem depuis les claims OIDC (sub = external_id).
  upsert_saml_user     : idem depuis l'assertion SAML.
  seed_builtin_roles   : idempotent — crée les rôles builtin au démarrage.
  create_api_token     : génère (raw, hash), stocke uniquement le hash.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.auth.models import User, Role, UserRole, RoleGroupMapping, ApiToken
from app.auth.schemas import UserCreate
from app.core.security import hash_password, verify_password, generate_api_token


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email, User.deleted_at.is_(None)).first()


def get_user_by_external_id(db: Session, source: str, external_id: str) -> Optional[User]:
    return db.query(User).filter(
        User.auth_source == source,
        User.external_id == external_id,
        User.deleted_at.is_(None),
    ).first()


def get_role_by_slug(db: Session, slug: str) -> Optional[Role]:
    return db.query(Role).filter(Role.slug == slug).first()


def get_roles_for_groups(db: Session, source: str, groups: list[str]) -> list[Role]:
    if not groups:
        return []
    mappings = (
        db.query(RoleGroupMapping)
        .filter(RoleGroupMapping.source == source, RoleGroupMapping.group_name.in_(groups))
        .all()
    )
    role_ids = {m.role_id for m in mappings}
    return db.query(Role).filter(Role.id.in_(role_ids)).all()


def authenticate_local(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if not user or user.auth_source != "local" or not user.hashed_password:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def upsert_ldap_user(db: Session, ldap_info: dict) -> User:
    user = get_user_by_external_id(db, "ldap", ldap_info["external_id"])
    if not user:
        user = get_user_by_email(db, ldap_info["email"])
    if user:
        user.full_name = ldap_info["full_name"]
        user.auth_source = "ldap"
        user.external_id = ldap_info["external_id"]
    else:
        user = User(
            email=ldap_info["email"],
            full_name=ldap_info["full_name"],
            auth_source="ldap",
            external_id=ldap_info["external_id"],
        )
        db.add(user)
        db.flush()

    # Synchroniser les rôles depuis les groupes LDAP
    mapped_roles = get_roles_for_groups(db, "ldap", ldap_info.get("groups", []))
    if mapped_roles:
        db.query(UserRole).filter(UserRole.user_id == user.id).delete()
        for role in mapped_roles:
            db.add(UserRole(user_id=user.id, role_id=role.id))

    return user


def record_login(db: Session, user: User) -> None:
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()


def create_local_user(db: Session, data: UserCreate) -> User:
    roles = [get_role_by_slug(db, s) for s in data.role_slugs]
    roles = [r for r in roles if r is not None]
    user = User(
        email=data.email,
        full_name=data.full_name,
        auth_source="local",
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    db.flush()
    for role in roles:
        db.add(UserRole(user_id=user.id, role_id=role.id))
    db.commit()
    db.refresh(user)
    return user


def create_api_token(db: Session, user_id: uuid.UUID, name: str, scopes: list[str], expires_at=None) -> tuple[str, ApiToken]:
    raw, token_hash = generate_api_token()
    token = ApiToken(
        name=name,
        token_hash=token_hash,
        scopes=scopes,
        created_by=user_id,
        expires_at=expires_at,
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return raw, token


def revoke_api_token(db: Session, token_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    token = db.query(ApiToken).filter(
        ApiToken.id == token_id, ApiToken.created_by == user_id
    ).first()
    if not token:
        return False
    token.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return True


def upsert_oidc_user(db: Session, claims: dict) -> User:
    """Crée ou met à jour un utilisateur depuis des claims OIDC (ID token MS/Entra)."""
    sub = claims.get("sub") or ""
    email = (claims.get("email") or claims.get("preferred_username") or "").strip().lower()
    if not email:
        raise ValueError("Aucun email dans les claims OIDC")
    full_name = (claims.get("name") or email).strip()

    user = get_user_by_external_id(db, "oidc", sub)
    if not user:
        user = get_user_by_email(db, email)

    if user:
        user.full_name = full_name
        user.auth_source = "oidc"
        user.external_id = sub
    else:
        user = User(
            email=email,
            full_name=full_name,
            auth_source="oidc",
            external_id=sub,
        )
        db.add(user)
        db.flush()

    # Sync rôles depuis les groupes si le claim "groups" est présent (Azure AD opt-in)
    groups = claims.get("groups", [])
    mapped_roles = get_roles_for_groups(db, "oidc", groups)
    if mapped_roles:
        db.query(UserRole).filter(UserRole.user_id == user.id).delete()
        for role in mapped_roles:
            db.add(UserRole(user_id=user.id, role_id=role.id))

    return user


def upsert_saml_user(db: Session, info: dict) -> User:
    """Crée ou met à jour un utilisateur depuis une assertion SAML."""
    external_id = info.get("external_id") or info["email"]
    email = info["email"].strip().lower()
    full_name = (info.get("full_name") or email).strip()

    user = get_user_by_external_id(db, "saml", external_id)
    if not user:
        user = get_user_by_email(db, email)

    if user:
        user.full_name = full_name
        user.auth_source = "saml"
        user.external_id = external_id
    else:
        user = User(
            email=email,
            full_name=full_name,
            auth_source="saml",
            external_id=external_id,
        )
        db.add(user)
        db.flush()

    groups = info.get("groups", [])
    mapped_roles = get_roles_for_groups(db, "saml", groups)
    if mapped_roles:
        db.query(UserRole).filter(UserRole.user_id == user.id).delete()
        for role in mapped_roles:
            db.add(UserRole(user_id=user.id, role_id=role.id))

    return user


def seed_builtin_roles(db: Session) -> None:
    builtin = [
        {
            "slug": "admin",
            "name": "Administrateur",
            "permissions": {"*": "write"},
        },
        {
            "slug": "it-infra",
            "name": "IT Infra",
            "permissions": {"ci:hardware": "write", "ci:software": "read", "alerts": "read"},
        },
        {
            "slug": "it-application",
            "name": "IT Application",
            "permissions": {"ci:software": "write", "ci:hardware": "read", "alerts": "read"},
        },
        {
            "slug": "viewer",
            "name": "Lecteur",
            "permissions": {"ci:hardware": "read", "ci:software": "read", "alerts": "read"},
        },
    ]
    for data in builtin:
        if not get_role_by_slug(db, data["slug"]):
            db.add(Role(slug=data["slug"], name=data["name"], is_builtin=True, permissions=data["permissions"]))
    db.commit()
