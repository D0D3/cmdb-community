"""
Routers Key Users (/api/ci/{id}/key-users et /api/keyusers).
  ku_router     : CRUD référents d'un CI (local/entra/ldap).
  search_router : vue globale paginée, recherche multi-source, export/import CSV, sync annuaires.
  Résolution email à l'import : local d'abord → EntraID → LDAP → entrée "fantôme" (ldap:unknown).
"""
import uuid as uuid_mod
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.cmdb.models import CI
from app.core.database import get_db
from app.core.deps import require_role, require_perm

from .models import CIKeyUser, KU_ROLES
from .schemas import CIKeyUserCreate, CIKeyUserOut, CIKeyUserPatch, UserSearchResult, CIKeyUserGlobalOut, KeyUsersPage

ku_router = APIRouter(prefix="/api/ci", tags=["key-users"])
search_router = APIRouter(prefix="/api/keyusers", tags=["key-users"])

_read  = require_perm("keyusers", "read")
_write = require_perm("keyusers", "write")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_out(ku: CIKeyUser) -> CIKeyUserOut:
    if ku.user_type == "local" and ku.local_user:
        display_name = ku.local_user.full_name or ku.local_user.email
        email        = ku.local_user.email
        source_id    = str(ku.local_user_id)
        job_title    = None
        department   = None
    elif ku.user_type == "ldap":
        display_name = ku.ldap_display_name or ku.ldap_email or ""
        email        = ku.ldap_email or ""
        source_id    = ku.ldap_dn or ""
        job_title    = ku.ldap_job_title
        department   = ku.ldap_department
    else:
        display_name = ku.entra_display_name or ku.entra_email or ""
        email        = ku.entra_email or ""
        source_id    = ku.entra_oid or ""
        job_title    = ku.entra_job_title
        department   = ku.entra_department

    return CIKeyUserOut(
        id=ku.id,
        ci_id=ku.ci_id,
        user_type=ku.user_type,
        source_id=source_id,
        display_name=display_name,
        email=email,
        job_title=job_title,
        department=department,
        role=ku.role,
        notes=ku.notes,
        created_at=ku.created_at,
    )


def _get_ci_or_404(db: Session, ci_id: uuid_mod.UUID) -> CI:
    ci = db.get(CI, ci_id)
    if not ci or ci.deleted_at:
        raise HTTPException(404, "CI introuvable")
    return ci


# ── CRUD key users ────────────────────────────────────────────────────────────

@ku_router.get("/{ci_id}/key-users", response_model=list[CIKeyUserOut], dependencies=[_read])
def list_key_users(ci_id: uuid_mod.UUID, db: Session = Depends(get_db)):
    _get_ci_or_404(db, ci_id)
    kus = (
        db.query(CIKeyUser)
        .filter(CIKeyUser.ci_id == ci_id)
        .order_by(CIKeyUser.created_at)
        .all()
    )
    return [_to_out(ku) for ku in kus]


