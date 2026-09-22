"""Helpers OAuth2 / OIDC — Authorization Code Flow."""
import httpx
import jwt as pyjwt
import logging
from authlib.integrations.httpx_client import OAuth2Client

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _discover(issuer: str) -> dict:
    url = f"{issuer.rstrip('/')}/.well-known/openid-configuration"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()


def _get_entra_config_from_db() -> dict | None:
    """Charge la config Entra du connecteur DB actif, ou None."""
    try:
        from app.core.database import SessionLocal
        from app.connectors.models import Connector
        from app.connectors.crypto import decrypt_config
        with SessionLocal() as session:
            connector = session.query(Connector).filter(
                Connector.connector_type == "entra",
                Connector.enabled.is_(True),
            ).first()
            if connector and connector.config_encrypted:
                return decrypt_config(connector.config_encrypted)
    except Exception as exc:
        logger.warning("OIDC : impossible de lire le connecteur Entra DB : %s", exc)
    return None


def resolve_oidc_config() -> dict | None:
    """
    Retourne un dict {issuer, client_id, client_secret} ou None si inactif.
    Priorité : connecteur Entra DB > variables d'environnement.
    """
    db_cfg = _get_entra_config_from_db()
    if db_cfg:
        tenant_id = db_cfg.get("tenant_id", "")
        client_id = db_cfg.get("client_id", "")
        client_secret = db_cfg.get("client_secret", "")
        if tenant_id and client_id and client_secret:
            return {
                "issuer":        f"https://login.microsoftonline.com/{tenant_id}/v2.0",
                "client_id":     client_id,
                "client_secret": client_secret,
            }

    # Fallback variables d'env
    if settings.oidc_enabled:
        return {
            "issuer":        settings.oidc_issuer,
            "client_id":     settings.oidc_client_id,
            "client_secret": settings.oidc_client_secret,
        }

    return None


def build_authorization_url(redirect_uri: str, state: str, cfg: dict | None = None) -> str:
    if cfg is None:
        cfg = resolve_oidc_config()
    if not cfg:
        raise ValueError("OIDC non configuré")
    doc = _discover(cfg["issuer"])
    client = OAuth2Client(client_id=cfg["client_id"], redirect_uri=redirect_uri)
    url, _ = client.create_authorization_url(
        doc["authorization_endpoint"],
        state=state,
        scope="openid email profile",
    )
    return url


def exchange_code_for_claims(redirect_uri: str, code: str, cfg: dict | None = None) -> dict:
    """Échange un code d'autorisation contre les claims OIDC de l'utilisateur."""
    if cfg is None:
        cfg = resolve_oidc_config()
    if not cfg:
        raise ValueError("OIDC non configuré")
    doc = _discover(cfg["issuer"])
    client = OAuth2Client(
        client_id=cfg["client_id"],
        client_secret=cfg["client_secret"],
        redirect_uri=redirect_uri,
    )
    tokens = client.fetch_token(doc["token_endpoint"], code=code, grant_type="authorization_code")
    id_token = tokens.get("id_token")
    if not id_token:
        raise ValueError("id_token absent dans la réponse MS")
    # Décode sans vérification de signature : token reçu directement de l'endpoint MS via HTTPS
    claims = pyjwt.decode(id_token, options={"verify_signature": False})
    return claims
