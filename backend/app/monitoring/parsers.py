"""Normalise les payloads des outils de monitoring vers un format interne unifié."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any

SEVERITY_ORDER = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}

# Mapping Zabbix severity label → interne
_ZABBIX_SEV = {
    "disaster": "critical", "high": "high", "average": "medium",
    "warning": "low", "information": "info", "not classified": "info",
}
# Mapping PRTG priority → interne
_PRTG_SEV = {"5": "critical", "4": "high", "3": "medium", "2": "low", "1": "info"}


@dataclass
class NormalizedAlert:
    source_id: str
    title: str
    body: str
    severity: str        # info/low/medium/high/critical
    status: str          # firing/resolved
    host_hint: str       # hostname or IP for CI matching
    metadata: dict[str, Any] = field(default_factory=dict)


def _clean_sev(raw: str, default: str = "medium") -> str:
    return _ZABBIX_SEV.get(raw.lower().strip(), default) if raw else default


def parse_zabbix(payload: dict) -> list[NormalizedAlert]:
    """
    Format Zabbix webhook media type (champs configurables).
    Exemple de payload type :
    {"subject": "PROBLEM: ...", "message": "Host: srv01\nSeverity: High",
     "event_id": "123", "severity": "High", "host": "srv01", "status": "PROBLEM"}
    """
    status_raw = str(payload.get("status", "PROBLEM")).upper()
    status = "resolved" if "RESOLV" in status_raw or "OK" in status_raw else "firing"
    sev = _clean_sev(str(payload.get("severity", "")), "medium")
    host = str(payload.get("host", payload.get("hostname", payload.get("name", ""))))
    title = str(payload.get("subject", payload.get("name", "Alerte Zabbix")))
    body = str(payload.get("message", payload.get("body", "")))
    event_id = str(payload.get("event_id", payload.get("eventid", "")))
    return [NormalizedAlert(
        source_id=f"zabbix:{event_id}" if event_id else f"zabbix:{title[:80]}",
        title=title,
        body=body,
        severity=sev,
        status=status,
        host_hint=host,
        metadata=payload,
    )]


def parse_alertmanager(payload: dict) -> list[NormalizedAlert]:
    """
    Format Prometheus Alertmanager webhook.
    {"alerts": [{"status": "firing|resolved", "labels": {...}, "annotations": {...},
                 "fingerprint": "abc123", "generatorURL": "..."}]}
    """
    results = []
    for alert in payload.get("alerts", []):
        labels = alert.get("labels", {})
        annotations = alert.get("annotations", {})
        status = "resolved" if alert.get("status") == "resolved" else "firing"
        sev_raw = labels.get("severity", labels.get("priority", ""))
        sev = _clean_sev(sev_raw, "high" if status == "firing" else "info")
        host = labels.get("instance", labels.get("host", labels.get("hostname", "")))
        # Strip port if present
        if ":" in host:
            host = host.split(":")[0]
        title = annotations.get("summary", labels.get("alertname", "Alerte Prometheus"))
        body = annotations.get("description", annotations.get("message", ""))
        fingerprint = alert.get("fingerprint", "")
        results.append(NormalizedAlert(
            source_id=f"am:{fingerprint}" if fingerprint else f"am:{title[:80]}",
            title=title,
            body=body,
            severity=sev,
            status=status,
            host_hint=host,
            metadata=alert,
        ))
    return results


def parse_grafana(payload: dict) -> list[NormalizedAlert]:
    """
    Format Grafana Alerting webhook (v9+).
    {"alerts": [{"status": "firing|resolved", "labels": {...}, "annotations": {...},
                 "fingerprint": "...", "panelURL": "..."}]}
    """
    results = []
    for alert in payload.get("alerts", []):
        labels = alert.get("labels", {})
        annotations = alert.get("annotations", {})
        status = "resolved" if alert.get("status") == "resolved" else "firing"
        sev_raw = labels.get("severity", labels.get("priority", ""))
        sev = _clean_sev(sev_raw, "high" if status == "firing" else "info")
        host = labels.get("host", labels.get("instance", labels.get("hostname", "")))
        if ":" in host:
            host = host.split(":")[0]
        title = annotations.get("summary", alert.get("name", labels.get("alertname", "Alerte Grafana")))
        body = annotations.get("description", annotations.get("runbook_url", ""))
        fp = alert.get("fingerprint", "")
        results.append(NormalizedAlert(
            source_id=f"grafana:{fp}" if fp else f"grafana:{title[:80]}",
            title=title,
            body=body,
            severity=sev,
            status=status,
            host_hint=host,
            metadata=alert,
        ))
    return results


def parse_prtg(payload: dict) -> list[NormalizedAlert]:
    """
    Format PRTG HTTP notification.
    {"device": "Server01", "name": "CPU Load", "status": "Down|Up", "priority": "4",
     "message": "...", "probe": "...", "group": "..."}
    """
    status_raw = str(payload.get("status", "Down")).lower()
    status = "resolved" if status_raw in ("up", "ok", "paused", "unusual") else "firing"
    prio = str(payload.get("priority", "3"))
    sev = _PRTG_SEV.get(prio, "medium")
    host = str(payload.get("device", payload.get("host", payload.get("probe", ""))))
    sensor = str(payload.get("name", "Capteur PRTG"))
    title = f"{host} — {sensor}" if host else sensor
    body = str(payload.get("message", payload.get("lastmessage", "")))
    sensor_id = str(payload.get("sensorid", payload.get("id", "")))
    return [NormalizedAlert(
        source_id=f"prtg:{sensor_id}" if sensor_id else f"prtg:{title[:80]}",
        title=title,
        body=body,
        severity=sev,
        status=status,
        host_hint=host,
        metadata=payload,
    )]


def parse_snmp(payload: dict) -> list[NormalizedAlert]:
    """
    Format normalisé pour les traps SNMP forwarded par snmptrapd.
    Exemple (script snmptrapd → POST JSON) :
    {"agent": "192.168.1.1", "oid": "1.3.6.1.6.3.1.1.5.4",
     "varbinds": {"1.3.6.1.2.1.1.5.0": "switch-core"}, "severity": "high"}
    """
    agent = str(payload.get("agent", payload.get("source", "")))
    oid = str(payload.get("oid", ""))
    title = str(payload.get("title", f"SNMP trap {oid}" if oid else "SNMP trap"))
    body = str(payload.get("message", payload.get("description", "")))
    sev = _clean_sev(str(payload.get("severity", "")), "medium")
    return [NormalizedAlert(
        source_id=f"snmp:{agent}:{oid}:{payload.get('uptime','')}",
        title=title,
        body=body,
        severity=sev,
        status="firing",
        host_hint=agent,
        metadata=payload,
    )]


def parse_generic(payload: dict) -> list[NormalizedAlert]:
    """
    Format générique — accepte les champs communs sans transformation.
    Champs reconnus : title/name, body/message/description, severity/priority,
                      status, host/hostname/device, id/source_id.
    """
    title = str(payload.get("title", payload.get("name", payload.get("alert", "Alerte"))))
    body = str(payload.get("body", payload.get("message", payload.get("description", ""))))
    sev_raw = str(payload.get("severity", payload.get("priority", "medium")))
    sev = _clean_sev(sev_raw, "medium")
    status_raw = str(payload.get("status", "firing")).lower()
    status = "resolved" if status_raw in ("resolved", "ok", "up", "clear", "closed") else "firing"
    host = str(payload.get("host", payload.get("hostname", payload.get("device", payload.get("instance", "")))))
    src_id = str(payload.get("id", payload.get("source_id", payload.get("fingerprint", title[:80]))))
    return [NormalizedAlert(
        source_id=f"generic:{src_id}",
        title=title,
        body=body,
        severity=sev,
        status=status,
        host_hint=host,
        metadata=payload,
    )]


def parse_kuma(payload: dict) -> list[NormalizedAlert]:
    """
    Format Uptime Kuma webhook notification.
    {"heartbeat": {"status": 0|1, "msg": "...", "monitorID": 1},
     "monitor": {"id": 1, "name": "...", "hostname": "...", "url": "..."},
     "msg": "Mon service is DOWN"}
    heartbeat.status : 0 = DOWN (firing), 1 = UP (resolved)
    """
    heartbeat = payload.get("heartbeat", {})
    monitor   = payload.get("monitor", {})

    status  = "resolved" if heartbeat.get("status", 0) == 1 else "firing"
    sev     = "info" if status == "resolved" else "high"

    name    = str(monitor.get("name", "Service Uptime Kuma"))
    hb_msg  = str(heartbeat.get("msg", ""))
    title   = f"{name} — {'UP' if status == 'resolved' else 'DOWN'}"
    body    = hb_msg or str(payload.get("msg", ""))

    # Extraction hostname pour matching CI : hostname explicite ou depuis URL
    hostname = str(monitor.get("hostname", ""))
    if not hostname:
        url = str(monitor.get("url", ""))
        if url:
            try:
                from urllib.parse import urlparse
                hostname = urlparse(url).hostname or ""
            except Exception:
                pass

    monitor_id = str(monitor.get("id", heartbeat.get("monitorID", name[:80])))
    return [NormalizedAlert(
        source_id=f"kuma:{monitor_id}",
        title=title,
        body=body,
        severity=sev,
        status=status,
        host_hint=hostname,
        metadata=payload,
    )]


PARSERS = {
    "zabbix":       parse_zabbix,
    "alertmanager": parse_alertmanager,
    "grafana":      parse_grafana,
    "prtg":         parse_prtg,
    "snmp":         parse_snmp,
    "kuma":         parse_kuma,
    "generic":      parse_generic,
}