@ku_router.post(
    "/{ci_id}/key-users",
    response_model=CIKeyUserOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_write],
)
def add_key_user(
    ci_id: uuid_mod.UUID,
    payload: CIKeyUserCreate,
    db: Session = Depends(get_db),
):
    _get_ci_or_404(db, ci_id)

    # Vérifier doublon
    if payload.user_type == "local":
        exists = db.scalar(
            select(CIKeyUser).where(
                CIKeyUser.ci_id == ci_id,
                CIKeyUser.local_user_id == payload.local_user_id,
            )
        )
        if exists:
            raise HTTPException(409, "Cet utilisateur est déjà référent de ce CI")
        user = db.get(User, payload.local_user_id)
        if not user or user.deleted_at:
            raise HTTPException(404, "Utilisateur local introuvable")
    elif payload.user_type == "ldap":
        exists = db.scalar(
            select(CIKeyUser).where(
                CIKeyUser.ci_id == ci_id,
                CIKeyUser.ldap_dn == payload.ldap_dn,
            )
        )
        if exists:
            raise HTTPException(409, "Cet utilisateur LDAP est déjà référent de ce CI")
    else:
        exists = db.scalar(
            select(CIKeyUser).where(
                CIKeyUser.ci_id == ci_id,
                CIKeyUser.entra_oid == payload.entra_oid,
            )
        )
        if exists:
            raise HTTPException(409, "Cet utilisateur EntraID est déjà référent de ce CI")

    ku = CIKeyUser(
        ci_id=ci_id,
        user_type=payload.user_type,
        role=payload.role,
        notes=payload.notes,
        local_user_id=payload.local_user_id if payload.user_type == "local" else None,
        entra_oid=payload.entra_oid,
        entra_email=payload.entra_email,
        entra_display_name=payload.entra_display_name,
        entra_job_title=payload.entra_job_title,
        entra_department=payload.entra_department,
        ldap_dn=payload.ldap_dn,
        ldap_uid=payload.ldap_uid,
        ldap_email=payload.ldap_email,
        ldap_display_name=payload.ldap_display_name,
        ldap_job_title=payload.ldap_job_title,
        ldap_department=payload.ldap_department,
    )
    db.add(ku)
    db.commit()
    db.refresh(ku)
    return _to_out(ku)


@ku_router.patch("/{ci_id}/key-users/{ku_id}", response_model=CIKeyUserOut, dependencies=[_write])
def update_key_user(
    ci_id: uuid_mod.UUID,
    ku_id: uuid_mod.UUID,
    payload: CIKeyUserPatch,
    db: Session = Depends(get_db),
):
    ku = db.scalar(select(CIKeyUser).where(CIKeyUser.id == ku_id, CIKeyUser.ci_id == ci_id))
    if not ku:
        raise HTTPException(404, "Référent introuvable")
    if payload.role is not None:
        ku.role = payload.role
    if payload.notes is not None:
        ku.notes = payload.notes
    db.commit()
    db.refresh(ku)
    return _to_out(ku)


@ku_router.delete(
    "/{ci_id}/key-users/{ku_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_write],
)
def remove_key_user(
    ci_id: uuid_mod.UUID,
    ku_id: uuid_mod.UUID,
    db: Session = Depends(get_db),
):
    ku = db.scalar(select(CIKeyUser).where(CIKeyUser.id == ku_id, CIKeyUser.ci_id == ci_id))
    if not ku:
        raise HTTPException(404, "Référent introuvable")
    db.delete(ku)
    db.commit()


# ── Vue globale tous référents ────────────────────────────────────────────────

def _to_global(ku: CIKeyUser, ci: CI) -> CIKeyUserGlobalOut:
    if ku.user_type == "local" and ku.local_user:
        display_name = ku.local_user.full_name or ku.local_user.email
        email        = ku.local_user.email
        source_id    = str(ku.local_user_id)
        job_title    = None
        department   = None
    elif ku.user_type == "ldap":
        display_name = ku.ldap_display_name or ku.ldap_email or ""
        email        = ku.ldap_email or ""
        source_id    = ku.ldap_dn or ""
        job_title    = ku.ldap_job_title
        department   = ku.ldap_department
    else:
        display_name = ku.entra_display_name or ku.entra_email or ""
        email        = ku.entra_email or ""
        source_id    = ku.entra_oid or ""
        job_title    = ku.entra_job_title
        department   = ku.entra_department
    return CIKeyUserGlobalOut(
        id=ku.id,
        ci_id=ci.id,
        ci_name=ci.name,
        ci_type=ci.ci_type,
        ci_criticality=ci.criticality,
        user_type=ku.user_type,
        source_id=source_id,
        display_name=display_name,
        email=email,
        job_title=job_title,
        department=department,
        role=ku.role,
        notes=ku.notes,
        created_at=ku.created_at,
    )


