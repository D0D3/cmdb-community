"""Test de connexion par type de connecteur."""
import httpx


def test_connection(connector_type: str, config: dict) -> tuple[bool, str]:
    try:
        fn = _TESTERS.get(connector_type)
        if fn is None:
            return False, f"Test non implémenté pour le type « {connector_type} »"
        return fn(config)
    except Exception as exc:
        return False, str(exc)


# ── LDAP ──────────────────────────────────────────────────────────────────────

def _test_ldap(cfg: dict) -> tuple[bool, str]:
    from ldap3 import Server, Connection, ALL
    host = cfg.get("host", "")
    port = int(cfg.get("port", 389))
    use_ssl = bool(cfg.get("use_ssl", False))
    s = Server(host, port=port, use_ssl=use_ssl, get_info=ALL, connect_timeout=8)
    c = Connection(s, user=cfg.get("bind_dn"), password=cfg.get("bind_password"), auto_bind=False)
    if c.bind():
        c.unbind()
        return True, f"Connexion LDAP réussie à {host}:{port}"
    return False, f"Bind échoué : {c.result.get('description', c.result)}"


# ── GLPI ──────────────────────────────────────────────────────────────────────

def _test_glpi(cfg: dict) -> tuple[bool, str]:
    url = cfg.get("url", "").rstrip("/")
    app_token = cfg.get("app_token", "")
    r = httpx.get(
        f"{url}/api/",
        headers={"App-Token": app_token},
        timeout=10,
        follow_redirects=True,
    )
    if r.status_code in (200, 405):
        return True, f"API GLPI accessible à {url}"
    return False, f"HTTP {r.status_code} — vérifiez l'URL et l'App Token"


# ── Microsoft (Intune / Entra) ────────────────────────────────────────────────

def _test_microsoft(cfg: dict) -> tuple[bool, str]:
    tenant = cfg.get("tenant_id", "")
    r = httpx.post(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        data={
            "grant_type":    "client_credentials",
            "client_id":     cfg.get("client_id", ""),
            "client_secret": cfg.get("client_secret", ""),
            "scope":         "https://graph.microsoft.com/.default",
        },
        timeout=15,
    )
    if r.status_code == 200:
        return True, "Token Microsoft Graph obtenu — connexion réussie"
    detail = r.json().get("error_description") or r.json().get("error") or str(r.status_code)
    return False, f"Échec OAuth2 : {detail}"


# ── ServiceNow ────────────────────────────────────────────────────────────────

def _test_servicenow(cfg: dict) -> tuple[bool, str]:
    url = cfg.get("instance_url", "").rstrip("/")
    r = httpx.get(
        f"{url}/api/now/table/sys_user?sysparm_limit=1",
        auth=(cfg.get("username", ""), cfg.get("password", "")),
        headers={"Accept": "application/json"},
        timeout=12,
    )
    if r.status_code == 200:
        return True, f"ServiceNow accessible à {url}"
    return False, f"HTTP {r.status_code} — vérifiez les identifiants"


# ── Jira ──────────────────────────────────────────────────────────────────────

def _test_jira(cfg: dict) -> tuple[bool, str]:
    url = cfg.get("url", "").rstrip("/")
    import base64 as b64
    token = b64.b64encode(f"{cfg.get('email','')}:{cfg.get('api_token','')}".encode()).decode()
    r = httpx.get(
        f"{url}/rest/api/2/serverInfo",
        headers={"Authorization": f"Basic {token}", "Accept": "application/json"},
        timeout=12,
    )
    if r.status_code == 200:
        version = r.json().get("version", "")
        return True, f"Jira {version} accessible à {url}"
    return False, f"HTTP {r.status_code} — vérifiez l'URL et l'API token"


# ── Atera ─────────────────────────────────────────────────────────────────────

def _test_atera(cfg: dict) -> tuple[bool, str]:
    r = httpx.get(
        "https://app.atera.com/api/v3/accounts/me",
        headers={"X-API-KEY": cfg.get("api_key", ""), "Accept": "application/json"},
        timeout=12,
    )
    if r.status_code == 200:
        return True, "Atera API accessible"
    return False, f"HTTP {r.status_code} — vérifiez la clé API"


# ── Freshservice ──────────────────────────────────────────────────────────────

