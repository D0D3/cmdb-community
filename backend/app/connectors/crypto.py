"""
Chiffrement/déchiffrement des configs connecteurs.
  encrypt_config / decrypt_config : Fernet symétrique (clé dérivée de SECRET_KEY via SHA-256).
  mask_config                     : remplace les valeurs secrètes par "***" avant envoi au frontend.
Les champs masqués (password, api_key, etc.) sont définis dans _SECRET_FIELDS.
"""
import base64
import hashlib
import json

from cryptography.fernet import Fernet

_SECRET_FIELDS = {
    "password", "bind_password", "api_key", "api_token",
    "client_secret", "app_token", "user_token",
}


def _fernet() -> Fernet:
    from app.core.config import get_settings
    raw = hashlib.sha256(get_settings().secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def encrypt_config(config: dict) -> str:
    return _fernet().encrypt(json.dumps(config).encode()).decode()


def decrypt_config(encrypted: str) -> dict:
    return json.loads(_fernet().decrypt(encrypted.encode()))


def mask_config(config: dict) -> dict:
    return {k: "***" if k in _SECRET_FIELDS and v else v for k, v in config.items()}
