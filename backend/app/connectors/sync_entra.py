"""Synchronisation Microsoft EntraID → utilisateurs CMDB."""
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.connectors.crypto import decrypt_config
from .models import Connector


def _ms_token(config: dict) -> str:
    resp = httpx.post(
        f"https://login.microsoftonline.com/{config['tenant_id']}/oauth2/v2.0/token",
        data={
            "grant_type":    "client_credentials",
            "client_id":     config["client_id"],
            "client_secret": config["client_secret"],
            "scope":         "https://graph.microsoft.com/.default",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _paginate(url: str, token: str, params: Optional[dict] = None) -> list[dict]:
    """Parcourt toutes les pages d'une réponse Graph API."""
    headers = {"Authorization": f"Bearer {token}"}
    items: list[dict] = []
    next_url: Optional[str] = url
    while next_url:
        resp = httpx.get(
            next_url,
            headers=headers,
            params=params if next_url == url else None,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        items.extend(data.get("value", []))
        next_url = data.get("@odata.nextLink")
    return items


def _fetch_group_members(group_names: list[str], token: str) -> set[str] | None:
    """
    Retourne l'ensemble des OID membres des groupes listés, ou None si aucun groupe.
    Résolution : displayName exact → membres récursifs (transitiveMemberOf).
    """
    if not group_names:
        return None

    member_oids: set[str] = set()
    for name in group_names:
        name = name.strip()
        if not name:
            continue
        # Chercher le groupe par displayName
        groups = _paginate(
            "https://graph.microsoft.com/v1.0/groups",
            token,
            params={"$filter": f"displayName eq '{name}'", "$select": "id,displayName"},
        )
        for g in groups:
            gid = g["id"]
            # Membres transitifs (inclut les sous-groupes)
            members = _paginate(
                f"https://graph.microsoft.com/v1.0/groups/{gid}/transitiveMembers/microsoft.graph.user",
                token,
                params={"$select": "id"},
            )
            for m in members:
                member_oids.add(m["id"])
    return member_oids


def sync_entra_users(connector: Connector, db: Session) -> dict:
    """
    Synchronise les utilisateurs Entra ID dans la table users CMDB.
    - Si sync_groups est configuré, ne synchronise que les membres de ces groupes
    - Crée les nouveaux utilisateurs (auth_source='entra', hashed_password=None)
    - Met à jour full_name et is_active des existants
    - Désactive les comptes Entra supprimés/bloqués
    Renvoie un résumé {created, updated, deactivated, total, errors}.
    """
    cfg = decrypt_config(connector.config_encrypted)
    token = _ms_token(cfg)

    # Filtrage optionnel par groupe
    sync_groups_raw = cfg.get("sync_groups", "")
    group_names = [g.strip() for g in sync_groups_raw.split(",") if g.strip()] if sync_groups_raw else []
    allowed_oids = _fetch_group_members(group_names, token) if group_names else None

    entra_users = _paginate(
        "https://graph.microsoft.com/v1.0/users",
        token,
        params={
            "$select": "id,displayName,mail,userPrincipalName,jobTitle,department,accountEnabled",
            "$top": "999",
        },
    )

    created = updated = deactivated = errors = 0
    seen_oids: set[str] = set()
    skipped = 0

    for eu in entra_users:
        # Filtrer par groupe si configuré
        if allowed_oids is not None and eu.get("id") not in allowed_oids:
            skipped += 1
            continue
        try:
            oid = eu["id"]
            email = (eu.get("mail") or eu.get("userPrincipalName") or "").strip().lower()
            if not email:
                continue
            full_name = (eu.get("displayName") or email).strip()
            is_active = bool(eu.get("accountEnabled", True))
            seen_oids.add(oid)

            # Recherche par OID Entra, puis par email
            user = db.scalar(
                select(User).where(
                    User.auth_source == "entra",
                    User.external_id == oid,
                )
            )
            if not user:
                user = db.scalar(select(User).where(User.email == email))

            if user:
                user.full_name = full_name
                user.is_active = is_active
                user.auth_source = "entra"
                user.external_id = oid
                if not is_active:
                    deactivated += 1
                else:
                    updated += 1
            else:
                db.add(User(
                    email=email,
                    full_name=full_name,
                    auth_source="entra",
                    external_id=oid,
                    is_active=is_active,
                ))
                created += 1
        except Exception:
            errors += 1

    db.commit()
    result: dict = {
        "created":    created,
        "updated":    updated,
        "deactivated": deactivated,
        "total":      len(entra_users) - skipped,
        "errors":     errors,
    }
    if group_names:
        result["hint"] = f"Filtre groupes : {', '.join(group_names)} ({skipped} utilisateurs exclus)"
    return result


def search_entra_users(connector: "Connector", q: str, db: Session) -> list[dict]:
    """Recherche jusqu'à 25 utilisateurs EntraID correspondant à q (nom ou email), sans import."""
    cfg = decrypt_config(connector.config_encrypted)
    token = _ms_token(cfg)

    resp = httpx.get(
        "https://graph.microsoft.com/v1.0/users",
        headers={
            "Authorization": f"Bearer {token}",
            "ConsistencyLevel": "eventual",
        },
        params={
            "$search": f'"displayName:{q}" OR "mail:{q}" OR "userPrincipalName:{q}"',
            "$select": "id,displayName,mail,userPrincipalName,accountEnabled",
            "$top": "25",
            "$count": "true",
        },
        timeout=15,
    )
    resp.raise_for_status()

    existing_oids: set[str] = set(db.scalars(
        select(User.external_id).where(User.auth_source == "entra", User.external_id.isnot(None))
    ).all())

    result = []
    for eu in resp.json().get("value", []):
        email = (eu.get("mail") or eu.get("userPrincipalName") or "").strip().lower()
        if not email:
            continue
        result.append({
            "external_id":   eu["id"],
            "email":         email,
            "full_name":     (eu.get("displayName") or email).strip(),
            "already_exists": eu["id"] in existing_oids,
        })
    return result


def import_entra_user(connector: "Connector", external_id: str, db: Session) -> dict:
    """Importe (ou met à jour) un seul utilisateur EntraID par son OID. Retourne {user, created}."""
    cfg = decrypt_config(connector.config_encrypted)
    token = _ms_token(cfg)

    resp = httpx.get(
        f"https://graph.microsoft.com/v1.0/users/{external_id}",
        headers={"Authorization": f"Bearer {token}"},
        params={"$select": "id,displayName,mail,userPrincipalName,accountEnabled"},
        timeout=15,
    )
    resp.raise_for_status()
    eu = resp.json()

    email = (eu.get("mail") or eu.get("userPrincipalName") or "").strip().lower()
    if not email:
        raise ValueError("Utilisateur EntraID sans email")

    full_name = (eu.get("displayName") or email).strip()
    is_active = bool(eu.get("accountEnabled", True))

    user = db.scalar(select(User).where(User.auth_source == "entra", User.external_id == external_id))
    if not user:
        user = db.scalar(select(User).where(User.email == email))

    created = False
    if user:
        user.full_name    = full_name
        user.is_active    = is_active
        user.auth_source  = "entra"
        user.external_id  = external_id
    else:
        user = User(email=email, full_name=full_name, auth_source="entra",
                    external_id=external_id, is_active=is_active)
        db.add(user)
        created = True

    db.flush()
    return {"user": user, "created": created}
