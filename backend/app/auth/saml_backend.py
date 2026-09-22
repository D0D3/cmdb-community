"""SAML 2.0 Service Provider helpers — symétrique à oidc.py."""
import logging
from fastapi import Request

logger = logging.getLogger(__name__)


# ── Résolution de la config depuis la DB ──────────────────────────────────────

def resolve_saml_config() -> dict | None:
    """
    Retourne la config SAML depuis le connecteur DB (type='saml', enabled=True) ou None.
    """
    try:
        from app.core.database import SessionLocal
        from app.connectors.models import Connector
        from app.connectors.crypto import decrypt_config
        with SessionLocal() as session:
            connector = session.query(Connector).filter(
                Connector.connector_type == "saml",
                Connector.enabled.is_(True),
            ).first()
            if connector and connector.config_encrypted:
                cfg = decrypt_config(connector.config_encrypted)
                if cfg.get("idp_entity_id") and cfg.get("idp_sso_url") and cfg.get("idp_cert"):
                    return cfg
    except Exception as exc:
        logger.warning("SAML : impossible de lire le connecteur DB : %s", exc)
    return None


# ── Construction du dict de settings python3-saml ─────────────────────────────

def _build_settings(cfg: dict, domain: str) -> dict:
    sp_entity_id = cfg.get("sp_entity_id") or f"https://{domain}/saml/metadata"
    acs_url = f"https://{domain}/api/auth/saml/callback"

    sp: dict = {
        "entityId": sp_entity_id,
        "assertionConsumerService": {
            "url": acs_url,
            "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
        },
        "NameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    }
    if cfg.get("sp_cert") and cfg.get("sp_key"):
        sp["x509cert"] = cfg["sp_cert"].strip()
        sp["privateKey"] = cfg["sp_key"].strip()

    idp_cert = cfg["idp_cert"].strip()
    # Nettoie le PEM si l'utilisateur a collé les lignes -----BEGIN/END-----
    if "-----BEGIN CERTIFICATE-----" in idp_cert:
        idp_cert = (
            idp_cert
            .replace("-----BEGIN CERTIFICATE-----", "")
            .replace("-----END CERTIFICATE-----", "")
            .replace("\n", "")
            .replace("\r", "")
            .strip()
        )

    return {
        "strict": True,
        "debug": False,
        "sp": sp,
        "idp": {
            "entityId": cfg["idp_entity_id"],
            "singleSignOnService": {
                "url": cfg["idp_sso_url"],
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "x509cert": idp_cert,
        },
    }


# ── Requête adaptée pour python3-saml ─────────────────────────────────────────

def _adapt_request(request: Request, post_data: dict | None = None) -> dict:
    host = request.headers.get("host", request.url.netloc)
    return {
        "https": "on" if request.url.scheme == "https" else "off",
        "http_host": host,
        "server_port": str(request.url.port or (443 if request.url.scheme == "https" else 80)),
        "script_name": request.url.path,
        "get_data": dict(request.query_params),
        "post_data": post_data or {},
    }


# ── URL de redirection vers l'IdP ─────────────────────────────────────────────

def get_login_url(cfg: dict, domain: str) -> str:
    from onelogin.saml2.auth import OneLogin_Saml2_Auth
    req = {
        "https": "on",
        "http_host": domain,
        "server_port": "443",
        "script_name": "/api/auth/saml/login",
        "get_data": {},
        "post_data": {},
    }
    auth = OneLogin_Saml2_Auth(req, old_settings=_build_settings(cfg, domain))
    return auth.login()


# ── Métadonnées SP (XML à fournir à l'IdP) ───────────────────────────────────

def get_sp_metadata(cfg: dict, domain: str) -> str:
    from onelogin.saml2.settings import OneLogin_Saml2_Settings
    settings = OneLogin_Saml2_Settings(settings=_build_settings(cfg, domain), sp_validation_only=True)
    metadata = settings.get_sp_metadata()
    errors = settings.validate_metadata(metadata)
    if errors:
        raise ValueError(f"Metadata SP invalide : {errors}")
    return metadata if isinstance(metadata, str) else metadata.decode()


# ── Traitement de la réponse SAML ─────────────────────────────────────────────

def process_response(request: Request, post_data: dict, cfg: dict, domain: str) -> dict:
    """
    Valide l'assertion SAML reçue de l'IdP.
    Retourne {"nameid": str, "attributes": dict, "session_index": str}.
    """
    from onelogin.saml2.auth import OneLogin_Saml2_Auth
    req = _adapt_request(request, post_data)
    auth = OneLogin_Saml2_Auth(req, old_settings=_build_settings(cfg, domain))
    auth.process_response()
    errors = auth.get_errors()
    if errors:
        reason = auth.get_last_error_reason() or ""
        raise ValueError(f"Réponse SAML invalide : {errors} — {reason}")
    if not auth.is_authenticated():
        raise ValueError("Assertion SAML non authentifiée")
    return {
        "nameid":        auth.get_nameid() or "",
        "attributes":    auth.get_attributes(),
        "session_index": auth.get_session_index() or "",
    }


def _first(value) -> str:
    """Extrait la première valeur d'une liste d'attributs SAML."""
    if isinstance(value, list):
        return value[0] if value else ""
    return value or ""
