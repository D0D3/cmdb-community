"""Génère le script agent et les installeurs OS-spécifiques."""
import base64
from datetime import datetime, timezone
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).parent / "scripts"

AGENT_VERSION = "1.0.0"

# ── Script agent Python (embarqué) ────────────────────────────────────────────
_AGENT_PY = r'''#!/usr/bin/env python3
"""CMDB Native Agent — rapport système automatique.
Dépendances : psutil (pip install psutil) + stdlib uniquement.
Configuration : cmdb_agent.conf (même dossier) ou variables d'env CMDB_URL / AGENT_TOKEN / HW_SUBTYPE.
"""
import configparser, json, logging, os, platform, socket, sys, uuid
from pathlib import Path
from urllib import request as _req, error as _err

AGENT_VERSION = "__AGENT_VERSION__"

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
            k = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                               r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            return winreg.QueryValueEx(k, "ProcessorNameString")[0].strip()
        if s == "Linux":
            with open("/proc/cpuinfo") as f:
                for ln in f:
                    if ln.startswith("model name"):
                        return ln.split(":", 1)[1].strip()
        if s == "Darwin":
            import subprocess
            r = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"],
                               capture_output=True, text=True)
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
                "mount": p.mountpoint,
                "device": p.device,
                "total_gb": round(u.total / 1024**3, 1),
                "free_gb":  round(u.free  / 1024**3, 1),
            })
        except (PermissionError, OSError):
            pass
    return out


def _mac():
    raw = uuid.UUID(int=uuid.getnode()).hex[-12:]
    return ":".join(raw[i:i+2] for i in range(0, 12, 2)).upper()


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
            "Content-Type": "application/json",
            "User-Agent": f"cmdb-agent/{AGENT_VERSION}",
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
        log.info("Rapport envoyé — CI: %s (%s)", result.get("ci_name", "?"), result.get("action", "?"))
    except _err.HTTPError as e:
        log.error("HTTP %s : %s", e.code, e.read().decode())
        sys.exit(1)
    except Exception as e:
        log.error("Erreur : %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
'''


def _script_bytes(version: str = AGENT_VERSION) -> bytes:
    return _AGENT_PY.replace("__AGENT_VERSION__", version).encode("utf-8")


def _script_b64(version: str = AGENT_VERSION) -> str:
    return base64.b64encode(_script_bytes(version)).decode("ascii")


# ── Générateurs ───────────────────────────────────────────────────────────────

def generate_script() -> bytes:
    return _script_bytes()


def generate_config(cmdb_url: str, token: str, hw_subtype: str) -> bytes:
    content = f"""[cmdb]
# URL de votre instance CMDB (sans slash final)
url = {cmdb_url}

# Token d'agent — NE PAS PARTAGER — permissions restrictives recommandées
# Linux : chmod 600 cmdb_agent.conf
# Windows : Propriétés > Sécurité > accès restreint au compte de service
token = {token}

# Type de machine : server | vm | workstation | terminal_server | network_device
hw_subtype = {hw_subtype}
"""
    return content.encode("utf-8")


