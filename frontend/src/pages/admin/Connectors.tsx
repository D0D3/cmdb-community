import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PlugZap, Plus, CheckCircle2, XCircle, Loader2, Trash2,
  RefreshCw, TestTube2, ChevronRight, Settings2, HelpCircle, ChevronDown, ChevronUp,
  History, Clock,
} from 'lucide-react'
import {
  listConnectors, createConnector, updateConnector, deleteConnector,
  testConnector, syncConnector, getConnectorHistory,
  type ConnectorOut, type ConnectorCreate, type SyncLogOut,
} from '@/api/connectors'
import Spinner from '@/components/ui/Spinner'
import { cn, formatDateTime } from '@/lib/utils'

// ── Définitions des types de connecteurs ──────────────────────────────────────

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'password' | 'url' | 'number' | 'toggle'
  placeholder?: string
  required?: boolean
}

interface ConnectorTypeDef {
  type: string
  name: string
  description: string
  category: string
  syncable?: boolean
  fields: FieldDef[]
}

const CONNECTOR_DEFS: ConnectorTypeDef[] = [
  {
    type: 'ldap', name: 'LDAP / Active Directory', category: 'On-prem', syncable: true,
    description: 'Authentification et sync utilisateurs depuis un annuaire LDAP ou AD on-prem.',
    fields: [
      { key: 'host',          label: 'Hôte',              type: 'text',     placeholder: 'ldap.exemple.com',             required: true },
      { key: 'port',          label: 'Port',               type: 'number',   placeholder: '389 (ou 636 pour LDAPS)' },
      { key: 'use_ssl',       label: 'LDAPS (SSL/TLS)',    type: 'toggle' },
      { key: 'bind_dn',       label: 'Bind DN',            type: 'text',     placeholder: 'cn=svc-cmdb,ou=Services,dc=exemple,dc=com' },
      { key: 'bind_password', label: 'Mot de passe bind',  type: 'password' },
      { key: 'base_dn',       label: 'Base DN',            type: 'text',     placeholder: 'dc=exemple,dc=com', required: true },
      { key: 'user_filter',   label: 'Filtre utilisateurs',type: 'text',     placeholder: '(sAMAccountName={username})' },
      { key: 'search_attr',   label: 'Attribut email',     type: 'text',     placeholder: 'mail' },
    ],
  },
  {
    type: 'glpi', name: 'GLPI', category: 'On-prem', syncable: true,
    description: 'Import et sync du parc matériel depuis votre instance GLPI on-prem.',
    fields: [
      { key: 'url',        label: 'URL GLPI',   type: 'url',      placeholder: 'https://glpi.exemple.com', required: true },
      { key: 'app_token',  label: 'App Token',  type: 'password', required: true },
      { key: 'user_token', label: 'User Token', type: 'password', placeholder: 'optionnel si username/password' },
      { key: 'username',   label: 'Utilisateur',type: 'text',     placeholder: 'optionnel' },
      { key: 'password',   label: 'Mot de passe',type: 'password',placeholder: 'optionnel' },
    ],
  },
  {
    type: 'entra', name: 'Microsoft Entra ID', category: 'Microsoft', syncable: true,
    description: 'Sync des utilisateurs et groupes depuis Azure Active Directory via Microsoft Graph.',
    fields: [
      { key: 'tenant_id',     label: 'Tenant ID',     type: 'text',     required: true },
      { key: 'client_id',     label: 'Client ID',     type: 'text',     required: true },
      { key: 'client_secret', label: 'Client Secret', type: 'password', required: true },
      { key: 'sync_groups',   label: 'Groupes à sync',type: 'text',     placeholder: 'IT-Team,Support (séparés par virgule)' },
    ],
  },
  {
    type: 'intune', name: 'Microsoft Intune', category: 'Microsoft', syncable: true,
    description: 'Import des équipements gérés (OS, version, build) depuis Microsoft Intune.',
    fields: [
      { key: 'tenant_id',     label: 'Tenant ID',     type: 'text',     required: true },
      { key: 'client_id',     label: 'Client ID',     type: 'text',     required: true },
      { key: 'client_secret', label: 'Client Secret', type: 'password', required: true },
    ],
  },
  {
    type: 'servicenow', name: 'ServiceNow', category: 'Cloud ticketing',
    description: 'Création de tickets et sync depuis une instance ServiceNow.',
    fields: [
      { key: 'instance_url', label: 'URL instance', type: 'url',      placeholder: 'https://xxx.service-now.com', required: true },
      { key: 'username',     label: 'Utilisateur',  type: 'text',     required: true },
      { key: 'password',     label: 'Mot de passe', type: 'password', required: true },
    ],
  },
  {
    type: 'jira', name: 'Jira Service Management', category: 'Cloud ticketing',
    description: 'Création de tickets dans Jira depuis les alertes CMDB.',
    fields: [
      { key: 'url',       label: 'URL Jira',    type: 'url',      placeholder: 'https://monorg.atlassian.net', required: true },
      { key: 'email',     label: 'E-mail',      type: 'text',     required: true },
      { key: 'api_token', label: 'API Token',   type: 'password', required: true },
    ],
  },
  {
    type: 'atera', name: 'Atera', category: 'Cloud ticketing',
    description: 'RMM & ticketing Atera — import agents et création de tickets.',
    fields: [
      { key: 'api_key', label: 'Clé API', type: 'password', required: true },
    ],
  },
  {
    type: 'freshservice', name: 'Freshservice', category: 'Cloud ticketing',
    description: 'ITSM Freshservice — gestion de tickets liés aux alertes CMDB.',
    fields: [
      { key: 'domain',  label: 'Domaine',  type: 'text',     placeholder: 'monentreprise', required: true },
      { key: 'api_key', label: 'Clé API',  type: 'password', required: true },
    ],
  },
  {
    type: 'zendesk', name: 'Zendesk', category: 'Cloud ticketing',
    description: 'Création de tickets Zendesk depuis les alertes CMDB.',
    fields: [
      { key: 'subdomain', label: 'Sous-domaine', type: 'text',     placeholder: 'monentreprise', required: true },
      { key: 'email',     label: 'E-mail',       type: 'text',     required: true },
      { key: 'api_token', label: 'API Token',    type: 'password', required: true },
    ],
  },
  {
    type: 'custom', name: 'Personnalisé', category: 'Autre',
    description: 'Intégration sur mesure via une URL REST personnalisée.',
    fields: [
      { key: 'url',  label: 'URL',       type: 'url',      required: true },
      { key: 'name', label: 'Nom API',   type: 'text' },
    ],
  },
  // ── Notifications ─────────────────────────────────────────────────────────
  {
    type: 'smtp', name: 'SMTP — Email', category: 'Notifications',
    description: 'Serveur SMTP pour les notifications par email (RFC en attente, alertes critiques…).',
    fields: [
      { key: 'host',     label: 'Hôte SMTP',       type: 'text',     placeholder: 'smtp.exemple.com', required: true },
      { key: 'port',     label: 'Port',             type: 'number',   placeholder: '587' },
      { key: 'user',     label: 'Utilisateur',      type: 'text',     placeholder: 'cmdb@exemple.com' },
      { key: 'password', label: 'Mot de passe',     type: 'password' },
      { key: 'from',     label: 'Adresse expéditeur', type: 'text',   placeholder: 'cmdb@exemple.com' },
      { key: 'use_tls',  label: 'STARTTLS',         type: 'toggle' },
    ],
  },
  // ── Découverte agentless ───────────────────────────────────────────────────
  {
    type: 'ssh', name: 'SSH Discovery', category: 'Découverte agentless', syncable: true,
    description: 'Découverte de serveurs Linux/Unix via SSH — collecte OS, CPU, RAM, disques sans installer d\'agent.',
    fields: [
      { key: 'hosts',            label: 'Hôtes',            type: 'text',     placeholder: '192.168.1.10, srv-web, 10.0.0.5', required: true,
        // hint shown in UI
      },
      { key: 'port',             label: 'Port SSH',         type: 'number',   placeholder: '22' },
      { key: 'username',         label: 'Utilisateur',      type: 'text',     placeholder: 'root', required: true },
      { key: 'password',         label: 'Mot de passe',     type: 'password', placeholder: 'ou utiliser une clé SSH' },
      { key: 'private_key_path', label: 'Clé privée (chemin)', type: 'text', placeholder: '/etc/cmdb-agent/id_rsa' },
    ],
  },
]

