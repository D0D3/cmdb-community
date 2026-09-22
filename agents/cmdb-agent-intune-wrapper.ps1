#
# Wrapper Intune pour cmdb-agent-windows.ps1
#
# Dans Intune > Devices > Scripts > Windows :
#   - Coller le CONTENU COMPLET de cmdb-agent-windows.ps1 ici, APRÈS ces variables
#   - Run as: SYSTEM
#   - 64-bit PowerShell: Yes
#
# OU utiliser ce wrapper si le script principal est sur un partage accessible :
#

$env:CMDB_URL   = "https://cmdb.capybara.example.com"
$env:CMDB_TOKEN = "REMPLACER_PAR_VOTRE_TOKEN"

# Option 1 — Script embarqué : coller ici le contenu de cmdb-agent-windows.ps1
# (recommandé pour Intune — pas de dépendance réseau sur le partage)

# Option 2 — Script sur partage (nécessite que le poste ait accès au partage lors de l'exécution)
# & "\\srv-fichiers\IT\scripts\cmdb-agent-windows.ps1"