def generate_installer_linux(cmdb_url: str, token: str, hw_subtype: str) -> bytes:
    b64 = _script_b64()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    script = f"""#!/bin/bash
# ================================================================
# CMDB Agent Installer — Linux ({hw_subtype})
# Généré le {ts}
# Version agent : {AGENT_VERSION}
# ================================================================
set -euo pipefail

CMDB_URL="{cmdb_url}"
AGENT_TOKEN="{token}"
HW_SUBTYPE="{hw_subtype}"
INSTALL_DIR="/opt/cmdb-agent"
SERVICE="cmdb-agent"
AGENT_VERSION="{AGENT_VERSION}"

echo "▶ Installation CMDB Agent $AGENT_VERSION dans $INSTALL_DIR"

# Vérification prérequis
if ! command -v python3 &>/dev/null; then
  echo "❌ python3 est requis. Installez-le puis relancez ce script."
  exit 1
fi

PYTHON=$(command -v python3)
echo "   Python : $($PYTHON --version)"

# Installation psutil
echo "▶ Installation psutil..."
$PYTHON -m pip install --quiet --user psutil 2>/dev/null || \\
  pip3 install --quiet psutil 2>/dev/null || \\
  echo "   ⚠ psutil non installé — les données RAM/disques seront partielles"

# Création du dossier d'installation
mkdir -p "$INSTALL_DIR"

# Script agent (encodé en base64 pour éviter tout problème d'échappement)
echo "▶ Installation du script agent..."
echo "{b64}" | base64 -d > "$INSTALL_DIR/cmdb_agent.py"
chmod 755 "$INSTALL_DIR/cmdb_agent.py"

# Vérification intégrité
LINES=$(wc -l < "$INSTALL_DIR/cmdb_agent.py")
echo "   Script : $LINES lignes"

# Configuration (permissions restrictives)
echo "▶ Écriture de la configuration..."
cat > "$INSTALL_DIR/cmdb_agent.conf" <<CONF_EOF
[cmdb]
url = $CMDB_URL
token = $AGENT_TOKEN
hw_subtype = $HW_SUBTYPE
CONF_EOF
chmod 600 "$INSTALL_DIR/cmdb_agent.conf"
echo "   Config : $INSTALL_DIR/cmdb_agent.conf (chmod 600)"

# Test de connexion initial
echo "▶ Test de connexion et envoi du premier rapport..."
if $PYTHON "$INSTALL_DIR/cmdb_agent.py"; then
  echo "✓ Premier rapport envoyé avec succès"
else
  echo "⚠ Le rapport initial a échoué — vérifiez l'URL et le token"
fi

# Systemd service (oneshot)
echo "▶ Installation du service systemd..."
cat > /etc/systemd/system/$SERVICE.service <<SVC_EOF
[Unit]
Description=CMDB Native Agent v$AGENT_VERSION
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
ExecStart=$PYTHON $INSTALL_DIR/cmdb_agent.py
StandardOutput=journal
StandardError=journal
SVC_EOF

# Systemd timer (quotidien, heure aléatoire)
cat > /etc/systemd/system/$SERVICE.timer <<TIMER_EOF
[Unit]
Description=CMDB Agent — rapport quotidien

[Timer]
OnCalendar=daily
RandomizedDelaySec=3600
Persistent=true

[Install]
WantedBy=timers.target
TIMER_EOF

systemctl daemon-reload
systemctl enable --now $SERVICE.timer
echo "✓ Timer systemd activé — rapport quotidien planifié"

echo ""
echo "══════════════════════════════════════════════════════════"
echo " CMDB Agent $AGENT_VERSION installé avec succès"
echo "══════════════════════════════════════════════════════════"
echo " Dossier    : $INSTALL_DIR"
echo " Service    : systemctl status $SERVICE.timer"
echo " Journaux   : journalctl -u $SERVICE.service -f"
echo " Exécution  : $PYTHON $INSTALL_DIR/cmdb_agent.py"
echo " Mise à jour: re-exécutez cet installeur (téléchargez la"
echo "              dernière version depuis Admin > Agents)"
echo "══════════════════════════════════════════════════════════"
"""
    return script.encode("utf-8")


