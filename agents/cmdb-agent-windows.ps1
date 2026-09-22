#Requires -Version 5.1
<#
.SYNOPSIS
    CMDB Agent pour Windows — collecte et envoi d'inventaire via CIM/WMI.

.DESCRIPTION
    Collecte : OS, CPU, RAM, disques, adresse MAC/IP, hostname.
    Envoie les données à l'API CMDB via POST /api/agent/report.
    Compatible Windows 10/11, Windows Server 2016/2019/2022.

.PARAMETER CmdbUrl
    URL de base de la CMDB. Ex : https://cmdb.example.com

.PARAMETER CmdbToken
    Token agent généré dans l'interface CMDB (Admin > Agents).

.EXAMPLE
    .\cmdb-agent-windows.ps1 -CmdbUrl "https://cmdb.example.com" -CmdbToken "cmdb_xxxx"

.NOTES
    DÉPLOIEMENT GPO :
    ─────────────────
    1. Copier ce script sur un partage réseau : \\srv\scripts\cmdb-agent-windows.ps1
    2. GPO > Configuration ordinateur > Paramètres Windows > Scripts (démarrage)
       Ou mieux : GPO > Tâches planifiées (Immédiat) avec trigger "Daily"
    3. Commande : powershell.exe -ExecutionPolicy Bypass -File "\\srv\scripts\cmdb-agent-windows.ps1"
       Arguments : -CmdbUrl "https://cmdb.example.com" -CmdbToken "cmdb_xxxx"
    Note : stocker le token dans un fichier sécurisé sur le partage (NTFS ACL lecteur seul).

    DÉPLOIEMENT INTUNE :
    ─────────────────────
    1. Intune > Devices > Scripts > Windows > Add
    2. Coller le contenu de ce script OU utiliser le wrapper ci-dessous.
    3. Script settings :
       - Run this script using logged-on credentials : No
       - Enforce script signature check : No
       - Run script in 64-bit PowerShell : Yes
    4. Wrapper pour Intune (injecte les paramètres en dur) :
       $env:CMDB_URL   = "https://cmdb.example.com"
       $env:CMDB_TOKEN = "cmdb_xxxx"
       # (coller le corps du script ici, ou l'appeler depuis un share)

    EXÉCUTION MANUELLE (test) :
    ────────────────────────────
    $env:CMDB_URL   = "https://cmdb.example.com"
    $env:CMDB_TOKEN = "cmdb_xxxx"
    .\cmdb-agent-windows.ps1
#>

[CmdletBinding()]
param(
    [string]$CmdbUrl   = $env:CMDB_URL,
    [string]$CmdbToken = $env:CMDB_TOKEN
)

$AgentVersion = "1.0.0"
$ErrorActionPreference = "Stop"

# ── Validation ────────────────────────────────────────────────────────────────

if (-not $CmdbUrl -or -not $CmdbToken) {
    Write-Error "CMDB_URL et CMDB_TOKEN doivent être définis (paramètre ou variable d'environnement)."
    exit 1
}
$CmdbUrl = $CmdbUrl.TrimEnd('/')

# ── Détection du sous-type matériel ──────────────────────────────────────────

function Get-HwSubtype {
    # Vérifier si VM via fabricant
    $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
    $mfr = ($cs.Manufacturer ?? "").ToLower()
    $model = ($cs.Model ?? "").ToLower()
    if ($mfr -match "vmware|virtualbox|xen|qemu|hyper-v|microsoft corporation" -and
        $model -match "virtual|vmware|hyper-v") {
        return "vm"
    }
    # Vérifier via chassis
    $chassis = Get-CimInstance -ClassName Win32_SystemEnclosure -ErrorAction SilentlyContinue
    $types = $chassis.ChassisTypes | Select-Object -First 1
    switch ($types) {
        { $_ -in @(1,2,17,18,19,20,21,22,23) } { return "server" }
        { $_ -in @(8,9,10,11,12,13,14,15,16) } { return "workstation" }  # laptops
        default {
            # Serveur par hostname ou via rôle OS
            $osCaption = (Get-CimInstance Win32_OperatingSystem).Caption
            if ($osCaption -match "Server") { return "server" }
            return "workstation"
        }
    }
}

