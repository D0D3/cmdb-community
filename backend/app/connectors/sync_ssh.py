"""Découverte agentless via SSH — collecte inventaire Linux/Unix."""
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cmdb.models import CI, HardwareDetail
from app.connectors.crypto import decrypt_config
from .models import Connector

_COLLECT_CMD = r"""
python3 - <<'PYEOF' 2>/dev/null || python - <<'PYEOF' 2>/dev/null
import json, platform, socket, os, subprocess, re

def _cpu():
    try:
        with open('/proc/cpuinfo') as f:
            for ln in f:
                if ln.startswith('model name'):
                    return ln.split(':',1)[1].strip()
    except Exception: pass
    return platform.processor() or 'Unknown'

def _ram():
    try:
        with open('/proc/meminfo') as f:
            for ln in f:
                if ln.startswith('MemTotal'):
                    return round(int(ln.split()[1]) / 1048576, 1)
    except Exception: pass
    return 0.0

def _disks():
    out = []
    try:
        lines = subprocess.check_output(['df','-k','--output=source,size,used,target'],
                                        stderr=subprocess.DEVNULL, text=True).splitlines()[1:]
        for ln in lines:
            parts = ln.split()
            if len(parts) >= 4 and parts[0].startswith('/dev/'):
                total = round(int(parts[1])/1048576, 1)
                free  = round((int(parts[1])-int(parts[2]))/1048576, 1)
                out.append({'mount': parts[3], 'device': parts[0],
                            'total_gb': total, 'free_gb': free})
    except Exception: pass
    return out

def _ip():
    try:
        import socket as _s
        s = _s.socket(_s.AF_INET, _s.SOCK_DGRAM)
        s.connect(('1.1.1.1', 80))
        return s.getsockname()[0]
    except Exception: return ''

def _os_info():
    name = ver = build = ''
    try:
        with open('/etc/os-release') as f:
            d = dict(l.strip().split('=',1) for l in f if '=' in l)
        name  = d.get('NAME','').strip('"')
        ver   = d.get('VERSION_ID','').strip('"')
        build = d.get('BUILD_ID', d.get('VERSION','')).strip('"')
    except Exception: pass
    if not name: name = platform.system()
    if not build: build = 'kernel ' + platform.release()
    return name, ver, build

def _virt():
    try:
        r = subprocess.check_output(['systemd-detect-virt'], stderr=subprocess.DEVNULL, text=True).strip()
        return r != 'none'
    except Exception: pass
    try:
        with open('/sys/class/dmi/id/product_name') as f:
            p = f.read().lower()
        return any(k in p for k in ('virtual','vmware','kvm','xen','hyper'))
    except Exception: pass
    return False

os_name, os_ver, os_build = _os_info()
cpu_count = os.cpu_count() or 1
is_vm = _virt()

print(json.dumps({
    'hostname':    socket.gethostname(),
    'os_name':     os_name,
    'os_version':  os_ver,
    'os_build':    os_build,
    'cpu_model':   _cpu(),
    'cpu_count':   cpu_count,
    'ram_gb':      _ram(),
    'disks':       _disks(),
    'ip_address':  _ip(),
    'hw_subtype':  'vm' if is_vm else 'server',
}))
PYEOF
"""


def _run_ssh(host: str, port: int, username: str,
             password: str | None, key_path: str | None, cmd: str) -> str:
    try:
        import paramiko
    except ImportError as e:
        raise RuntimeError("paramiko non installé — pip install paramiko") from e

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    connect_kwargs: dict = dict(
        hostname=host, port=port, username=username,
        timeout=30, banner_timeout=30,
    )
    if key_path:
        connect_kwargs["key_filename"] = key_path
    elif password:
        connect_kwargs["password"] = password
    client.connect(**connect_kwargs)
    _, stdout, stderr = client.exec_command(cmd, timeout=60)
    output = stdout.read().decode("utf-8", errors="replace")
    client.close()
    return output.strip()


def sync_ssh_host(connector: Connector, db: Session) -> dict:
    """Découverte d'un ou plusieurs hôtes SSH — crée/met à jour les CIs."""
    cfg = decrypt_config(connector.config_encrypted)

    hosts_raw = cfg.get("hosts", cfg.get("host", ""))
    hosts = [h.strip() for h in hosts_raw.replace(",", "\n").splitlines() if h.strip()]
    if not hosts:
        return {"error": "Aucun hôte configuré"}

    port     = int(cfg.get("port", 22))
    username = cfg.get("username", "root")
    password = cfg.get("password") or None
    key_path = cfg.get("private_key_path") or None

    created = updated = errors = 0

    for host in hosts:
        try:
            raw = _run_ssh(host, port, username, password, key_path, _COLLECT_CMD)
            # Chercher le dernier JSON valide dans la sortie
            data = None
            for line in reversed(raw.splitlines()):
                line = line.strip()
                if line.startswith("{"):
                    try:
                        data = json.loads(line)
                        break
                    except Exception:
                        continue
            if not data:
                errors += 1
                continue

            hostname   = data.get("hostname") or host
            hw_subtype = data.get("hw_subtype", "server")
            agent_attrs = {
                "ssh_host":       host,
                "agent_hostname": hostname,
                "agent_ip":       data.get("ip_address", ""),
                "agent_cpu_model": data.get("cpu_model", ""),
                "agent_cpu_count": data.get("cpu_count", 0),
                "agent_ram_gb":    data.get("ram_gb", 0.0),
                "agent_disks":     data.get("disks", []),
                "agent_version":   "ssh-discovery",
                "agent_last_seen": datetime.now(timezone.utc).isoformat(),
            }

            # Cherche par hostname SSH, puis par hostname rapporté
            ci = db.scalars(
                select(CI).where(CI.ci_type == "hardware", CI.attributes.is_not(None))
            ).all()
            existing = next(
                (c for c in ci
                 if (c.attributes or {}).get("ssh_host") == host
                 or (c.attributes or {}).get("agent_hostname") == hostname),
                None,
            )

            if existing:
                existing.attributes = {**(existing.attributes or {}), **agent_attrs}
                hw = db.get(HardwareDetail, existing.id)
                if hw:
                    hw.hw_subtype  = hw_subtype
                    hw.os_name     = data.get("os_name")
                    hw.os_version  = data.get("os_version")
                    hw.os_build    = data.get("os_build")
                else:
                    db.add(HardwareDetail(
                        ci_id=existing.id,
                        hw_subtype=hw_subtype,
                        os_name=data.get("os_name"),
                        os_version=data.get("os_version"),
                        os_build=data.get("os_build"),
                    ))
                updated += 1
            else:
                new_ci = CI(
                    name=hostname,
                    ci_type="hardware",
                    status="in_service",
                    attributes=agent_attrs,
                )
                db.add(new_ci)
                db.flush()
                db.add(HardwareDetail(
                    ci_id=new_ci.id,
                    hw_subtype=hw_subtype,
                    os_name=data.get("os_name"),
                    os_version=data.get("os_version"),
                    os_build=data.get("os_build"),
                ))
                created += 1

        except Exception as exc:
            errors += 1
            continue

    db.commit()
    return {
        "hosts_scanned": len(hosts),
        "created": created,
        "updated": updated,
        "errors":  errors,
    }
