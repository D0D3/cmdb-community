"""Suivi de l'état de l'ingestion CVE via Redis."""
import json
from datetime import datetime, timezone

INGEST_KEY    = "cmdb:cve_ingest:status"
TTL_RUNNING   = 600    # 10 min de sécurité si la tâche crash avant de mettre "done"
TTL_DONE      = 86400  # conserver le résultat 24 h

def _r():
    import redis as _redis
    from app.core.config import get_settings
    return _redis.from_url(get_settings().redis_url, decode_responses=True)

def set_ingest_running() -> None:
    _r().set(INGEST_KEY, json.dumps({
        "running": True,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
        "matched_cves": None,
        "new_links": None,
    }), ex=TTL_RUNNING)

def set_ingest_done(matched_cves: int, new_links: int) -> None:
    raw = _r().get(INGEST_KEY)
    started_at = None
    if raw:
        try:
            started_at = json.loads(raw).get("started_at")
        except Exception:
            pass
    _r().set(INGEST_KEY, json.dumps({
        "running": False,
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "matched_cves": matched_cves,
        "new_links": new_links,
    }), ex=TTL_DONE)

def get_ingest_status() -> dict:
    raw = _r().get(INGEST_KEY)
    if not raw:
        return {"running": False, "started_at": None, "finished_at": None,
                "matched_cves": None, "new_links": None}
    try:
        return json.loads(raw)
    except Exception:
        return {"running": False, "started_at": None, "finished_at": None,
                "matched_cves": None, "new_links": None}
