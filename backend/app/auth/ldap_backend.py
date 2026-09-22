"""
Authentification et synchronisation LDAP / Active Directory (via ldap3).
Priorité config : connecteur en base de données > variables .env.
Double-bind : premier bind avec le compte de service, puis bind avec les credentials
de l'utilisateur pour valider son mot de passe (évite les faux positifs LDAP anonym).
"""
from ldap3 import Server, Connection, SAFE_SYNC, Tls, ALL_ATTRIBUTES
from ldap3.core.exceptions import LDAPException
import ssl
import logging

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _get_db_ldap_config() -> dict | None:
    """Charge la config LDAP depuis le connecteur actif en base, ou None."""
    try:
        from app.core.database import SessionLocal
        from app.connectors.models import Connector
        from app.connectors.crypto import decrypt_config
        with SessionLocal() as session:
            connector = session.query(Connector).filter(
                Connector.connector_type == "ldap",
                Connector.enabled.is_(True),
            ).first()
            if connector and connector.config_encrypted:
                return decrypt_config(connector.config_encrypted)
    except Exception as exc:
        logger.warning("LDAP : impossible de lire le connecteur DB : %s", exc)
    return None


def _resolve_config() -> dict | None:
    """
    Retourne un dict de config LDAP normalisé, ou None si aucune source active.
    Priorité : connecteur DB > variables d'environnement.
    """
    db_cfg = _get_db_ldap_config()
    if db_cfg:
        host    = db_cfg.get("host", "")
        use_ssl = db_cfg.get("use_ssl", "false") in ("true", True, "1")
        port_v  = db_cfg.get("port", "")
        port    = int(port_v) if str(port_v).isdigit() else (636 if use_ssl else 389)
        return {
            "host":         host,
            "port":         port,
            "use_ssl":      use_ssl,
            "bind_dn":      db_cfg.get("bind_dn", ""),
            "bind_password": db_cfg.get("bind_password", ""),
            "base_dn":      db_cfg.get("base_dn", ""),
            "user_filter":  db_cfg.get("user_filter", "(sAMAccountName={username})"),
            "search_attr":  db_cfg.get("search_attr", "mail"),
            "group_base_dn": db_cfg.get("group_base_dn", ""),
        }

    # Fallback variables d'env
    if settings.ldap_enabled:
        url = settings.ldap_url
        use_ssl = url.lower().startswith("ldaps://")
        host = url.replace("ldaps://", "").replace("ldap://", "").split(":")[0]
        return {
            "host":         host,
            "port":         636 if use_ssl else 389,
            "use_ssl":      use_ssl,
            "bind_dn":      settings.ldap_bind_dn,
            "bind_password": settings.ldap_bind_password,
            "base_dn":      settings.ldap_base_dn,
            "user_filter":  settings.ldap_user_filter,
            "search_attr":  "mail",
            "group_base_dn": settings.ldap_group_base_dn,
        }

    return None


def _make_connection(host: str, port: int, use_ssl: bool,
                     user_dn: str, password: str) -> Connection | None:
    try:
        tls = Tls(validate=ssl.CERT_NONE) if use_ssl else None
        server = Server(host, port=port, use_ssl=use_ssl, tls=tls, get_info=None)
        conn = Connection(server, user=user_dn, password=password, client_strategy=SAFE_SYNC)
        if not conn.bind():
            return None
        return conn
    except LDAPException as e:
        logger.warning("LDAP bind failed: %s", e)
        return None


def authenticate_ldap(username: str, password: str) -> dict | None:
    """
    Authentifie l'utilisateur via LDAP.
    Retourne un dict {"email", "full_name", "external_id", "groups"} ou None.
    Charge la config depuis le connecteur DB en priorité, puis .env en fallback.
    """
    cfg = _resolve_config()
    if not cfg:
        return None

    host    = cfg["host"]
    port    = cfg["port"]
    use_ssl = cfg["use_ssl"]

    # 1. Bind de service pour chercher le DN de l'utilisateur
    service_conn = _make_connection(host, port, use_ssl, cfg["bind_dn"], cfg["bind_password"])
    if not service_conn:
        logger.error("LDAP : impossible de se connecter avec le compte de service (%s:%s)", host, port)
        return None

    user_filter = cfg["user_filter"].format(username=username)
    service_conn.search(
        search_base=cfg["base_dn"],
        search_filter=user_filter,
        attributes=["distinguishedName", "mail", "displayName", "objectGUID", cfg["search_attr"]],
    )
    if not service_conn.entries:
        return None

    entry = service_conn.entries[0]
    user_dn = entry.entry_dn

    # 2. Bind avec les credentials de l'utilisateur pour vérifier le mot de passe
    user_conn = _make_connection(host, port, use_ssl, user_dn, password)
    if not user_conn:
        return None

    # 3. Récupérer les groupes si configuré
    groups: list[str] = []
    group_base = cfg.get("group_base_dn", "")
    if group_base:
        service_conn.search(
            search_base=group_base,
            search_filter=f"(member={user_dn})",
            attributes=["distinguishedName"],
        )
        groups = [e.entry_dn for e in service_conn.entries]

    search_attr = cfg["search_attr"]
    email = (
        str(entry[search_attr]) if search_attr in entry and entry[search_attr] else
        str(entry.mail)         if "mail" in entry and entry.mail else
        f"{username}@ldap.local"
    )
    full_name  = str(entry.displayName) if "displayName" in entry and entry.displayName else username
    external_id = str(entry.objectGUID).strip("{}") if "objectGUID" in entry and entry.objectGUID else user_dn

    return {"email": email, "full_name": full_name, "external_id": external_id, "groups": groups}
