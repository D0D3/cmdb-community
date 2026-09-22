"""Client Microsoft Graph API — synchronisation calendrier M365/Outlook."""
import json
from urllib import request as _req, parse as _parse, error as _err

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
_TOKEN_URL = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"


class M365Error(Exception):
    pass


def get_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    url  = _TOKEN_URL.format(tenant_id=tenant_id)
    body = _parse.urlencode({
        "grant_type":    "client_credentials",
        "client_id":     client_id,
        "client_secret": client_secret,
        "scope":         "https://graph.microsoft.com/.default",
    }).encode()
    try:
        req = _req.Request(url, data=body, method="POST",
                           headers={"Content-Type": "application/x-www-form-urlencoded"})
        with _req.urlopen(req, timeout=10) as r:
            return json.loads(r.read())["access_token"]
    except _err.HTTPError as e:
        detail = json.loads(e.read()).get("error_description", str(e))
        raise M365Error(f"Authentification échouée : {detail}")
    except Exception as e:
        raise M365Error(f"Erreur réseau : {e}")


def _call(token: str, method: str, path: str, body: dict | None = None) -> dict | None:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    data    = json.dumps(body).encode() if body else None
    req     = _req.Request(f"{GRAPH_BASE}{path}", data=data, method=method, headers=headers)
    try:
        with _req.urlopen(req, timeout=15) as r:
            return None if r.status == 204 else json.loads(r.read())
    except _err.HTTPError as e:
        raw    = e.read()
        detail = json.loads(raw).get("error", {}).get("message", str(e)) if raw else str(e)
        raise M365Error(f"Graph API : {detail}")
    except Exception as e:
        raise M365Error(f"Erreur réseau : {e}")


def test_connection(tenant_id: str, client_id: str, client_secret: str,
                    calendar_user: str) -> dict:
    token  = get_token(tenant_id, client_id, client_secret)
    result = _call(token, "GET", f"/users/{calendar_user}?$select=displayName,mail")
    return {
        "ok":           True,
        "display_name": result.get("displayName", calendar_user),
        "mail":         result.get("mail", calendar_user),
    }


def create_event(token: str, calendar_user: str, subject: str, body_text: str,
                 date_str: str) -> str:
    """Crée un événement de 2 h (08h–10h UTC) le jour de la maintenance. Retourne l'event_id."""
    event = {
        "subject": subject,
        "body":    {"contentType": "text", "content": body_text},
        "start":   {"dateTime": f"{date_str}T08:00:00", "timeZone": "UTC"},
        "end":     {"dateTime": f"{date_str}T10:00:00", "timeZone": "UTC"},
        "showAs":  "oof",
        "categories": ["CMDB"],
    }
    result = _call(token, "POST", f"/users/{calendar_user}/events", event)
    return result["id"]


def update_event(token: str, calendar_user: str, event_id: str, subject: str,
                 body_text: str, date_str: str) -> None:
    patch = {
        "subject": subject,
        "body":    {"contentType": "text", "content": body_text},
        "start":   {"dateTime": f"{date_str}T08:00:00", "timeZone": "UTC"},
        "end":     {"dateTime": f"{date_str}T10:00:00", "timeZone": "UTC"},
    }
    _call(token, "PATCH", f"/users/{calendar_user}/events/{event_id}", patch)


def delete_event(token: str, calendar_user: str, event_id: str) -> None:
    _call(token, "DELETE", f"/users/{calendar_user}/events/{event_id}")