def _test_freshservice(cfg: dict) -> tuple[bool, str]:
    domain = cfg.get("domain", "").rstrip("/")
    import base64 as b64
    token = b64.b64encode(f"{cfg.get('api_key','')}:X".encode()).decode()
    r = httpx.get(
        f"https://{domain}/api/v2/agents?per_page=1",
        headers={"Authorization": f"Basic {token}", "Accept": "application/json"},
        timeout=12,
    )
    if r.status_code == 200:
        return True, f"Freshservice accessible ({domain})"
    return False, f"HTTP {r.status_code}"


# ── Zendesk ───────────────────────────────────────────────────────────────────

def _test_zendesk(cfg: dict) -> tuple[bool, str]:
    subdomain = cfg.get("subdomain", "")
    import base64 as b64
    token = b64.b64encode(f"{cfg.get('email','')}/token:{cfg.get('api_token','')}".encode()).decode()
    r = httpx.get(
        f"https://{subdomain}.zendesk.com/api/v2/users/me.json",
        headers={"Authorization": f"Basic {token}"},
        timeout=12,
    )
    if r.status_code == 200:
        return True, f"Zendesk accessible ({subdomain}.zendesk.com)"
    return False, f"HTTP {r.status_code}"


# ── SSH ───────────────────────────────────────────────────────────────────────

def _test_ssh(cfg: dict) -> tuple[bool, str]:
    try:
        import paramiko
    except ImportError:
        return False, "paramiko non installé — pip install paramiko"

    hosts_raw = cfg.get("hosts", cfg.get("host", ""))
    hosts = [h.strip() for h in hosts_raw.replace(",", "\n").splitlines() if h.strip()]
    if not hosts:
        return False, "Aucun hôte SSH configuré"

    host     = hosts[0]
    port     = int(cfg.get("port", 22))
    username = cfg.get("username", "root")
    password = cfg.get("password") or None
    key_path = cfg.get("private_key_path") or None

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        connect_kwargs: dict = dict(hostname=host, port=port, username=username, timeout=10)
        if key_path:
            connect_kwargs["key_filename"] = key_path
        elif password:
            connect_kwargs["password"] = password
        client.connect(**connect_kwargs)
        _, stdout, _ = client.exec_command("uname -a", timeout=10)
        uname = stdout.read().decode("utf-8", errors="replace").strip()
        client.close()
        n = len(hosts)
        plural = f"{n} hôte{'s' if n > 1 else ''} configuré{'s' if n > 1 else ''}"
        return True, f"SSH OK — {host} : {uname[:80]} ({plural})"
    except Exception as exc:
        client.close()
        return False, f"Connexion SSH échouée ({host}:{port}) : {exc}"


# ── Custom ────────────────────────────────────────────────────────────────────

def _test_custom(cfg: dict) -> tuple[bool, str]:
    url = cfg.get("url", "")
    if not url:
        return False, "URL non renseignée"
    r = httpx.get(url, timeout=12, follow_redirects=True)
    return r.status_code < 400, f"HTTP {r.status_code}"


def _test_smtp(cfg: dict) -> tuple[bool, str]:
    import smtplib, ssl as _ssl
    host = cfg.get("host", "")
    port = int(cfg.get("port", 587))
    user = cfg.get("user", "")
    password = cfg.get("password", "")
    use_tls = cfg.get("use_tls", True)
    if not host:
        return False, "Hôte SMTP manquant"
    try:
        if port == 465:
            ctx = _ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=10) as srv:
                if user:
                    srv.login(user, password)
        else:
            with smtplib.SMTP(host, port, timeout=10) as srv:
                if use_tls:
                    srv.starttls(context=_ssl.create_default_context())
                if user:
                    srv.login(user, password)
        return True, f"Connexion SMTP réussie ({host}:{port})"
    except Exception as exc:
        return False, str(exc)


_TESTERS: dict = {
    "ssh":         _test_ssh,
    "ldap":        _test_ldap,
    "glpi":        _test_glpi,
    "servicenow":  _test_servicenow,
    "jira":        _test_jira,
    "atera":       _test_atera,
    "freshservice": _test_freshservice,
    "zendesk":     _test_zendesk,
    "intune":      _test_microsoft,
    "entra":       _test_microsoft,
    "custom":      _test_custom,
    "smtp":        _test_smtp,
}