# ── Collecte OS ───────────────────────────────────────────────────────────────

$OS        = Get-CimInstance -ClassName Win32_OperatingSystem
$OsName    = $OS.Caption -replace "Microsoft ", ""
$OsVersion = $OS.Version
$OsBuild   = "Build $($OS.BuildNumber)"

# ── CPU ───────────────────────────────────────────────────────────────────────

$CPU      = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1
$CpuModel = $CPU.Name.Trim()
$CpuCount = (Get-CimInstance -ClassName Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum

# ── RAM ───────────────────────────────────────────────────────────────────────

$CS    = Get-CimInstance -ClassName Win32_ComputerSystem
$RamGb = [math]::Round($CS.TotalPhysicalMemory / 1GB, 1)

# ── Réseau ────────────────────────────────────────────────────────────────────

$NetAdapter = Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration |
    Where-Object { $_.IPEnabled -and $_.MACAddress -and $_.IPAddress } |
    Select-Object -First 1

$IpAddress  = if ($NetAdapter) { $NetAdapter.IPAddress | Where-Object { $_ -match '^\d{1,3}\.' } | Select-Object -First 1 } else { "" }
$MacAddress = if ($NetAdapter) { $NetAdapter.MACAddress.ToUpper().Replace("-", ":") } else { "" }

# ── Disques ───────────────────────────────────────────────────────────────────

$Disks = Get-CimInstance -ClassName Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }
$DisksJson = ($Disks | ForEach-Object {
    $totalGb = [math]::Round($_.Size / 1GB, 1)
    $freeGb  = [math]::Round($_.FreeSpace / 1GB, 1)
    "{`"mount`":`"$($_.DeviceID)\`",`"device`":`"$($_.DeviceID)`",`"total_gb`":$totalGb,`"free_gb`":$freeGb}"
}) -join ","
$DisksJson = "[$DisksJson]"

# ── Hostname ──────────────────────────────────────────────────────────────────

$Hostname = [System.Net.Dns]::GetHostEntry("").HostName

# ── Sous-type ─────────────────────────────────────────────────────────────────

$HwSubtype = Get-HwSubtype

# ── Payload JSON ─────────────────────────────────────────────────────────────

$Payload = [ordered]@{
    agent_version = $AgentVersion
    hostname      = $Hostname
    hw_subtype    = $HwSubtype
    os_name       = $OsName
    os_version    = $OsVersion
    os_build      = $OsBuild
    cpu_model     = $CpuModel
    cpu_count     = $CpuCount
    ram_gb        = $RamGb
    disks         = ($Disks | ForEach-Object {
        @{
            mount    = "$($_.DeviceID)\"
            device   = $_.DeviceID
            total_gb = [math]::Round($_.Size / 1GB, 1)
            free_gb  = [math]::Round($_.FreeSpace / 1GB, 1)
        }
    })
    mac_address   = $MacAddress
    ip_address    = $IpAddress
}

$JsonBody = $Payload | ConvertTo-Json -Depth 4 -Compress

# ── Envoi ─────────────────────────────────────────────────────────────────────

$Headers = @{
    "Authorization" = "Bearer $CmdbToken"
    "Content-Type"  = "application/json"
}

try {
    $Response = Invoke-RestMethod `
        -Uri    "$CmdbUrl/api/agent/report" `
        -Method POST `
        -Headers $Headers `
        -Body   $JsonBody `
        -TimeoutSec 30

    Write-Host "[CMDB] OK — $($Response.action) : $($Response.ci_name)"
}
catch {
    $StatusCode = $_.Exception.Response.StatusCode.Value__
    Write-Error "[CMDB] ERREUR HTTP $StatusCode : $($_.Exception.Message)"
    exit 1
}