@search_router.get("", response_model=KeyUsersPage, dependencies=[_read])
def list_all_key_users(
    db: Session = Depends(get_db),
    q:       Optional[str] = Query(None, min_length=1),
    role:    Optional[str] = Query(None),
    ci_type: Optional[str] = Query(None),
    skip:    int = Query(0, ge=0),
    limit:   int = Query(50, ge=1, le=200),
):
    from sqlalchemy.orm import joinedload
    qry = (
        db.query(CIKeyUser)
        .join(CI, CIKeyUser.ci_id == CI.id)
        .filter(CI.deleted_at.is_(None))
        .options(
            joinedload(CIKeyUser.local_user),
            joinedload(CIKeyUser.ci),
        )
    )
    if role:
        qry = qry.filter(CIKeyUser.role == role)
    if ci_type:
        qry = qry.filter(CI.ci_type == ci_type)
    if q:
        pattern = f"%{q}%"
        qry = qry.filter(
            or_(
                # utilisateur local
                User.full_name.ilike(pattern),
                User.email.ilike(pattern),
                # entra
                CIKeyUser.entra_display_name.ilike(pattern),
                CIKeyUser.entra_email.ilike(pattern),
                # CI
                CI.name.ilike(pattern),
            )
        ).outerjoin(User, CIKeyUser.local_user_id == User.id)
    total = qry.count()
    rows  = qry.order_by(CI.name, CIKeyUser.created_at).offset(skip).limit(limit).all()
    return KeyUsersPage(
        total=total,
        items=[_to_global(ku, ku.ci) for ku in rows],
    )


# ── Recherche utilisateurs (local + Entra) ────────────────────────────────────

@search_router.get("/search", response_model=list[UserSearchResult], dependencies=[_write])
def search_users(
    q: str = Query(..., min_length=2, max_length=100),
    db: Session = Depends(get_db),
):
    results: list[UserSearchResult] = []

    # Utilisateurs locaux
    pattern = f"%{q}%"
    local_users = (
        db.query(User)
        .filter(
            User.deleted_at.is_(None),
            User.is_active.is_(True),
            or_(User.full_name.ilike(pattern), User.email.ilike(pattern)),
        )
        .limit(10)
        .all()
    )
    for u in local_users:
        results.append(UserSearchResult(
            source="local",
            source_id=str(u.id),
            display_name=u.full_name or u.email,
            email=u.email,
        ))

    # Utilisateurs EntraID (si connecteur configuré et activé)
    entra_results = _search_entra(q, db)
    results.extend(entra_results)

    # Utilisateurs LDAP (si connecteur configuré et activé)
    ldap_results = _search_ldap(q, db)
    results.extend(ldap_results)

    return results[:20]


def _search_ldap(q: str, db: Session) -> list[UserSearchResult]:
    """Recherche dans LDAP/AD si un connecteur ldap est actif."""
    try:
        import ldap3
        from app.connectors.models import Connector
        from app.connectors.crypto import decrypt_config

        connector = db.scalar(
            select(Connector).where(
                Connector.connector_type == "ldap",
                Connector.enabled.is_(True),
            )
        )
        if not connector or not connector.config_encrypted:
            return []

        cfg      = decrypt_config(connector.config_encrypted)
        host     = cfg.get("host", "")
        use_ssl  = cfg.get("use_ssl", "false") in ("true", True, "1")
        port_raw = cfg.get("port", "")
        port     = int(port_raw) if str(port_raw).isdigit() else (636 if use_ssl else 389)
        bind_dn  = cfg.get("bind_dn") or None
        bind_pw  = cfg.get("bind_password") or None
        base_dn  = cfg.get("base_dn", "")

        server = ldap3.Server(host, port=port, use_ssl=use_ssl, get_info=ldap3.NONE)
        conn   = ldap3.Connection(server, user=bind_dn, password=bind_pw, auto_bind=True)

        safe_q = q.replace("*", "").replace("(", "").replace(")", "").replace("\\", "")
        conn.search(
            base_dn,
            f"(&(objectClass=person)(|(displayName=*{safe_q}*)(mail=*{safe_q}*)(sAMAccountName=*{safe_q}*)))",
            attributes=["displayName", "mail", "sAMAccountName", "department", "title"],
            size_limit=8,
        )

        results = []
        for entry in conn.entries:
            email   = str(entry.mail)        if "mail"        in entry and entry.mail        else ""
            display = str(entry.displayName) if "displayName" in entry and entry.displayName else email
            dept    = str(entry.department)  if "department"  in entry and entry.department  else None
            title   = str(entry.title)       if "title"       in entry and entry.title       else None
            uid     = str(entry.sAMAccountName) if "sAMAccountName" in entry and entry.sAMAccountName else ""
            if not email:
                continue
            results.append(UserSearchResult(
                source="ldap",
                source_id=entry.entry_dn,
                display_name=display,
                email=email,
                job_title=title,
                department=dept,
                ldap_uid=uid or None,
            ))
        conn.unbind()
        return results
    except Exception:
        return []


