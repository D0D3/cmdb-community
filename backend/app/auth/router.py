"""
Routers d'authentification et de gestion des utilisateurs.

  /api/auth/…     : login (local + LDAP + OIDC redirect + SAML redirect), logout,
                    profil courant, avatar upload, changement mot de passe, TOTP.
  /api/users/…    : CRUD utilisateurs (admin), assignation rôles, verrouillage.
  /api/tokens/…   : tokens API machine (création, liste, révocation).

Le SSO OIDC/SAML utilise un cookie httpOnly __sso_token (durée 60 s) pour
transporter le JWT entre le callback et la page /login du frontend.
"""
import secrets as _secrets
import uuid
from typing import Annotated, Optional

import base64

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from fastapi.responses import RedirectResponse, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import CurrentUser, require_role
from app.core.security import create_access_token, create_partial_token, decode_access_token
from app.auth import service
from app.auth.ldap_backend import authenticate_ldap
from app.auth.oidc import build_authorization_url, exchange_code_for_claims, resolve_oidc_config
from app.auth.saml_backend import resolve_saml_config, get_login_url as saml_login_url, process_response as saml_process, get_sp_metadata, _first
from app.auth.schemas import (
    TokenResponse, LoginResponse, UserOut, UserCreate, UserUpdate,
    ProfileUpdate, PasswordChange, AdminPasswordReset,
    TotpSetupOut, TotpEnableIn, TotpDisableIn, TotpVerifyIn,
    ApiTokenCreate, ApiTokenOut, ApiTokenCreated, ApiTokenAdminOut,
)
from app.auth.models import User, ApiToken

settings = get_settings()

router = APIRouter(prefix="/api/auth", tags=["authentification"])
users_router = APIRouter(prefix="/api/users", tags=["utilisateurs"])
tokens_router = APIRouter(prefix="/api/tokens", tags=["tokens API"])

DbDep = Annotated[Session, Depends(get_db)]


@router.post("/login", response_model=LoginResponse)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbDep):
    # 1. Tentative locale
    user = service.authenticate_local(db, form.username, form.password)

    # 2. Tentative LDAP si local échoue
    if not user:
        ldap_info = authenticate_ldap(form.username, form.password)
        if ldap_info:
            user = service.upsert_ldap_user(db, ldap_info)
            db.commit()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte verrouillé — contactez un administrateur",
        )

    # 2FA requis pour les comptes locaux avec TOTP activé
    if user.totp_enabled and user.auth_source == "local":
        partial = create_partial_token(str(user.id))
        return LoginResponse(totp_required=True, partial_token=partial)

    service.record_login(db, user)
    token = create_access_token(str(user.id), {"email": user.email})
    return LoginResponse(access_token=token)


@router.post("/totp/verify", response_model=TokenResponse)
def totp_verify(data: TotpVerifyIn, db: DbDep):
    import pyotp
    try:
        payload = decode_access_token(data.partial_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")
    if not payload.get("totp_pending"):
        raise HTTPException(status_code=401, detail="Token invalide")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status_code=401, detail="2FA non configuré")
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(status_code=401, detail="Code incorrect")
    service.record_login(db, user)
    token = create_access_token(str(user.id), {"email": user.email})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


# --- OIDC / SSO ---

@router.get("/oidc/config", tags=["authentification"])
def oidc_config():
    cfg = resolve_oidc_config()
    return {"enabled": cfg is not None}


@router.get("/oidc/login", tags=["authentification"])
def oidc_login():
    cfg = resolve_oidc_config()
    if not cfg:
        raise HTTPException(status_code=400, detail="OIDC non configuré")
    state = _secrets.token_urlsafe(16)
    redirect_uri = f"https://{settings.domain}/api/auth/oidc/callback"
    auth_url = build_authorization_url(redirect_uri, state, cfg=cfg)
    resp = RedirectResponse(auth_url)
    resp.set_cookie(
        "oidc_state", state,
        max_age=300,
        httponly=True,
        samesite="lax",
        secure=True,
    )
    return resp


