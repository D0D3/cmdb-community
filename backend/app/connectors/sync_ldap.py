"""Synchronisation LDAP / Active Directory → utilisateurs CMDB."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.connectors.crypto import decrypt_config
from .models import Connector


def sync_ldap_users(connector: Connector, db: Session) -> dict:
    """
    Synchronise les utilisateurs LDAP/AD dans la table users CMDB.
    - Filtre : (objectClass=person) avec attribut mail obligatoire
    - Crée les nouveaux comptes (auth_source='ldap', pas de mot de passe local)
    - Met à jour full_name des existants
    Renvoie {created, updated, total, errors}.
    """
    try:
        import ldap3
    except ImportError as e:
        raise RuntimeError("ldap3 non installé") from e

    cfg = decrypt_config(connector.config_encrypted)

    host        = cfg.get("host", "")
    use_ssl     = cfg.get("use_ssl", "false") in ("true", True, "1")
    port_raw    = cfg.get("port", "")
    port        = int(port_raw) if str(port_raw).isdigit() else (636 if use_ssl else 389)
    bind_dn     = cfg.get("bind_dn") or None
    bind_pass   = cfg.get("bind_password") or None
    base_dn     = cfg.get("base_dn", "")
    user_filter = cfg.get("user_filter", "(objectClass=person)")
    search_attr = cfg.get("search_attr", "mail")

    server = ldap3.Server(host, port=port, use_ssl=use_ssl, get_info=ldap3.ALL)
    conn = ldap3.Connection(
        server,
        user=bind_dn,
        password=bind_pass,
        auto_bind=True,
        raise_exceptions=True,
    )

    conn.search(
        base_dn,
        user_filter,
        attributes=["cn", "displayName", "mail", "sAMAccountName",
                    "objectGUID", "userAccountControl", "givenName", "sn"],
    )

    created = updated = errors = 0
    total = 0

    for entry in conn.entries:
        try:
            email = str(entry[search_attr]).strip().lower() if search_attr in entry else ""
            if not email or email == "[]":
                continue
            total += 1

            display = (
                str(entry.displayName) if "displayName" in entry and entry.displayName else
                str(entry.cn)          if "cn" in entry and entry.cn else
                email
            ).strip()

            # Désactivé en AD si userAccountControl bit 2 (0x0002) est positionné
            uac = int(str(entry.userAccountControl)) if "userAccountControl" in entry and entry.userAccountControl else 0
            is_active = not bool(uac & 0x0002)

            # Identifiant unique LDAP (objectGUID si dispo, sinon sAMAccountName)
            ext_id = (
                str(entry.objectGUID).strip("{}")
                if "objectGUID" in entry and entry.objectGUID
                else str(entry.sAMAccountName)
                if "sAMAccountName" in entry and entry.sAMAccountName
                else email
            )

            user = db.scalar(
                select(User).where(User.auth_source == "ldap", User.external_id == ext_id)
            )
            if not user:
                user = db.scalar(select(User).where(User.email == email))

            if user:
                user.full_name = display
                user.is_active = is_active
                user.auth_source = "ldap"
                user.external_id = ext_id
                updated += 1
            else:
                db.add(User(
                    email=email,
                    full_name=display,
                    auth_source="ldap",
                    external_id=ext_id,
                    is_active=is_active,
                ))
                created += 1
        except Exception:
            errors += 1

    db.commit()
    return {
        "created": created,
        "updated": updated,
        "total":   total,
        "errors":  errors,
    }


def _ldap_connect(cfg: dict):
    try:
        import ldap3
    except ImportError as e:
        raise RuntimeError("ldap3 non installé") from e

    host      = cfg.get("host", "")
    use_ssl   = cfg.get("use_ssl", "false") in ("true", True, "1")
    port_raw  = cfg.get("port", "")
    port      = int(port_raw) if str(port_raw).isdigit() else (636 if use_ssl else 389)
    bind_dn   = cfg.get("bind_dn") or None
    bind_pass = cfg.get("bind_password") or None

    server = ldap3.Server(host, port=port, use_ssl=use_ssl, get_info=ldap3.ALL)
    conn   = ldap3.Connection(server, user=bind_dn, password=bind_pass,
                               auto_bind=True, raise_exceptions=True)
    return conn


def _ldap_entry_to_dict(entry, search_attr: str, existing_ext_ids: set[str]) -> dict | None:
    email = str(entry[search_attr]).strip().lower() if search_attr in entry else ""
    if not email or email == "[]":
        return None

    display = (
        str(entry.displayName) if "displayName" in entry and entry.displayName else
        str(entry.cn)          if "cn"          in entry and entry.cn          else
        email
    ).strip()

    ext_id = (
        str(entry.objectGUID).strip("{}")
        if "objectGUID" in entry and entry.objectGUID
        else str(entry.sAMAccountName)
        if "sAMAccountName" in entry and entry.sAMAccountName
        else email
    )

    return {
        "external_id":    ext_id,
        "email":          email,
        "full_name":      display,
        "already_exists": ext_id in existing_ext_ids,
    }


def search_ldap_users(connector: "Connector", q: str, db: Session) -> list[dict]:
    """Recherche jusqu'à 25 utilisateurs LDAP correspondant à q (nom ou email), sans import."""
    cfg         = decrypt_config(connector.config_encrypted)
    search_attr = cfg.get("search_attr", "mail")
    base_dn     = cfg.get("base_dn", "")
    conn        = _ldap_connect(cfg)

    # Échappement LDAP basique
    q_safe = q.replace("\\", "\\5c").replace("*", "\\2a").replace("(", "\\28").replace(")", "\\29")
    ldap_filter = (
        f"(|(mail=*{q_safe}*)(displayName=*{q_safe}*)(cn=*{q_safe}*)(sAMAccountName=*{q_safe}*))"
    )

    conn.search(base_dn, ldap_filter,
                attributes=["cn", "displayName", "mail", "sAMAccountName", "objectGUID"],
                size_limit=25)

    existing_ext_ids: set[str] = set(db.scalars(
        select(User.external_id).where(User.auth_source == "ldap", User.external_id.isnot(None))
    ).all())

    result = []
    for entry in conn.entries:
        d = _ldap_entry_to_dict(entry, search_attr, existing_ext_ids)
        if d:
            result.append(d)
    return result