def _search_entra(q: str, db: Session) -> list[UserSearchResult]:
    """Recherche dans Microsoft Entra ID si un connecteur 'entra' est actif."""
    try:
        from app.connectors.models import Connector
        from app.connectors.crypto import decrypt_config

        connector = db.scalar(
            select(Connector).where(
                Connector.connector_type == "entra",
                Connector.enabled.is_(True),
            )
        )
        if not connector or not connector.config_encrypted:
            return []

        config = decrypt_config(connector.config_encrypted)
        tenant_id = config.get("tenant_id", "")
        client_id = config.get("client_id", "")
        client_secret = config.get("client_secret", "")
        if not all([tenant_id, client_id, client_secret]):
            return []

        # Obtenir le token OAuth2
        token_resp = httpx.post(
            f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://graph.microsoft.com/.default",
            },
            timeout=10,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        # Recherche utilisateurs via Graph
        filter_expr = (
            f"startswith(displayName,'{q}') or startswith(userPrincipalName,'{q}')"
        )
        graph_resp = httpx.get(
            "https://graph.microsoft.com/v1.0/users",
            params={
                "$filter": filter_expr,
                "$select": "id,displayName,mail,userPrincipalName,jobTitle,department",
                "$top": "8",
            },
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        graph_resp.raise_for_status()

        return [
            UserSearchResult(
                source="entra",
                source_id=u["id"],
                display_name=u.get("displayName") or u.get("userPrincipalName", ""),
                email=u.get("mail") or u.get("userPrincipalName") or "",
                job_title=u.get("jobTitle"),
                department=u.get("department"),
            )
            for u in graph_resp.json().get("value", [])
        ]
    except Exception:
        return []


# ── Export CSV ────────────────────────────────────────────────────────────────

@search_router.get("/export", dependencies=[_read])
def export_key_users(db: Session = Depends(get_db)):
    import csv as csv_mod, io
    from fastapi.responses import Response as FastResponse
    from sqlalchemy.orm import joinedload

    rows = (
        db.query(CIKeyUser)
        .join(CI, CIKeyUser.ci_id == CI.id)
        .filter(CI.deleted_at.is_(None))
        .options(joinedload(CIKeyUser.local_user), joinedload(CIKeyUser.ci))
        .order_by(CI.name, CIKeyUser.created_at)
        .all()
    )

    buf = io.StringIO()
    w = csv_mod.writer(buf)
    w.writerow(["ci_name", "ci_type", "source", "email", "display_name",
                "department", "job_title", "role", "notes"])
    for ku in rows:
        out = _to_global(ku, ku.ci)
        w.writerow([
            out.ci_name, out.ci_type, out.user_type, out.email,
            out.display_name, out.department or "", out.job_title or "",
            out.role, out.notes or "",
        ])

    content = "﻿".encode() + buf.getvalue().encode("utf-8")
    return FastResponse(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="key_users.csv"'},
    )


# ── Import CSV (change-and-replace) ──────────────────────────────────────────

@search_router.post("/import", dependencies=[_write])
def import_key_users(
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    """
    Colonnes attendues : ci_name, email, role (optionnel), notes (optionnel)
    Pour chaque CI trouvé, remplace tous ses référents par ceux du CSV.
    """
    import csv as csv_mod, io

    content = file.file.read().decode("utf-8-sig")
    reader  = csv_mod.DictReader(io.StringIO(content))

    # Regrouper par CI
    by_ci: dict[str, list[dict]] = {}
    for row in reader:
        ci_name = (row.get("ci_name") or "").strip()
        email   = (row.get("email") or "").strip().lower()
        if not ci_name or not email:
            continue
        by_ci.setdefault(ci_name, []).append({
            "email": email,
            "role":  (row.get("role") or "key_user").strip() or "key_user",
            "notes": (row.get("notes") or "").strip() or None,
        })

    processed = skipped = created = 0
    for ci_name, entries in by_ci.items():
        ci = db.scalar(select(CI).where(CI.name == ci_name, CI.deleted_at.is_(None)))
        if not ci:
            skipped += 1
            continue

        # Supprimer les référents existants de ce CI
        db.query(CIKeyUser).filter(CIKeyUser.ci_id == ci.id).delete()
        processed += 1

        for entry in entries:
            ku = _resolve_and_create_ku(db, ci.id, entry["email"], entry["role"], entry["notes"])
            if ku:
                db.add(ku)
                created += 1

    db.commit()
    return {"processed_cis": processed, "skipped_cis": skipped, "created": created}


def _resolve_and_create_ku(
    db: Session, ci_id, email: str, role: str, notes
) -> "CIKeyUser | None":
    """Résout un email depuis local → EntraID → LDAP et crée un CIKeyUser."""
    # 1. Local
    user = db.scalar(select(User).where(User.email == email, User.deleted_at.is_(None)))
    if user:
        return CIKeyUser(ci_id=ci_id, user_type="local", role=role, notes=notes,
                         local_user_id=user.id)

    # 2. EntraID (recherche par email)
    entra = _search_entra(email, db)
    for r in entra:
        if r.email.lower() == email:
            return CIKeyUser(ci_id=ci_id, user_type="entra", role=role, notes=notes,
                             entra_oid=r.source_id, entra_email=r.email,
                             entra_display_name=r.display_name,
                             entra_job_title=r.job_title,
                             entra_department=r.department)

    # 3. LDAP
    ldap = _search_ldap(email, db)
    for r in ldap:
        if r.email.lower() == email:
            return CIKeyUser(ci_id=ci_id, user_type="ldap", role=role, notes=notes,
                             ldap_dn=r.source_id, ldap_uid=r.ldap_uid,
                             ldap_email=r.email, ldap_display_name=r.display_name,
                             ldap_job_title=r.job_title, ldap_department=r.department)

    # Email inconnu → entrée LDAP "fantôme" avec juste l'email
    return CIKeyUser(ci_id=ci_id, user_type="ldap", role=role, notes=notes,
                     ldap_dn=f"unknown:{email}", ldap_email=email,
                     ldap_display_name=email)


# ── Sync depuis la source de vérité ──────────────────────────────────────────

@search_router.post("/sync", dependencies=[_write])
def sync_key_users(db: Session = Depends(get_db)):
    """
    Rafraîchit display_name/email/department/job_title de tous les référents
    EntraID et LDAP depuis leur connecteur respectif.
    """
    rows = db.query(CIKeyUser).filter(CIKeyUser.user_type.in_(["entra", "ldap"])).all()
    updated = errors = 0

    # Cache des lookups Entra (par OID)
    entra_cache: dict[str, dict] = {}
    ldap_cache:  dict[str, dict] = {}

    for ku in rows:
        try:
            if ku.user_type == "entra" and ku.entra_oid:
                if ku.entra_oid not in entra_cache:
                    entra_cache[ku.entra_oid] = _fetch_entra_user(ku.entra_oid, db) or {}
                data = entra_cache[ku.entra_oid]
                if data:
                    ku.entra_display_name = data.get("displayName", ku.entra_display_name)
                    ku.entra_email        = data.get("mail") or data.get("userPrincipalName") or ku.entra_email
                    ku.entra_job_title    = data.get("jobTitle",   ku.entra_job_title)
                    ku.entra_department   = data.get("department", ku.entra_department)
                    updated += 1

            elif ku.user_type == "ldap" and ku.ldap_dn and not ku.ldap_dn.startswith("unknown:"):
                if ku.ldap_dn not in ldap_cache:
                    ldap_cache[ku.ldap_dn] = _fetch_ldap_user(ku.ldap_dn, db) or {}
                data = ldap_cache[ku.ldap_dn]
                if data:
                    ku.ldap_display_name = data.get("displayName", ku.ldap_display_name)
                    ku.ldap_email        = data.get("mail",        ku.ldap_email)
                    ku.ldap_job_title    = data.get("title",       ku.ldap_job_title)
                    ku.ldap_department   = data.get("department",  ku.ldap_department)
                    updated += 1
        except Exception:
            errors += 1

    db.commit()
    return {"updated": updated, "errors": errors}


def _fetch_entra_user(oid: str, db: Session) -> dict | None:
    try:
        from app.connectors.models import Connector
        from app.connectors.crypto import decrypt_config

        connector = db.scalar(
            select(Connector).where(Connector.connector_type == "entra", Connector.enabled.is_(True))
        )
        if not connector:
            return None
        cfg = decrypt_config(connector.config_encrypted)
        token_resp = httpx.post(
            f"https://login.microsoftonline.com/{cfg['tenant_id']}/oauth2/v2.0/token",
            data={"grant_type": "client_credentials", "client_id": cfg["client_id"],
                  "client_secret": cfg["client_secret"],
                  "scope": "https://graph.microsoft.com/.default"},
            timeout=10,
        )
        token_resp.raise_for_status()
        token = token_resp.json()["access_token"]
        resp = httpx.get(
            f"https://graph.microsoft.com/v1.0/users/{oid}",
            params={"$select": "displayName,mail,userPrincipalName,jobTitle,department"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return None


def _fetch_ldap_user(dn: str, db: Session) -> dict | None:
    try:
        import ldap3
        from app.connectors.models import Connector
        from app.connectors.crypto import decrypt_config

        connector = db.scalar(
            select(Connector).where(Connector.connector_type == "ldap", Connector.enabled.is_(True))
        )
        if not connector:
            return None
        cfg     = decrypt_config(connector.config_encrypted)
        host    = cfg.get("host", "")
        use_ssl = cfg.get("use_ssl", "false") in ("true", True, "1")
        port    = int(cfg.get("port", 0) or (636 if use_ssl else 389))
        server  = ldap3.Server(host, port=port, use_ssl=use_ssl, get_info=ldap3.NONE)
        conn    = ldap3.Connection(server, user=cfg.get("bind_dn"),
                                   password=cfg.get("bind_password"), auto_bind=True)
        conn.search(dn, "(objectClass=*)",
                    search_scope=ldap3.BASE,
                    attributes=["displayName", "mail", "title", "department"])
        if not conn.entries:
            return None
        e = conn.entries[0]
        conn.unbind()
        return {
            "displayName": str(e.displayName) if "displayName" in e and e.displayName else "",
            "mail":        str(e.mail)        if "mail"        in e and e.mail        else "",
            "title":       str(e.title)       if "title"       in e and e.title       else "",
            "department":  str(e.department)  if "department"  in e and e.department  else "",
        }
    except Exception:
        return None