def generate_installer_windows(cmdb_url: str, token: str, hw_subtype: str) -> bytes:
    # Encode agent script en base64 pour PowerShell
    b64 = _script_b64()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    script = f"""# ================================================================
# CMDB Agent Installer — Windows ({hw_subtype})
# Genere le {ts}
# Version agent : {AGENT_VERSION}
# Executer en tant qu'Administrateur !
# PowerShell : Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
# ================================================================
#Requires -RunAsAdministrator

$CmdbUrl    = "{cmdb_url}"
$AgentToken = "{token}"
$HwSubtype  = "{hw_subtype}"
$Version    = "{AGENT_VERSION}"
$InstallDir = "$env:ProgramData\\CMDB-Agent"
$TaskName   = "CMDB Agent"

Write-Host "==> Installation CMDB Agent $Version dans $InstallDir" -ForegroundColor Cyan

# Verification Python
$Python = $null
foreach ($cmd in @("python", "python3", "py")) {{
    try {{
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python") {{ $Python = $cmd; break }}
    }} catch {{ }}
}}
if (-not $Python) {{
    Write-Host "ERREUR : Python 3 est requis. Telechargez depuis https://www.python.org" -ForegroundColor Red
    exit 1
}}
Write-Host "   Python : $(& $Python --version 2>&1)"

# Installation psutil
Write-Host "==> Installation psutil..."
& $Python -m pip install --quiet psutil 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {{
    Write-Host "   AVERTISSEMENT : psutil non installe - donnees RAM/disques partielles" -ForegroundColor Yellow
}}

# Creation dossier
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Script agent (base64)
Write-Host "==> Installation du script agent..."
$B64 = "{b64}"
$Bytes = [Convert]::FromBase64String($B64)
[System.IO.File]::WriteAllBytes("$InstallDir\\cmdb_agent.py", $Bytes)
Write-Host "   Script : $InstallDir\\cmdb_agent.py ($($Bytes.Length) octets)"

# Configuration
Write-Host "==> Ecriture de la configuration..."
$Config = @"
[cmdb]
url = $CmdbUrl
token = $AgentToken
hw_subtype = $HwSubtype
"@
$Config | Set-Content "$InstallDir\\cmdb_agent.conf" -Encoding UTF8

# Restriction des permissions (compte SYSTEM uniquement)
$Acl = Get-Acl "$InstallDir\\cmdb_agent.conf"
$Acl.SetAccessRuleProtection($true, $false)
$Rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "SYSTEM", "FullControl", "Allow"
)
$Acl.AddAccessRule($Rule)
$Rule2 = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "Administrators", "FullControl", "Allow"
)
$Acl.AddAccessRule($Rule2)
Set-Acl "$InstallDir\\cmdb_agent.conf" $Acl
Write-Host "   Config  : $InstallDir\\cmdb_agent.conf (acces restreint)"

# Test initial
Write-Host "==> Test de connexion et premier rapport..."
& $Python "$InstallDir\\cmdb_agent.py"
if ($LASTEXITCODE -eq 0) {{
    Write-Host "   Premier rapport envoye avec succes" -ForegroundColor Green
}} else {{
    Write-Host "   AVERTISSEMENT : Rapport initial echoue - verifiez l'URL et le token" -ForegroundColor Yellow
}}

# Tache planifiee (quotidienne a 02h00)
Write-Host "==> Creation de la tache planifiee..."
$Action = New-ScheduledTaskAction `
    -Execute $Python `
    -Argument "`"$InstallDir\\cmdb_agent.py`"" `
    -WorkingDirectory $InstallDir
$Trigger = New-ScheduledTaskTrigger -Daily -At "02:00"
$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Force | Out-Null
Write-Host "   Tache '$TaskName' creee — execution quotidienne a 02:00"

Write-Host ""
Write-Host "===============================================================" -ForegroundColor Green
Write-Host " CMDB Agent $Version installe avec succes" -ForegroundColor Green
Write-Host "===============================================================" -ForegroundColor Green
Write-Host " Dossier     : $InstallDir"
Write-Host " Tache       : Gestionnaire de taches > $TaskName"
Write-Host " Execution   : & '$Python' '$InstallDir\\cmdb_agent.py'"
Write-Host " Mise a jour : re-executez cet installeur depuis Admin > Agents"
Write-Host "===============================================================" -ForegroundColor Green
"""
    return script.encode("utf-8")


# ── Scripts natifs (shell / PowerShell) ──────────────────────────────────────

def _read_native(filename: str) -> bytes:
    return (_SCRIPTS_DIR / filename).read_bytes()


def generate_native_script_linux() -> bytes:
    return _read_native("cmdb-agent-linux.sh")


def generate_native_script_windows() -> bytes:
    return _read_native("cmdb-agent-windows.ps1")


def generate_native_script_macos() -> bytes:
    return _read_native("cmdb-agent-macos.sh")


