#!/usr/bin/env bash
# =============================================================================
# CMDB Agent — Linux (Ubuntu, Debian, Fedora, RHEL/Rocky/AlmaLinux)
# Version : 1.0.0
#
# Usage :
#   CMDB_URL=https://cmdb.example.com CMDB_TOKEN=cmdb_xxx ./cmdb-agent-linux.sh
#
# Déploiement automatique (cron quotidien) :
#   sudo install -m 755 cmdb-agent-linux.sh /usr/local/bin/cmdb-agent
#   sudo tee /etc/cmdb-agent.conf <<'EOF'
#   CMDB_URL=https://cmdb.example.com
#   CMDB_TOKEN=cmdb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#   EOF
#   sudo chmod 600 /etc/cmdb-agent.conf
#   echo "0 7 * * * root . /etc/cmdb-agent.conf && cmdb-agent" | sudo tee /etc/cron.d/cmdb-agent
# =============================================================================

set -euo pipefail

AGENT_VERSION="1.0.0"
CONF_FILE="/etc/cmdb-agent.conf"

# Charger la conf si elle existe
[[ -f "$CONF_FILE" ]] && source "$CONF_FILE"

CMDB_URL="${CMDB_URL:-}"
CMDB_TOKEN="${CMDB_TOKEN:-}"

if [[ -z "$CMDB_URL" || -z "$CMDB_TOKEN" ]]; then
    echo "ERREUR : CMDB_URL et CMDB_TOKEN doivent être définis." >&2
    echo "  export CMDB_URL=https://cmdb.example.com" >&2
    echo "  export CMDB_TOKEN=cmdb_xxxx..." >&2
    exit 1
fi

# ── Détection du sous-type matériel ──────────────────────────────────────────

detect_hw_subtype() {
    # Vérifier si on est dans une VM (systemd-detect-virt)
    if command -v systemd-detect-virt &>/dev/null; then
        local virt
        virt=$(systemd-detect-virt 2>/dev/null || true)
        if [[ -n "$virt" && "$virt" != "none" ]]; then
            echo "vm"
            return
        fi
    fi
    # Vérifier via DMI
    local chassis
    chassis=$(cat /sys/class/dmi/id/chassis_type 2>/dev/null || echo "0")
    case "$chassis" in
        1|17|18|19|20|21) echo "server" ;;    # rack/tower servers
        8|9|10|14)         echo "workstation" ;; # laptop/notebook
        *)
            # Dernier recours : hostname ou présence de terminal services
            if [[ "$(uname -n)" =~ (srv|server|esxi|hyperv|kvm) ]]; then
                echo "server"
            else
                echo "workstation"
            fi
        ;;
    esac
}

# ── Collecte OS ───────────────────────────────────────────────────────────────

OS_NAME=""
OS_VERSION=""
OS_BUILD=""

if [[ -f /etc/os-release ]]; then
    source /etc/os-release
    OS_NAME="${NAME:-Linux}"
    OS_VERSION="${VERSION_ID:-unknown}"
    OS_BUILD="${BUILD_ID:-${VERSION:-}}"
elif [[ -f /etc/redhat-release ]]; then
    OS_NAME=$(cat /etc/redhat-release)
    OS_VERSION=$(grep -oP '\d+\.\d+' /etc/redhat-release | head -1)
fi

KERNEL=$(uname -r)
[[ -z "$OS_BUILD" ]] && OS_BUILD="kernel $KERNEL"

# ── CPU ───────────────────────────────────────────────────────────────────────

CPU_MODEL=$(grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2 | xargs || echo "Unknown")
CPU_COUNT=$(nproc 2>/dev/null || grep -c "^processor" /proc/cpuinfo)

# ── RAM ───────────────────────────────────────────────────────────────────────

RAM_KB=$(grep "^MemTotal" /proc/meminfo | awk '{print $2}')
RAM_GB=$(awk "BEGIN {printf \"%.1f\", $RAM_KB/1048576}")

# ── Réseau ────────────────────────────────────────────────────────────────────

# Première interface non-loopback active
PRIMARY_IFACE=$(ip route get 1.1.1.1 2>/dev/null | awk '/dev/{print $5}' | head -1 || true)
IP_ADDRESS=""
MAC_ADDRESS=""

if [[ -n "$PRIMARY_IFACE" ]]; then
    IP_ADDRESS=$(ip addr show "$PRIMARY_IFACE" 2>/dev/null | awk '/inet /{print $2}' | cut -d/ -f1 | head -1 || true)
    MAC_ADDRESS=$(cat "/sys/class/net/$PRIMARY_IFACE/address" 2>/dev/null | tr '[:lower:]' '[:upper:]' || true)
fi

# ── Disques ───────────────────────────────────────────────────────────────────

build_disk_json() {
    local json="["
    local first=true
    while IFS= read -r line; do
        local device mount size_kb used_kb
        device=$(echo "$line" | awk '{print $1}')
        mount=$(echo "$line"  | awk '{print $6}')
        size_kb=$(echo "$line" | awk '{print $2}')
        used_kb=$(echo "$line" | awk '{print $3}')
        local total_gb free_gb
        total_gb=$(awk "BEGIN {printf \"%.1f\", $size_kb/1048576}")
        free_gb=$(awk  "BEGIN {printf \"%.1f\", ($size_kb-$used_kb)/1048576}")
        [[ "$first" == true ]] && first=false || json+=","
        json+="{\"mount\":\"$mount\",\"device\":\"$device\",\"total_gb\":$total_gb,\"free_gb\":$free_gb}"
    done < <(df -k --output=source,size,used,pcent,iused,target 2>/dev/null | grep "^/dev/" || \
             df -k 2>/dev/null | awk 'NR>1 && $1~/^\/dev\// {print}')
    json+="]"
    echo "$json"
}

DISKS_JSON=$(build_disk_json)
HOSTNAME=$(hostname -f 2>/dev/null || hostname)
HW_SUBTYPE=$(detect_hw_subtype)

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
