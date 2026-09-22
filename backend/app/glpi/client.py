"""Client HTTP pour l'API REST GLPI."""
import base64
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_PAGE = 500  # objets par page


class GLPIClient:
    def __init__(self, url: str, app_token: str, user_token: str = "",
                 username: str = "", password: str = ""):
        self.base = url.rstrip("/") + "/apirest.php"
        self.app_token = app_token
        self.user_token = user_token
        self.username = username
        self.password = password
        self._session: Optional[str] = None
        self._http = httpx.Client(timeout=30, follow_redirects=True)

    # ── Session ───────────────────────────────────────────────────────────────

    def _base_headers(self) -> dict:
        return {"App-Token": self.app_token, "Content-Type": "application/json"}

    def _auth_header(self) -> dict:
        if self.user_token:
            return {"Authorization": f"user_token {self.user_token}"}
        creds = base64.b64encode(f"{self.username}:{self.password}".encode()).decode()
        return {"Authorization": f"Basic {creds}"}

    def _headers(self) -> dict:
        h = self._base_headers()
        if self._session:
            h["Session-Token"] = self._session
        return h

    def connect(self):
        resp = self._http.get(
            f"{self.base}/initSession",
            headers={**self._base_headers(), **self._auth_header()},
        )
        resp.raise_for_status()
        self._session = resp.json()["session_token"]
        logger.info("GLPI session initiée")

    def disconnect(self):
        if self._session:
            try:
                self._http.get(f"{self.base}/killSession", headers=self._headers())
            except Exception:
                pass
            self._session = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *_):
        self.disconnect()
        self._http.close()

    # ── Requêtes génériques ───────────────────────────────────────────────────

    def _get_all(self, endpoint: str) -> list[dict]:
        """Fetch toutes les pages d'un endpoint GLPI."""
        results = []
        start = 0
        while True:
            resp = self._http.get(
                f"{self.base}/{endpoint}",
                headers={**self._headers(), "Range": f"{start}-{start + _PAGE - 1}"},
                params={"is_deleted": 0},
                timeout=60,
            )
            if resp.status_code == 401:
                raise PermissionError(f"GLPI : accès refusé à {endpoint}")
            if resp.status_code == 404:
                return results
            if resp.status_code not in (200, 206):
                resp.raise_for_status()

            batch = resp.json()
            if not isinstance(batch, list) or not batch:
                break
            results.extend(batch)

            # Content-Range: start-end/total
            cr = resp.headers.get("Content-Range", "")
            try:
                total = int(cr.split("/")[-1])
            except (ValueError, IndexError):
                break
            start += _PAGE
            if start >= total:
                break
        return results

    def ping(self) -> bool:
        try:
            resp = self._http.get(
                f"{self.base}/initSession",
                headers={**self._base_headers(), **self._auth_header()},
                timeout=10,
            )
            ok = resp.status_code == 200
            if ok:
                # ferme la session de test proprement
                tok = resp.json().get("session_token", "")
                if tok:
                    self._http.get(
                        f"{self.base}/killSession",
                        headers={**self._base_headers(), "Session-Token": tok},
                        timeout=5,
                    )
            return ok
        except Exception:
            return False

    # ── Données métier ────────────────────────────────────────────────────────

    def get_computers(self) -> list[dict]:
        return self._get_all("Computer")

    def get_lookup(self, endpoint: str) -> dict[int, str]:
        """Retourne {id: name} pour un endpoint dropdown GLPI."""
        rows = self._get_all(endpoint)
        return {r["id"]: r.get("completename") or r.get("name", "") for r in rows if "id" in r}