def generate_native_installer_linux(cmdb_url: str, token: str, hw_subtype: str) -> bytes:
    agent_b64 = base64.b64encode(_read_native("cmdb-agent-linux.sh")).decode("ascii")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    script = f"""#!/bin/bash
# ================================================================
# CMDB Agent Installer Natif — Linux ({hw_subtype})
# Généré le {ts} | Version {AGENT_VERSION}
# Prérequis : bash, curl
# ================================================================
set -euo pipefail

CMDB_URL="{cmdb_url}"
AGENT_TOKEN="{token}"
HW_SUBTYPE="{hw_subtype}"
AGENT_VERSION="{AGENT_VERSION}"
INSTALL_BIN="/usr/local/bin/cmdb-agent"
CONF_FILE="/etc/cmdb-agent.conf"

echo "▶ Installation CMDB Agent Natif $AGENT_VERSION (Shell / curl)"

# Prérequis
for cmd in curl bash base64; do
  command -v "$cmd" >/dev/null 2>&1 || {{ echo "❌ $cmd requis."; exit 1; }}
done

# Script agent (extrait du base64 embarqué)
echo "▶ Extraction du script agent..."
printf '%s' "{agent_b64}" | base64 -d > "$INSTALL_BIN"
chmod 755 "$INSTALL_BIN"
echo "   Installé : $INSTALL_BIN"

# Configuration
echo "▶ Configuration..."
cat > "$CONF_FILE" <<CONF_EOF
CMDB_URL=$CMDB_URL
CMDB_TOKEN=$AGENT_TOKEN
CONF_EOF
chmod 600 "$CONF_FILE"
echo "   Conf : $CONF_FILE (chmod 600)"

# Premier rapport
echo "▶ Premier rapport..."
if "$INSTALL_BIN"; then
  echo "✓ Rapport envoyé avec succès"
else
  echo "⚠ Rapport initial échoué — vérifiez l'URL et le token"
fi

# Planification (systemd ou cron)
if command -v systemctl >/dev/null 2>&1 && systemctl is-system-running >/dev/null 2>&1; then
  cat > /etc/systemd/system/cmdb-agent.service <<SVC_EOF
[Unit]
Description=CMDB Native Agent v$AGENT_VERSION
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$INSTALL_BIN
SVC_EOF
  cat > /etc/systemd/system/cmdb-agent.timer <<TIMER_EOF
[Unit]
Description=CMDB Agent — rapport quotidien

[Timer]
OnCalendar=daily
RandomizedDelaySec=3600
Persistent=true

[Install]
WantedBy=timers.target
TIMER_EOF
  systemctl daemon-reload
  systemctl enable --now cmdb-agent.timer
  echo "✓ Timer systemd activé"
else
  echo "0 7 * * * root . $CONF_FILE && $INSTALL_BIN" > /etc/cron.d/cmdb-agent
  chmod 644 /etc/cron.d/cmdb-agent
  echo "✓ Cron quotidien 07h00 configuré"
fi

echo ""
echo "══════════════════════════════════════════════════════════"
echo " CMDB Agent Shell $AGENT_VERSION installé"
echo "══════════════════════════════════════════════════════════"
echo " Journaux   : journalctl -u cmdb-agent.service -f"
echo " Exécution  : $INSTALL_BIN"
echo " Mise à jour: re-téléchargez l'installeur (Admin > Agents)"
echo "══════════════════════════════════════════════════════════"
"""
    return script.encode("utf-8")