@router.get("/oidc/callback", tags=["authentification"])
def oidc_callback(
    request: Request,
    db: DbDep,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    if error:
        resp = RedirectResponse(f"/login?oidc_error={error}")
        resp.delete_cookie("oidc_state")
        return resp

    cookie_state = request.cookies.get("oidc_state")
    if not cookie_state or cookie_state != state:
        return RedirectResponse("/login?oidc_error=csrf")

    cfg = resolve_oidc_config()
    redirect_uri = f"https://{settings.domain}/api/auth/oidc/callback"
    try:
        claims = exchange_code_for_claims(redirect_uri, code, cfg=cfg)
        user = service.upsert_oidc_user(db, claims)
        db.commit()
        service.record_login(db, user)
        token = create_access_token(str(user.id), {"email": user.email})
    except Exception:
        resp = RedirectResponse("/login?oidc_error=callback_failed")
        resp.delete_cookie("oidc_state")
        return resp

    resp = RedirectResponse("/login")
    resp.delete_cookie("oidc_state")
    resp.set_cookie("__sso_token", token, max_age=60, path="/login", secure=True, samesite="lax")
    return resp


# --- SAML 2.0 ---

@router.get("/saml/config", tags=["authentification"])
def saml_config():
    cfg = resolve_saml_config()
    return {"enabled": cfg is not None}


@router.get("/saml/metadata", tags=["authentification"])
def saml_metadata():
    cfg = resolve_saml_config()
    if not cfg:
        raise HTTPException(status_code=400, detail="SAML non configuré")
    from fastapi.responses import Response as FR
    xml = get_sp_metadata(cfg, settings.domain)
    return FR(content=xml, media_type="application/xml")


@router.get("/saml/login", tags=["authentification"])
def saml_login():
    cfg = resolve_saml_config()
    if not cfg:
        raise HTTPException(status_code=400, detail="SAML non configuré")
    url = saml_login_url(cfg, settings.domain)
    return RedirectResponse(url)


@router.post("/saml/callback", tags=["authentification"])
async def saml_callback(request: Request, db: DbDep):
    import logging as _log
    _logger = _log.getLogger(__name__)
    cfg = resolve_saml_config()
    if not cfg:
        return RedirectResponse("/login?saml_error=not_configured")
    try:
        form = await request.form()
        post_data = {k: str(v) for k, v in form.items()}
        result = saml_process(request, post_data, cfg, settings.domain)
    except Exception as exc:
        _logger.error("SAML callback error: %s", exc)
        return RedirectResponse("/login?saml_error=callback_failed")

    attrs = result["attributes"]
    attr_email  = cfg.get("attr_email", "email")
    attr_name   = cfg.get("attr_name", "displayName")
    attr_groups = cfg.get("attr_groups", "groups")

    email     = _first(attrs.get(attr_email)) or result.get("nameid", "")
    full_name = _first(attrs.get(attr_name)) or email
    groups    = attrs.get(attr_groups, [])

    if not email:
        return RedirectResponse("/login?saml_error=no_email")

    try:
        user = service.upsert_saml_user(db, {
            "email":       email.strip().lower(),
            "full_name":   full_name.strip(),
            "external_id": result["nameid"] or email,
            "groups":      groups if isinstance(groups, list) else [groups],
        })
        db.commit()
    except Exception as exc:
        _logger.error("SAML upsert error: %s", exc)
        return RedirectResponse("/login?saml_error=user_error")

    if not user.is_active or user.is_locked:
        return RedirectResponse("/login?saml_error=account_disabled")

    service.record_login(db, user)
    token = create_access_token(str(user.id), {"email": user.email})
    resp = RedirectResponse("/login")
    resp.set_cookie("__sso_token", token, max_age=60, path="/login", secure=True, samesite="lax")
    return resp


# --- Profil de l'utilisateur connecté ---

@users_router.get("/me", response_model=UserOut)
def get_my_profile(user: CurrentUser):
    return user


@users_router.patch("/me", response_model=UserOut)
def update_my_profile(data: ProfileUpdate, db: DbDep, user: CurrentUser):
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.notify_critical_alerts is not None:
        user.notify_critical_alerts = data.notify_critical_alerts
    db.commit()
    db.refresh(user)
    return user


_AVATAR_MAX   = 2 * 1024 * 1024   # 2 Mo
_AVATAR_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@users_router.post("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def upload_my_avatar(db: DbDep, user: CurrentUser, file: UploadFile = File(...)):
    from datetime import datetime, timezone
    if file.content_type not in _AVATAR_MIMES:
        raise HTTPException(400, f"Format non supporté : {file.content_type}")
    data = await file.read()
    if len(data) > _AVATAR_MAX:
        raise HTTPException(400, "Image trop volumineuse (max 2 Mo)")
    user.avatar_data = base64.b64encode(data).decode("ascii")
    user.avatar_mime = file.content_type
    user.updated_at = datetime.now(timezone.utc)
    db.commit()


@users_router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_avatar(db: DbDep, user: CurrentUser):
    user.avatar_data = None
    user.avatar_mime = None
    db.commit()


@users_router.get("/{user_id}/avatar")
def get_user_avatar(user_id: uuid.UUID, db: DbDep):
    """Sert l'avatar d'un utilisateur (public)."""
    u = db.get(User, user_id)
    if not u or not u.avatar_data or not u.avatar_mime:
        raise HTTPException(404, "Pas d'avatar")
    raw = base64.b64decode(u.avatar_data)
    return Response(
        content=raw,
        media_type=u.avatar_mime,
        headers={"Cache-Control": "public, max-age=3600"},
    )


@users_router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_my_password(data: PasswordChange, db: DbDep, user: CurrentUser):
    from app.core.security import verify_password, hash_password
    if user.auth_source != "local":
        raise HTTPException(status_code=400, detail="Changement de mot de passe non disponible pour les comptes SSO/LDAP")
    if not user.hashed_password or not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    user.hashed_password = hash_password(data.new_password)
    db.commit()


@users_router.post("/me/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
def heartbeat(db: DbDep, user: CurrentUser):
    from datetime import datetime, timezone
    user.last_active_at = datetime.now(timezone.utc)
    db.commit()


@users_router.post("/me/totp/setup", response_model=TotpSetupOut)
def totp_setup(db: DbDep, user: CurrentUser):
    import pyotp
    if user.auth_source != "local":
        raise HTTPException(status_code=400, detail="2FA disponible uniquement pour les comptes locaux")
    secret = pyotp.random_base32()
    # Sauvegarde le secret (non encore activé)
    user.totp_secret = secret
    user.totp_enabled = False
    db.commit()
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="CMDB")
    return TotpSetupOut(secret=secret, uri=uri)


@users_router.post("/me/totp/enable", status_code=status.HTTP_204_NO_CONTENT)
def totp_enable(data: TotpEnableIn, db: DbDep, user: CurrentUser):
    import pyotp
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="Lancez d'abord la configuration 2FA")
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Code incorrect — vérifiez l'heure de votre appareil")
    user.totp_enabled = True
    db.commit()


@users_router.delete("/me/totp/disable", status_code=status.HTTP_204_NO_CONTENT)
def totp_disable(data: TotpDisableIn, db: DbDep, user: CurrentUser):
    import pyotp
    if not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status_code=400, detail="Le 2FA n'est pas activé")
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Code incorrect")
    user.totp_enabled = False
    user.totp_secret = None
    db.commit()