const DEF_BY_TYPE = Object.fromEntries(CONNECTOR_DEFS.map((d) => [d.type, d]))

const CATEGORY_ORDER = ['On-prem', 'Découverte agentless', 'Microsoft', 'Cloud ticketing', 'Notifications', 'Autre']

// ── Helpers UI ────────────────────────────────────────────────────────────────

// ── Modal de configuration ────────────────────────────────────────────────────

const SYNC_LABELS: Record<string, string> = {
  created:     'Créés',
  updated:     'Mis à jour',
  deactivated: 'Désactivés',
  total:       'Total',
  errors:      'Erreurs',
  error:       'Erreur',
  hint:        'Conseil',
  // GLPI
  hardware_created: 'Matériel créé',
  hardware_updated: 'Matériel mis à jour',
  software_created: 'Logiciel créé',
  software_updated: 'Logiciel mis à jour',
  // DB
  serveur:          'Serveur',
  bases_trouvees:   'Bases trouvées',
}

function SyncResultPanel({ result }: { result: Record<string, unknown> }) {
  const hasError = 'error' in result || (result.errors as number) > 0
  return (
    <div className={cn(
      'rounded-md border px-3 py-2.5 text-xs space-y-1',
      hasError
        ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-800 dark:text-amber-300'
        : 'border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 text-green-800 dark:text-green-300',
    )}>
      <p className="font-semibold">
        {hasError ? '⚠ Sync terminée avec avertissements' : '✓ Synchronisation réussie'}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {Object.entries(result).map(([k, v]) => (
          <span key={k}>
            <span className="text-current/70">{SYNC_LABELS[k] ?? k} : </span>
            <span className="font-semibold font-mono">{String(v)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Guide LDAP / Active Directory ────────────────────────────────────────────

function LdapHelpPanel() {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-800 px-4 py-3.5 text-xs space-y-4">
      <p className="font-semibold text-violet-900 dark:text-violet-200 text-sm">
        Configuration LDAP / Active Directory — guide
      </p>

      <div className="space-y-1.5">
        <p className="font-semibold text-violet-800 dark:text-violet-300">Valeurs typiques Active Directory</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-left">
                <th className="pr-3 pb-1 text-violet-700 dark:text-violet-400 font-semibold">Champ</th>
                <th className="pr-3 pb-1 text-violet-700 dark:text-violet-400 font-semibold">Exemple</th>
                <th className="pb-1 text-violet-700 dark:text-violet-400 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="text-violet-700 dark:text-violet-400 space-y-0.5">
              {[
                ['Hôte',               'ad.exemple.com',                                      'IP ou nom DNS du contrôleur de domaine'],
                ['Port',               '389 (LDAP) / 636 (LDAPS)',                            'Activer LDAPS pour chiffrer le trafic'],
                ['Bind DN',            'cn=svc-cmdb,ou=Services,dc=exemple,dc=com',           'Compte de service dédié (lecture seule)'],
                ['Base DN',            'dc=exemple,dc=com',                                   'Racine de recherche des utilisateurs'],
                ['Filtre utilisateurs','(sAMAccountName={username})',                          '{username} est remplacé au moment du login'],
                ['Filtre sync',        '(objectClass=person)',                                 'Pour la synchronisation quotidienne'],
                ['Attribut email',     'mail',                                                 'Ou "userPrincipalName" selon votre AD'],
              ].map(([f, ex, note]) => (
                <tr key={f}>
                  <td className="pr-3 py-0.5 font-medium shrink-0">{f}</td>
                  <td className="pr-3 py-0.5 font-mono text-[10px]">{ex}</td>
                  <td className="py-0.5 text-violet-600 dark:text-violet-500">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="font-semibold text-violet-800 dark:text-violet-300">Compte de service recommandé</p>
        <p className="text-violet-700 dark:text-violet-400 ml-1">
          Créer un compte AD dédié (ex. <code className="bg-violet-100 dark:bg-violet-900 px-1 rounded">svc-cmdb</code>) avec :<br />
          • Droit <strong>lecture seule</strong> sur l'OU des utilisateurs<br />
          • Mot de passe qui n'expire pas (<em>Password never expires</em>)<br />
          • Pas d'accès interactif nécessaire
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="font-semibold text-violet-800 dark:text-violet-300">Comportement</p>
        <p className="text-violet-700 dark:text-violet-400 ml-1">
          • <strong>Authentification</strong> : ce connecteur (actif) remplace la config <code className="bg-violet-100 dark:bg-violet-900 px-1 rounded">.env</code> pour le login LDAP<br />
          • <strong>Sync utilisateurs</strong> : importe les comptes AD dans la CMDB (crée ou met à jour)<br />
          • Les comptes désactivés en AD (flag <em>userAccountControl</em>) sont désactivés en CMDB
        </p>
      </div>
    </div>
  )
}

// ── Guide Azure AD (EntraID) ──────────────────────────────────────────────────

const REDIRECT_URI = `${window.location.protocol}//${window.location.host}/api/auth/oidc/callback`

function EntraHelpPanel() {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3.5 text-xs space-y-4">
      <p className="font-semibold text-blue-900 dark:text-blue-200 text-sm">
        Configuration dans Azure AD — guide étape par étape
      </p>

      {/* Étape 1 */}
      <div className="space-y-1.5">
        <p className="font-semibold text-blue-800 dark:text-blue-300">
          1 · Créer l'App Registration
        </p>
        <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-400 ml-1">
          <li>Ouvrir <strong>portal.azure.com</strong> → <em>Microsoft Entra ID</em></li>
          <li>Inscriptions d'applications → <strong>Nouvelle inscription</strong></li>
          <li>Nom : <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">CMDB</code> (ou autre)</li>
          <li>Types de comptes : <strong>locataire unique</strong></li>
          <li>Cliquer <strong>Inscrire</strong></li>
        </ol>
      </div>

      {/* Étape 2 */}
      <div className="space-y-1.5">
        <p className="font-semibold text-blue-800 dark:text-blue-300">
          2 · Récupérer Tenant ID et Client ID
        </p>
        <p className="text-blue-700 dark:text-blue-400 ml-1">
          Sur la page de l'application : copier<br />
          <strong>Directory (tenant) ID</strong> → champ <em>Tenant ID</em><br />
          <strong>Application (client) ID</strong> → champ <em>Client ID</em>
        </p>
      </div>

      {/* Étape 3 */}
      <div className="space-y-1.5">
        <p className="font-semibold text-blue-800 dark:text-blue-300">
          3 · Créer un secret client
        </p>
        <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-400 ml-1">
          <li><strong>Certificats et secrets</strong> → Nouveau secret client</li>
          <li>Choisir une durée, cliquer <strong>Ajouter</strong></li>
          <li>Copier la <strong>Valeur</strong> (visible une seule fois) → champ <em>Client Secret</em></li>
        </ol>
      </div>

      {/* Étape 4 — Permissions Graph */}
      <div className="space-y-1.5">
        <p className="font-semibold text-blue-800 dark:text-blue-300">
          4 · Autorisations API (sync utilisateurs)
        </p>
        <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-400 ml-1">
          <li><strong>Autorisations API</strong> → Ajouter une autorisation → Microsoft Graph</li>
          <li>Autorisations d'application (pas déléguées) :</li>
        </ol>
        <div className="ml-5 flex flex-wrap gap-1.5 mt-1">
          {['User.Read.All', 'Group.Read.All'].map((p) => (
            <code key={p} className="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded text-blue-800 dark:text-blue-300">
              {p}
            </code>
          ))}
        </div>
        <p className="ml-1 text-blue-700 dark:text-blue-400">
          Puis : <strong>Accorder le consentement administrateur</strong> (bouton bleu en haut du tableau).
        </p>
      </div>

      {/* Séparateur SSO */}
      <div className="border-t border-blue-200 dark:border-blue-700 pt-3 space-y-2">
        <p className="font-semibold text-blue-800 dark:text-blue-300">
          5 · SSO (connexion via Microsoft) — optionnel
        </p>
        <p className="text-blue-700 dark:text-blue-400 ml-1">
          Dans l'App Registration → <strong>Authentification</strong> → Ajouter une plateforme → <em>Web</em><br />
          Redirect URI :
        </p>
        <code className="block bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-200 px-2 py-1 rounded break-all">
          {REDIRECT_URI}
        </code>
        <p className="text-blue-700 dark:text-blue-400 ml-1 mt-1">
          Ajouter ensuite dans le fichier <code>.env</code> du serveur :
        </p>
        <pre className="bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-200 px-2 py-1.5 rounded text-[11px] leading-relaxed overflow-x-auto">{
`OIDC_ISSUER=https://login.microsoftonline.com/<tenant_id>/v2.0
OIDC_CLIENT_ID=<client_id>
OIDC_CLIENT_SECRET=<client_secret>`
        }</pre>
        <p className="text-blue-600 dark:text-blue-400 ml-1">
          Puis redémarrer le service. Le bouton "Se connecter avec Microsoft" apparaît automatiquement sur la page de connexion.
        </p>
      </div>
    </div>
  )
}

// ── Modal de configuration ────────────────────────────────────────────────────

function ConnectorModal({
  def, existing, onClose,
}: {
  def: ConnectorTypeDef
  existing?: ConnectorOut
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {}
    def.fields.forEach((f) => {
      base[f.key] = existing?.config?.[f.key] ?? ''
    })
    return base
  })
  const [name, setName]               = useState(existing?.name ?? def.name)
  const [enabled, setEnabled]         = useState(existing?.enabled ?? false)
  const [intervalH, setIntervalH]     = useState<string>(String(existing?.sync_interval_hours ?? 24))
  const [testResult, setTestResult]   = useState<{ ok: boolean; msg: string } | null>(null)
  const [syncing, setSyncing]         = useState(false)
  const [syncResult, setSyncResult]   = useState<Record<string, unknown> | null>(null)
  const [showHelp, setShowHelp]       = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  // Tracks the connector ID even when created mid-session via "Tester"
  const [connectorId, setConnectorId] = useState<string | undefined>(existing?.id)

  const { data: history = [] } = useQuery({
    queryKey: ['connector-history', connectorId],
    queryFn: () => getConnectorHistory(connectorId!, 8),
    enabled: !!connectorId && showHistory,
    staleTime: 30_000,
  })

  const saveMut = useMutation({
    mutationFn: () => connectorId
      ? updateConnector(connectorId, {
          name, enabled, config: form,
          sync_interval_hours: def.syncable ? parseInt(intervalH) || 24 : undefined,
        })
      : createConnector({ name, connector_type: def.type, enabled, config: form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connectors'] }); onClose() },
  })

  const testMut = useMutation({
    mutationFn: async () => {
      if (!connectorId) {
        const c = await createConnector({ name, connector_type: def.type, enabled, config: form })
        setConnectorId(c.id)
        return { id: c.id }
      }
      await updateConnector(connectorId, { name, enabled, config: form })
      return { id: connectorId }
    },
    onSuccess: async ({ id }) => {
      qc.invalidateQueries({ queryKey: ['connectors'] })
      const r = await testConnector(id)
      setTestResult({ ok: r.ok, msg: r.message })
      qc.invalidateQueries({ queryKey: ['connectors'] })
    },
  })

  async function handleSync() {
    if (!connectorId) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await syncConnector(connectorId)
      setSyncResult(r)
      qc.invalidateQueries({ queryKey: ['connectors'] })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur'
      setTestResult({ ok: false, msg })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10">
            <PlugZap size={17} className="text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{def.name}</p>
            <p className="text-xs text-muted-foreground">{def.category}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {(def.type === 'entra' || def.type === 'ldap') && (
              <button
                onClick={() => setShowHelp((v) => !v)}
                title={def.type === 'entra' ? 'Guide de configuration Azure AD' : 'Guide de configuration LDAP'}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  showHelp
                    ? def.type === 'ldap'
                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <HelpCircle size={13} />
                {def.type === 'ldap' ? 'Guide LDAP' : 'Guide Azure AD'}
                {showHelp ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Guides de configuration */}
          {def.type === 'ldap'  && showHelp && <LdapHelpPanel />}
          {def.type === 'entra' && showHelp && <EntraHelpPanel />}

          {/* Nom */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Nom du connecteur</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Champs dynamiques */}
          {def.fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {f.type === 'toggle' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[f.key] === 'true'}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.checked ? 'true' : 'false' }))}
                    className="h-4 w-4 rounded border-border text-brand focus:ring-ring"
                  />
                  <span className="text-sm text-foreground">{f.placeholder ?? f.label}</span>
                </label>
              ) : (
                <input
                  type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                  value={form[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            </div>
          ))}

          {/* Intervalle de sync automatique */}
          {def.syncable && (
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
              <Clock size={13} className="shrink-0 text-muted-foreground" />
              <span className="text-xs text-muted-foreground flex-1">Sync automatique toutes les</span>
              <input
                type="number" min={1} max={168} value={intervalH}
                onChange={e => setIntervalH(e.target.value)}
                className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">h</span>
            </div>
          )}

          {/* Activer */}
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-border text-brand focus:ring-ring"
            />
            <span className="text-sm text-foreground">Connecteur actif</span>
          </label>

          {/* Feedback test */}
          {testResult && (
            <div className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm',
              testResult.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800',
            )}>
              {testResult.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
              {testResult.msg}
            </div>
          )}

          {/* Résultat sync */}
          {syncResult && <SyncResultPanel result={syncResult} />}

          {/* Historique des syncs */}
          {connectorId && def.syncable && (
            <div>
              <button
                onClick={() => setShowHistory(v => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <History size={12} />
                Historique des synchronisations
                {showHistory ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showHistory && (
                <div className="mt-2 space-y-1">
                  {history.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Aucune synchronisation enregistrée.</p>
                  ) : history.map(log => (
                    <div key={log.id} className={cn(
                      'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
                      log.status === 'ok'      ? 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800'
                      : log.status === 'error' ? 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800'
                      : 'border-amber-200 bg-amber-50 dark:bg-amber-950/20',
                    )}>
                      {log.status === 'ok'
                        ? <CheckCircle2 size={11} className="text-green-600 shrink-0" />
                        : <XCircle size={11} className="text-red-500 shrink-0" />}
                      <span className="text-muted-foreground shrink-0">
                        {new Date(log.started_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                      <span className={cn('text-[10px] rounded px-1',
                        log.triggered_by === 'auto' ? 'bg-muted' : 'bg-brand/10 text-brand'
                      )}>
                        {log.triggered_by === 'auto' ? 'auto' : 'manuel'}
                      </span>
                      <span className="flex-1 truncate text-muted-foreground">
                        {log.error
                          ? log.error.slice(0, 80)
                          : log.result
                            ? Object.entries(log.result)
                                .filter(([, v]) => typeof v === 'number')
                                .map(([k, v]) => `${SYNC_LABELS[k] ?? k} ${v}`)
                                .join(' · ')
                            : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t px-5 py-3">
          {def.syncable && connectorId && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Synchroniser
            </button>
          )}
          <button
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {testMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <TestTube2 size={12} />}
            Tester
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
            Annuler
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {saveMut.isPending && <Loader2 size={13} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Carte connecteur ──────────────────────────────────────────────────────────

function ConnectorCard({
  def, connector, onConfigure,
}: {
  def: ConnectorTypeDef
  connector?: ConnectorOut
  onConfigure: () => void
}) {
  const qc = useQueryClient()

  const deleteMut = useMutation({
    mutationFn: () => deleteConnector(connector!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connectors'] }),
  })

  const isConfigured = !!connector
  const testOk = connector?.last_test_ok

  const iconBg = !isConfigured        ? 'bg-muted'
    : testOk === true                 ? 'bg-green-100 dark:bg-green-950/40'
    : testOk === false                ? 'bg-red-100 dark:bg-red-950/40'
    : 'bg-brand/10'

  const iconColor = !isConfigured     ? 'text-muted-foreground'
    : testOk === true                 ? 'text-green-600 dark:text-green-400'
    : testOk === false                ? 'text-red-500 dark:text-red-400'
    : 'text-brand'

  const borderColor = !isConfigured   ? 'border-border'
    : testOk === true                 ? 'border-green-300/60 dark:border-green-700/40 shadow-sm'
    : testOk === false                ? 'border-red-300/60 dark:border-red-700/40 shadow-sm'
    : 'border-brand/30 shadow-sm'

  return (
    <div className={cn('rounded-xl border bg-card p-4 flex flex-col gap-3 transition-all', borderColor)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', iconBg)}>
            <PlugZap size={15} className={iconColor} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{def.name}</p>
            <p className="text-[11px] text-muted-foreground">{def.category}</p>
          </div>
        </div>

        {isConfigured && (
          <div className="flex items-center gap-1.5">
            {testOk === true  && <CheckCircle2 size={13} className="text-green-500" />}
            {testOk === false && <XCircle      size={13} className="text-red-500" />}
            {testOk === null  && <span className="h-2 w-2 rounded-full bg-slate-300" />}
            <span className={cn(
              'text-[10px] font-medium',
              connector.enabled ? 'text-green-600' : 'text-muted-foreground',
            )}>
              {connector.enabled ? 'Actif' : 'Inactif'}
            </span>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{def.description}</p>

      {connector?.last_test_at && (
        <p className="text-[10px] text-muted-foreground">
          Dernier test : {formatDateTime(connector.last_test_at)}
          {connector.last_test_message && ` — ${connector.last_test_message}`}
        </p>
      )}
      {connector?.last_sync_at && connector.last_sync_result && !('error' in connector.last_sync_result) && (
        <p className="text-[10px] text-muted-foreground">
          Dernière sync : {formatDateTime(connector.last_sync_at)}
          {' — '}
          {['created','updated','total'].filter(k => k in connector.last_sync_result!).map(k =>
            `${SYNC_LABELS[k] ?? k} ${connector.last_sync_result![k]}`
          ).join(', ')}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onConfigure}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand/10 px-3 py-2 text-xs font-medium text-brand hover:bg-brand/20 transition-colors"
        >
          <Settings2 size={12} />
          {isConfigured ? 'Modifier' : 'Configurer'}
          <ChevronRight size={11} className="ml-auto" />
        </button>

        {isConfigured && (
          <button
            onClick={() => { if (confirm('Supprimer ce connecteur ?')) deleteMut.mutate() }}
            disabled={deleteMut.isPending}
            className="rounded-md border border-border bg-card p-2 text-muted-foreground hover:text-red-600 hover:border-red-200 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConnectorsAdmin() {
  const [modal, setModal] = useState<ConnectorTypeDef | null>(null)
  const [editing, setEditing] = useState<ConnectorOut | undefined>()

  const { data: connectors = [], isLoading } = useQuery({
    queryKey: ['connectors'],
    queryFn: listConnectors,
    staleTime: 30_000,
  })

  const byType = Object.fromEntries(connectors.map((c) => [c.connector_type, c]))

  function openModal(def: ConnectorTypeDef, existing?: ConnectorOut) {
    setEditing(existing)
    setModal(def)
  }

  const categories = CATEGORY_ORDER.filter((cat) =>
    CONNECTOR_DEFS.some((d) => d.category === cat)
  )

  return (
    <div className="max-w-4xl space-y-8">
      {modal && (
        <ConnectorModal
          def={modal}
          existing={editing}
          onClose={() => { setModal(null); setEditing(undefined) }}
        />
      )}

      <div>
        <h1 className="text-xl font-semibold text-foreground">Connecteurs</h1>
        <p className="text-sm text-muted-foreground">
          Intégrations externes — configuration stockée en base, chiffrée avec la clé serveur.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        categories.map((cat) => {
          const defs = CONNECTOR_DEFS.filter((d) => d.category === cat)
          return (
            <section key={cat} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {cat}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {defs.map((def) => (
                  <ConnectorCard
                    key={def.type}
                    def={def}
                    connector={byType[def.type]}
                    onConfigure={() => openModal(def, byType[def.type])}
                  />
                ))}
              </div>
            </section>
          )
        })
      )}

      {/* Résumé */}
      {connectors.length > 0 && (
        <div className="rounded-xl border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{connectors.filter((c) => c.enabled).length}</span> connecteur{connectors.filter((c) => c.enabled).length > 1 ? 's' : ''} actif{connectors.filter((c) => c.enabled).length > 1 ? 's' : ''} sur {connectors.length} configuré{connectors.length > 1 ? 's' : ''}.
          {' '}La synchronisation automatique s'exécute toutes les 24 h via Celery Beat.
        </div>
      )}
    </div>
  )
}