def generate_native_installer_windows(cmdb_url: str, token: str, hw_subtype: str) -> bytes:
    agent_b64 = base64.b64encode(_read_native("cmdb-agent-windows.ps1")).decode("ascii")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    script = f"""#Requires -RunAsAdministrator
# ================================================================
# CMDB Agent Installer Natif — Windows ({hw_subtype})
# Genere le {ts} | Version {AGENT_VERSION}
# PowerShell 5.1+ requis — executer en tant qu'Administrateur
# Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
# ================================================================

$CmdbUrl    = "{cmdb_url}"
$AgentToken = "{token}"
$HwSubtype  = "{hw_subtype}"
$Version    = "{AGENT_VERSION}"
$InstallDir = "$env:ProgramData\\CMDB-Agent"
$AgentScript = "$InstallDir\\cmdb-agent.ps1"
$TaskName   = "CMDB Agent"

Write-Host "==> Installation CMDB Agent Natif $Version (PowerShell/CIM)" -ForegroundColor Cyan

# Creation dossier
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Extraction du script (base64 embarque)
Write-Host "==> Extraction du script agent..."
$B64 = "{agent_b64}"
$Bytes = [Convert]::FromBase64String($B64)
[System.IO.File]::WriteAllBytes($AgentScript, $Bytes)
Write-Host "   Script : $AgentScript"

# Restriction ACL
$Acl = Get-Acl $AgentScript
$Acl.SetAccessRuleProtection($true, $false)
foreach ($id in @("SYSTEM", "Administrators")) {{
  $Rule = New-Object System.Security.AccessControl.FileSystemAccessRule($id, "FullControl", "Allow")
  $Acl.AddAccessRule($Rule)
}}
Set-Acl $AgentScript $Acl
Write-Host "   Permissions restreintes (SYSTEM + Administrators)"

# Premier rapport
Write-Host "==> Premier rapport..."
& powershell.exe -ExecutionPolicy Bypass -File $AgentScript `
    -CmdbUrl $CmdbUrl -CmdbToken $AgentToken
if ($LASTEXITCODE -eq 0) {{
  Write-Host "   Rapport envoye OK" -ForegroundColor Green
}} else {{
  Write-Host "   AVERTISSEMENT : rapport initial echoue" -ForegroundColor Yellow
}}

# Tache planifiee quotidienne 02h00
Write-Host "==> Creation de la tache planifiee..."
$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -File `"$AgentScript`" -CmdbUrl `"$CmdbUrl`" -CmdbToken `"$AgentToken`""
$Trigger  = New-ScheduledTaskTrigger -Daily -At "02:00"
$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask `
  -TaskName $TaskName -Action $Action -Trigger $Trigger `
  -Settings $Settings -Principal $Principal -Force | Out-Null
Write-Host "   Tache '$TaskName' — quotidienne a 02:00" -ForegroundColor Green

Write-Host ""
Write-Host "===============================================================" -ForegroundColor Green
Write-Host " CMDB Agent PowerShell $Version installe" -ForegroundColor Green
Write-Host "===============================================================" -ForegroundColor Green
Write-Host " Dossier  : $InstallDir"
Write-Host " Tache    : Gestionnaire de taches > $TaskName"
Write-Host " Mise a jour : re-executez cet installeur (Admin > Agents)"
Write-Host "===============================================================" -ForegroundColor Green
"""
    return script.encode("utf-8")


def generate_native_installer_macos(cmdb_url: str, token: str, hw_subtype: str) -> bytes:
    agent_b64 = base64.b64encode(_read_native("cmdb-agent-macos.sh")).decode("ascii")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    plist_label = "com.capybara.cmdb-agent"
    script = f"""#!/bin/bash
# ================================================================
# CMDB Agent Installer Natif — macOS ({hw_subtype})
# Généré le {ts} | Version {AGENT_VERSION}
# Prérequis : bash, curl (inclus dans macOS)
# ================================================================
set -euo pipefail

CMDB_URL="{cmdb_url}"
AGENT_TOKEN="{token}"
HW_SUBTYPE="{hw_subtype}"
AGENT_VERSION="{AGENT_VERSION}"
INSTALL_BIN="/usr/local/bin/cmdb-agent"
CONF_FILE="/etc/cmdb-agent.conf"
PLIST_LABEL="{plist_label}"
PLIST_PATH="/Library/LaunchDaemons/$PLIST_LABEL.plist"

echo "▶ Installation CMDB Agent Natif $AGENT_VERSION (Shell / curl)"

# Prérequis
command -v curl >/dev/null 2>&1 || {{ echo "❌ curl requis."; exit 1; }}

# Script agent
echo "▶ Extraction du script agent..."
printf '%s' "{agent_b64}" | base64 -d > "$INSTALL_BIN"
chmod 755 "$INSTALL_BIN"
echo "   Installé : $INSTALL_BIN"

# Configuration
cat > "$CONF_FILE" <<CONF_EOF
CMDB_URL=$CMDB_URL
CMDB_TOKEN=$AGENT_TOKEN
CONF_EOF
chmod 600 "$CONF_FILE"
echo "   Conf : $CONF_FILE (chmod 600)"

# Premier rapport
echo "▶ Premier rapport..."
if "$INSTALL_BIN"; then
  echo "✓ Rapport envoyé"
else
  echo "⚠ Rapport initial échoué — vérifiez l'URL et le token"
fi

# LaunchDaemon (quotidien à 07h00, s'exécute en root)
cat > "$PLIST_PATH" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$INSTALL_BIN</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CMDB_URL</key><string>$CMDB_URL</string>
    <key>CMDB_TOKEN</key><string>$AGENT_TOKEN</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>7</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>/var/log/cmdb-agent.log</string>
  <key>StandardErrorPath</key><string>/var/log/cmdb-agent.log</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
PLIST_EOF
chmod 644 "$PLIST_PATH"
launchctl load -w "$PLIST_PATH" 2>/dev/null || launchctl bootstrap system "$PLIST_PATH" 2>/dev/null || true
echo "✓ LaunchDaemon activé — rapport quotidien à 07:00"

echo ""
echo "══════════════════════════════════════════════════════════"
echo " CMDB Agent Shell $AGENT_VERSION installé (macOS)"
echo "══════════════════════════════════════════════════════════"
echo " Journaux  : tail -f /var/log/cmdb-agent.log"
echo " Exécution : sudo $INSTALL_BIN"
echo " Mise à jour : re-téléchargez l'installeur (Admin > Agents)"
echo "══════════════════════════════════════════════════════════"
"""
    return script.encode("utf-8")


