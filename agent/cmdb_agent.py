#!/usr/bin/env python3
"""CMDB Native Agent — rapport système automatique.

Dépendances  : psutil (pip install psutil) + stdlib uniquement.
Configuration: cmdb_agent.conf (même dossier, /etc/cmdb-agent/ ou %PROGRAMDATA%\\CMDB-Agent\\)
Variables env: CMDB_URL, AGENT_TOKEN, HW_SUBTYPE

Usage:
    python3 cmdb_agent.py             # exécution unique
    python3 cmdb_agent.py --version   # afficher la version
"""
import configparser
import json
import logging
import os
import platform
import socket
import sys
import uuid
from pathlib import Path
from urllib import error as _err
from urllib import request as _req

AGENT_VERSION = "1.0.0"

try:
    import psutil as _ps
except ImportError:
    _ps = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cmdb-agent")

_SCRIPT_DIR = Path(__file__).resolve().parent


def _config_paths():
    paths = [_SCRIPT_DIR / "cmdb_agent.conf"]
    if platform.system() == "Windows":
        pd = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
        paths.append(Path(pd) / "CMDB-Agent" / "cmdb_agent.conf")
    else:
        paths.append(Path("/etc/cmdb-agent/cmdb_agent.conf"))
    return paths


def _load():
    cfg = configparser.ConfigParser()
    for p in _config_paths():
        if p.exists():
            cfg.read(str(p))
            break
    url   = os.environ.get("CMDB_URL")    or cfg.get("cmdb", "url",        fallback="")
    token = os.environ.get("AGENT_TOKEN") or cfg.get("cmdb", "token",      fallback="")
    sub   = os.environ.get("HW_SUBTYPE")  or cfg.get("cmdb", "hw_subtype", fallback="workstation")
    return url.rstrip("/"), token.strip(), sub.strip()


def _cpu_model():
    try:
        s = platform.system()
        if s == "Windows":
            import winreg
            k = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
            )
            return winreg.QueryValueEx(k, "ProcessorNameString")[0].strip()
        if s == "Linux":
            with open("/proc/cpuinfo") as f:
                for ln in f:
                    if ln.startswith("model name"):
                        return ln.split(":", 1)[1].strip()
        if s == "Darwin":
            import subprocess
            r = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True,
            )
            return r.stdout.strip()
    except Exception:
        pass
    return platform.processor() or "Unknown"


def _ram_gb():
    if _ps:
        return round(_ps.virtual_memory().total / 1024**3, 1)
    try:
        s = platform.system()
        if s == "Linux":
            with open("/proc/meminfo") as f:
                for ln in f:
                    if ln.startswith("MemTotal"):
                        return round(int(ln.split()[1]) / 1024**2, 1)
        if s == "Darwin":
            import subprocess
            r = subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True)
            return round(int(r.stdout.strip()) / 1024**3, 1)
        if s == "Windows":
            import subprocess
            r = subprocess.run(
                ["wmic", "computersystem", "get", "TotalPhysicalMemory", "/value"],
                capture_output=True, text=True,
            )
            for ln in r.stdout.splitlines():
                if "=" in ln and ln.split("=")[1].strip().isdigit():
                    return round(int(ln.split("=")[1].strip()) / 1024**3, 1)
    except Exception:
        pass
    return 0.0


def _disks():
    if not _ps:
        return []
    out = []
    for p in _ps.disk_partitions(all=False):
        try:
            u = _ps.disk_usage(p.mountpoint)
            out.append({
                "mount":    p.mountpoint,
                "device":   p.device,
                "total_gb": round(u.total / 1024**3, 1),
                "free_gb":  round(u.free  / 1024**3, 1),
            })
        except (PermissionError, OSError):
            pass
    return out


def _mac():
    raw = uuid.UUID(int=uuid.getnode()).hex[-12:]
    return ":".join(raw[i:i + 2] for i in range(0, 12, 2)).upper()


def _ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("1.1.1.1", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        try:
            s.close()
        except Exception:
            pass


def _collect(hw_subtype):
    return {
        "agent_version": AGENT_VERSION,
        "hostname":      socket.gethostname(),
        "hw_subtype":    hw_subtype,
        "os_name":       platform.system(),
        "os_version":    platform.release(),
        "os_build":      platform.version(),
        "cpu_model":     _cpu_model(),
        "cpu_count":     os.cpu_count() or 0,
        "ram_gb":        _ram_gb(),
        "disks":         _disks(),
        "mac_address":   _mac(),
        "ip_address":    _ip(),
    }


def _send(url, token, payload):
    data = json.dumps(payload).encode()
    r = _req.Request(
        f"{url}/api/agent/report",
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
            "User-Agent":    f"cmdb-agent/{AGENT_VERSION}",
        },
        method="POST",
    )
    with _req.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read().decode())


def _check_update(url, token):
    try:
        r = _req.Request(
            f"{url}/api/agent/version",
            headers={"Authorization": f"Bearer {token}"},
        )
        with _req.urlopen(r, timeout=10) as resp:
            d = json.loads(resp.read().decode())
        sv = d.get("agent_version", AGENT_VERSION)
        if sv != AGENT_VERSION:
            log.warning(
                "Mise à jour disponible : %s → %s — téléchargez depuis Admin > Agents",
                AGENT_VERSION, sv,
            )
    except Exception as e:
        log.debug("Vérif. MAJ : %s", e)


def main():
    if "--version" in sys.argv:
        print(f"cmdb-agent {AGENT_VERSION}")
        return

    if not _ps:
        log.warning("psutil absent — pip install psutil — données RAM/disques limitées")

    url, token, hw_subtype = _load()
    if not url:
        log.error("url non configurée dans cmdb_agent.conf ou variable CMDB_URL")
        sys.exit(1)
    if not token:
        log.error("token non configuré dans cmdb_agent.conf ou variable AGENT_TOKEN")
        sys.exit(1)

    _check_update(url, token)

    log.info("Collecte — %s %s (%s)", platform.system(), platform.release(), hw_subtype)
    report = _collect(hw_subtype)
    log.info(
        "Hôte: %s | IP: %s | RAM: %.1f Go | CPU×%d: %s",
        report["hostname"], report["ip_address"], report["ram_gb"],
        report["cpu_count"], report["cpu_model"],
    )

    try:
        result = _send(url, token, report)
        log.info(
            "Rapport envoyé — CI: %s (%s)",
            result.get("ci_name", "?"), result.get("action", "?"),
        )
    except _err.HTTPError as e:
        log.error("HTTP %s : %s", e.code, e.read().decode())
        sys.exit(1)
    except Exception as e:
        log.error("Erreur : %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