# --- Gestion des utilisateurs (admin) ---

@users_router.get("/", response_model=list[UserOut], dependencies=[require_role("admin")])
def list_users(db: DbDep, caller: CurrentUser, skip: int = 0, limit: int = 100):
    users = (
        db.query(User)
        .filter(User.deleted_at.is_(None))
        .offset(skip).limit(limit).all()
    )
    return [UserOut.model_validate(u) for u in users]


@users_router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED,
                   dependencies=[require_role("admin")])
def create_user(data: UserCreate, db: DbDep):
    if service.get_user_by_email(db, data.email):
        raise HTTPException(status_code=409, detail="Email déjà utilisé")
    return service.create_local_user(db, data)


@users_router.get("/{user_id}", response_model=UserOut, dependencies=[require_role("admin")])
def get_user(user_id: uuid.UUID, db: DbDep):
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return user


@users_router.patch("/{user_id}", response_model=UserOut, dependencies=[require_role("admin")])
def update_user(user_id: uuid.UUID, data: UserUpdate, db: DbDep):
    from app.auth.models import UserRole, Role
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.is_locked is not None:
        user.is_locked = data.is_locked
    if data.role_slugs is not None:
        db.query(UserRole).filter(UserRole.user_id == user.id).delete()
        for slug in data.role_slugs:
            role = service.get_role_by_slug(db, slug)
            if role:
                db.add(UserRole(user_id=user.id, role_id=role.id))
    db.commit()
    db.refresh(user)
    return user


