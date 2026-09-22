"""
Dépendances FastAPI injectables (Depends) utilisées dans tous les routers.

  DbDep          → session SQLAlchemy (get_db)
  CurrentUser    → utilisateur JWT ou token API machine (get_current_user)
  require_role() → vérifie qu'au moins un rôle de la liste correspond
  require_perm() → vérifie une permission fine module:action (ex. "cmdb:write")

Deux modes d'authentification supportés en parallèle :
  - Bearer JWT  : sessions UI (header Authorization: Bearer …)
  - X-API-Token : tokens API machine (scope read/write pour intégrations)
"""
import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token, hash_api_token
from app.auth.models import User, ApiToken

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Token", auto_error=False)

DbDep = Annotated[Session, Depends(get_db)]


def _get_user_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()


def get_current_user(
    db: DbDep,
    bearer: str | None = Depends(oauth2_scheme),
    api_key: str | None = Security(api_key_header),
) -> User:
    # Authentification par token API machine
    if api_key:
        token_hash = hash_api_token(api_key)
        token_obj = (
            db.query(ApiToken)
            .filter(
                ApiToken.token_hash == token_hash,
                ApiToken.revoked_at.is_(None),
            )
            .first()
        )
        if not token_obj:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token API invalide")
        user = _get_user_by_id(db, token_obj.created_by)
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur inactif")
        return user

    # Authentification par JWT session UI
    if bearer:
        try:
            payload = decode_access_token(bearer)
            user_id = uuid.UUID(payload["sub"])
        except (jwt.PyJWTError, KeyError, ValueError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
        user = _get_user_by_id(db, user_id)
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur inactif")
        return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentification requise",
        headers={"WWW-Authenticate": "Bearer"},
    )


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*slugs: str):
    def _check(user: CurrentUser) -> User:
        user_slugs = {r.slug for r in user.roles}
        if not user_slugs.intersection(slugs):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès refusé")
        return user
    return Depends(_check)


def require_perm(module: str, action: str):
    """Vérifie une permission fine-grained stockée dans Role.permissions."""
    perm_key = f"{module}:{action}"

    def _check(user: CurrentUser) -> User:
        # admin a tous les droits
        user_slugs = {r.slug for r in user.roles}
        if "admin" in user_slugs:
            return user
        # Cherche la permission dans n'importe lequel des rôles de l'utilisateur
        for role in user.roles:
            perms = role.permissions or {}
            if perms.get(perm_key):
                return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission requise : {perm_key}",
        )

    return Depends(_check)


def require_admin(user: CurrentUser) -> User:
    user_slugs = {r.slug for r in user.roles}
    if "admin" not in user_slugs:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès refusé")
    return user


