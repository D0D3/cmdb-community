#!/usr/bin/env bash
# =============================================================================
# CMDB Agent — macOS (10.15 Catalina et ultérieur)
# Version : 1.0.0
#
# Prérequis : curl (inclus dans macOS)
#
# Usage :
#   CMDB_URL=https://cmdb.example.com CMDB_TOKEN=cmdb_xxx ./cmdb-agent-macos.sh
#
# Déploiement automatique via LaunchDaemon (quotidien à 7h) :
#   1. Copier le script :
#      sudo install -m 755 cmdb-agent-macos.sh /usr/local/bin/cmdb-agent
#   2. Créer /etc/cmdb-agent.conf :
#      sudo tee /etc/cmdb-agent.conf <<'EOF'
#      CMDB_URL=https://cmdb.example.com
#      CMDB_TOKEN=cmdb_xxxxxxxx
#      EOF
#      sudo chmod 600 /etc/cmdb-agent.conf
#   3. Installer le LaunchDaemon :
#      sudo cp com.cmdb.agent.plist /Library/LaunchDaemons/
#      sudo launchctl load /Library/LaunchDaemons/com.cmdb.agent.plist
#
# Déploiement via MDM (Jamf / Mosyle / Kandji — gratuit pour usage basique) :
#   - Ajouter le script comme "Policy" ou "Script" planifié
#   - Définir CMDB_URL et CMDB_TOKEN comme variables d'environnement MDM
#   - Fréquence : "Once per day"
# =============================================================================

set -euo pipefail

AGENT_VERSION="1.0.0"
CONF_FILE="/etc/cmdb-agent.conf"

[[ -f "$CONF_FILE" ]] && source "$CONF_FILE"

CMDB_URL="${CMDB_URL:-}"
CMDB_TOKEN="${CMDB_TOKEN:-}"

if [[ -z "$CMDB_URL" || -z "$CMDB_TOKEN" ]]; then
    echo "ERREUR : CMDB_URL et CMDB_TOKEN doivent être définis." >&2
    exit 1
fi

# ── Collecte via system_profiler ──────────────────────────────────────────────

# OS
OS_NAME="macOS"
OS_VERSION=$(sw_vers -productVersion 2>/dev/null || echo "unknown")
OS_BUILD=$(sw_vers -buildVersion 2>/dev/null || echo "")
SW_NAME=$(sw_vers -productName 2>/dev/null || echo "macOS")   # "macOS Sonoma" sur les récents
[[ -n "$SW_NAME" ]] && OS_NAME="$SW_NAME"

# CPU
CPU_MODEL=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || system_profiler SPHardwareDataType 2>/dev/null | awk '/Chip|Processor Name/{print $NF; exit}')
CPU_COUNT=$(sysctl -n hw.logicalcpu 2>/dev/null || echo 1)

# RAM
RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
RAM_GB=$(awk "BEGIN {printf \"%.1f\", $RAM_BYTES/1073741824}")

# Réseau — première interface active (en0 ou autre)
PRIMARY_IFACE=$(route get default 2>/dev/null | awk '/interface:/{print $2}' | head -1 || echo "en0")
IP_ADDRESS=$(ipconfig getifaddr "$PRIMARY_IFACE" 2>/dev/null || true)
MAC_ADDRESS=$(ifconfig "$PRIMARY_IFACE" 2>/dev/null | awk '/ether/{print toupper($2)}' | head -1 || true)

# Hostname
HOSTNAME=$(scutil --get ComputerName 2>/dev/null || hostname -f 2>/dev/null || hostname)

# HW subtype — toujours workstation sur Mac (pas de VM détection fiable sans outils tiers)
HW_SUBTYPE="workstation"
# Détecter si Mac Mini / Mac Pro (peut être utilisé comme serveur)
MODEL=$(system_profiler SPHardwareDataType 2>/dev/null | awk '/Model Identifier/{print $NF}' | head -1 || true)
[[ "$MODEL" =~ MacPro|MacMini|Xserve ]] && HW_SUBTYPE="server"

# Disques
build_disk_json() {
    local json="["
    local first=true
    while IFS= read -r line; do
        local device mount total_bytes free_bytes total_gb free_gb
        device=$(echo "$line" | awk '{print $1}')
        mount=$(echo "$line"  | awk '{print $9}')
        total_bytes=$(echo "$line" | awk '{print $2}')
        free_bytes=$(echo "$line"  | awk '{print $4}')
        total_gb=$(awk "BEGIN {printf \"%.1f\", $total_bytes/1073741824}")
        free_gb=$(awk  "BEGIN {printf \"%.1f\", $free_bytes/1073741824}")
        [[ "$first" == true ]] && first=false || json+=","
        json+="{\"mount\":\"$mount\",\"device\":\"$device\",\"total_gb\":$total_gb,\"free_gb\":$free_gb}"
    done < <(df -k 2>/dev/null | awk 'NR>1 && $1~/^\/dev\// {print}')
    json+="]"
    echo "$json"
}

DISKS_JSON=$(build_disk_json)

# ── Envoi ─────────────────────────────────────────────────────────────────────

PAYLOAD=$(cat <<EOF
{
  "agent_version": "$AGENT_VERSION",
  "hostname": "$HOSTNAME",
  "hw_subtype": "$HW_SUBTYPE",
  "os_name": "$OS_NAME",
  "os_version": "$OS_VERSION",
  "os_build": "$OS_BUILD",
  "cpu_model": "$CPU_MODEL",
  "cpu_count": $CPU_COUNT,
  "ram_gb": $RAM_GB,
  "disks": $DISKS_JSON,
  "mac_address": "$MAC_ADDRESS",
  "ip_address": "$IP_ADDRESS"
}
EOF
)

HTTP_CODE=$(curl -s -o /tmp/cmdb-agent-response.json -w "%{http_code}" \
    -X POST "${CMDB_URL}/api/agent/report" \
    -H "Authorization: Bearer ${CMDB_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

if [[ "$HTTP_CODE" == "200" ]]; then
    ACTION=$(grep -o '"action":"[^"]*"' /tmp/cmdb-agent-response.json | cut -d'"' -f4)
    CI_NAME=$(grep -o '"ci_name":"[^"]*"' /tmp/cmdb-agent-response.json | cut -d'"' -f4)
    echo "[CMDB] OK — $ACTION : $CI_NAME"
else
    echo "[CMDB] ERREUR HTTP $HTTP_CODE" >&2
    cat /tmp/cmdb-agent-response.json >&2
    exit 1
fi