@users_router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT,
                   dependencies=[require_role("admin")])
def admin_reset_password(user_id: uuid.UUID, data: AdminPasswordReset, db: DbDep):
    from app.core.security import hash_password
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.auth_source != "local":
        raise HTTPException(status_code=400, detail="Réinitialisation impossible pour les comptes SSO/LDAP")
    user.hashed_password = hash_password(data.new_password)
    db.commit()


@users_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT,
                     dependencies=[require_role("admin")])
def delete_user(user_id: uuid.UUID, db: DbDep, current: CurrentUser):
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="Impossible de se supprimer soi-même")
    from datetime import datetime, timezone
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    user.deleted_at = datetime.now(timezone.utc)
    db.commit()


# --- Tokens API ---

@tokens_router.get("/", response_model=list[ApiTokenOut])
def list_tokens(db: DbDep, user: CurrentUser):
    return db.query(ApiToken).filter(
        ApiToken.created_by == user.id,
        ApiToken.revoked_at.is_(None),
    ).all()


@tokens_router.post("/", response_model=ApiTokenCreated, status_code=status.HTTP_201_CREATED)
def create_token(data: ApiTokenCreate, db: DbDep, user: CurrentUser):
    raw, token_obj = service.create_api_token(
        db, user.id, data.name, data.scopes, data.expires_at
    )
    return ApiTokenCreated(
        **ApiTokenOut.model_validate(token_obj).model_dump(),
        token=raw,
    )


@tokens_router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_token(token_id: uuid.UUID, db: DbDep, user: CurrentUser):
    if not service.revoke_api_token(db, token_id, user.id):
        raise HTTPException(status_code=404, detail="Token introuvable")


@tokens_router.get("/admin/all", response_model=list[ApiTokenAdminOut],
                   dependencies=[require_role("admin")])
def list_all_tokens(db: DbDep):
    from sqlalchemy.orm import joinedload
    tokens = (
        db.query(ApiToken)
        .options(joinedload(ApiToken.created_by_user))
        .filter(ApiToken.revoked_at.is_(None))
        .order_by(ApiToken.created_at.desc())
        .all()
    )
    result = []
    for t in tokens:
        out = ApiTokenAdminOut(
            id=t.id,
            name=t.name,
            scopes=t.scopes,
            expires_at=t.expires_at,
            last_used_at=t.last_used_at,
            created_at=t.created_at,
            created_by_name=t.created_by_user.full_name if t.created_by_user else None,
        )
        result.append(out)
    return result