def import_ldap_user(connector: "Connector", external_id: str, db: Session) -> dict:
    """Importe (ou met à jour) un seul utilisateur LDAP par son external_id. Retourne {user, created}."""
    try:
        import ldap3
    except ImportError as e:
        raise RuntimeError("ldap3 non installé") from e

    cfg         = decrypt_config(connector.config_encrypted)
    search_attr = cfg.get("search_attr", "mail")
    base_dn     = cfg.get("base_dn", "")
    conn        = _ldap_connect(cfg)

    # Recherche par objectGUID ou sAMAccountName
    ext_safe    = external_id.replace("\\", "\\5c").replace("*", "\\2a")
    ldap_filter = f"(|(objectGUID={ext_safe})(sAMAccountName={ext_safe}))"
    conn.search(base_dn, ldap_filter,
                attributes=["cn", "displayName", "mail", "sAMAccountName",
                            "objectGUID", "userAccountControl"],
                size_limit=1)

    if not conn.entries:
        raise ValueError(f"Utilisateur LDAP introuvable : {external_id}")

    entry  = conn.entries[0]
    email  = str(entry[search_attr]).strip().lower() if search_attr in entry else ""
    if not email or email == "[]":
        raise ValueError("Utilisateur LDAP sans email")

    display = (
        str(entry.displayName) if "displayName" in entry and entry.displayName else
        str(entry.cn)          if "cn" in entry and entry.cn else email
    ).strip()

    uac       = int(str(entry.userAccountControl)) if "userAccountControl" in entry and entry.userAccountControl else 0
    is_active = not bool(uac & 0x0002)

    user = db.scalar(select(User).where(User.auth_source == "ldap", User.external_id == external_id))
    if not user:
        user = db.scalar(select(User).where(User.email == email))

    created = False
    if user:
        user.full_name   = display
        user.is_active   = is_active
        user.auth_source = "ldap"
        user.external_id = external_id
    else:
        user = User(email=email, full_name=display, auth_source="ldap",
                    external_id=external_id, is_active=is_active)
        db.add(user)
        created = True

    db.flush()
    return {"user": user, "created": created}