def generate_installer_macos(cmdb_url: str, token: str, hw_subtype: str) -> bytes:
    b64 = _script_b64()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    script = f"""#!/bin/bash
# ================================================================
# CMDB Agent Installer — macOS ({hw_subtype})
# Généré le {ts}
# Version agent : {AGENT_VERSION}
# ================================================================
set -euo pipefail

CMDB_URL="{cmdb_url}"
AGENT_TOKEN="{token}"
HW_SUBTYPE="{hw_subtype}"
INSTALL_DIR="$HOME/.cmdb-agent"
AGENT_VERSION="{AGENT_VERSION}"
PLIST_LABEL="com.capybara.cmdb-agent"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

echo "▶ Installation CMDB Agent $AGENT_VERSION dans $INSTALL_DIR"

# Vérification Python
PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null || echo "")
if [ -z "$PYTHON" ]; then
  echo "❌ Python 3 requis. Installez Homebrew puis : brew install python"
  exit 1
fi
echo "   Python : $($PYTHON --version)"

# psutil
$PYTHON -m pip install --quiet psutil 2>/dev/null || \\
  pip3 install --quiet psutil 2>/dev/null || \\
  echo "   ⚠ psutil non installé — pip install psutil"

# Dossier
mkdir -p "$INSTALL_DIR"

# Script
echo "{b64}" | base64 -d > "$INSTALL_DIR/cmdb_agent.py"
chmod 755 "$INSTALL_DIR/cmdb_agent.py"

# Config
cat > "$INSTALL_DIR/cmdb_agent.conf" <<CONF_EOF
[cmdb]
url = $CMDB_URL
token = $AGENT_TOKEN
hw_subtype = $HW_SUBTYPE
CONF_EOF
chmod 600 "$INSTALL_DIR/cmdb_agent.conf"

# Test initial
echo "▶ Premier rapport..."
$PYTHON "$INSTALL_DIR/cmdb_agent.py" && echo "✓ Rapport envoyé" || echo "⚠ Échec — vérifiez l'URL et le token"

# LaunchAgent (quotidien à 03:00)
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST_PATH" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON</string>
    <string>$INSTALL_DIR/cmdb_agent.py</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>3</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$INSTALL_DIR/cmdb_agent.log</string>
  <key>StandardErrorPath</key>
  <string>$INSTALL_DIR/cmdb_agent.log</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST_EOF

launchctl load "$PLIST_PATH" 2>/dev/null || launchctl bootstrap gui/$(id -u) "$PLIST_PATH"
echo "✓ LaunchAgent activé — rapport quotidien à 03:00"

echo ""
echo "══════════════════════════════════════════════════════════"
echo " CMDB Agent $AGENT_VERSION installé (macOS)"
echo "══════════════════════════════════════════════════════════"
echo " Dossier    : $INSTALL_DIR"
echo " Journaux   : cat $INSTALL_DIR/cmdb_agent.log"
echo " Exécution  : $PYTHON $INSTALL_DIR/cmdb_agent.py"
echo "══════════════════════════════════════════════════════════"
"""
    return script.encode("utf-8")
