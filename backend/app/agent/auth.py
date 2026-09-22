"""Vérification du token Bearer pour les agents natifs (Authorization: Bearer cagt_…)."""
import hashlib
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from .models import AgentToken


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def verify_agent_token(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> AgentToken:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token agent manquant")
    raw = authorization[7:].strip()
    token_hash = _hash(raw)
    token = db.scalar(
        select(AgentToken).where(AgentToken.token_hash == token_hash, AgentToken.revoked.is_(False))
    )
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token agent invalide ou révoqué")
    return token
