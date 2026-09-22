"""
Primitives cryptographiques de l'application.

  Mots de passe locaux : Argon2id (m=65536, t=3, p=4) via argon2-cffi.
  JWT sessions UI      : HS256, sub=UUID utilisateur, exp configurable (.env).
  Tokens API machine   : aléatoire 32 bytes URL-safe, stocké en SHA-256 (irréversible).
  Token 2FA partiel    : JWT court (5 min) avec claim totp_pending=True.

Note : generate_api_token() renvoie (raw, hash). Le raw n'est affiché qu'une fois
à la création — seul le hash est stocké en base.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from app.core.config import get_settings

settings = get_settings()
_ph = PasswordHasher()


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(subject: str, extra: dict[str, Any] | None = None, expires_minutes: int | None = None) -> str:
    minutes = expires_minutes if expires_minutes is not None else settings.access_token_expire_minutes
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {"sub": subject, "exp": expire, **(extra or {})}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_partial_token(subject: str) -> str:
    return create_access_token(subject, {"totp_pending": True}, expires_minutes=5)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


def hash_api_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def generate_api_token() -> tuple[str, str]:
    """Retourne (token_raw, token_hash). Stocker uniquement le hash."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_api_token(raw)
