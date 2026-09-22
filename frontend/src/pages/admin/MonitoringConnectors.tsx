import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Activity, Plus, Pencil, Trash2, X, Check, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, Copy, ShieldAlert, Clock, Wifi,
} from 'lucide-react'
import {
  listMonitoringConnectors, createMonitoringConnector,
  updateMonitoringConnector, deleteMonitoringConnector,
  toggleMonitoringConnector, listMonitoringAlerts,
} from '@/api/monitoring'
import type { MonitoringConnector, MonitoringAlert } from '@/types/api'
import type { ConnectorIn } from '@/api/monitoring'
import Spinner from '@/components/ui/Spinner'
import { cn, formatDateTime } from '@/lib/utils'

// ── Constantes ────────────────────────────────────────────────────────────────

const CONNECTOR_TYPES = [
  { value: 'zabbix',       label: 'Zabbix',                color: 'bg-red-100 text-red-700' },
  { value: 'alertmanager', label: 'Prometheus/Alertmanager',color: 'bg-orange-100 text-orange-700' },
  { value: 'grafana',      label: 'Grafana Alerting',       color: 'bg-orange-100 text-orange-600' },
  { value: 'prtg',         label: 'PRTG',                  color: 'bg-green-100 text-green-700' },
  { value: 'snmp',         label: 'SNMP Trap',             color: 'bg-blue-100 text-blue-700' },
  { value: 'kuma',         label: 'Uptime Kuma',           color: 'bg-emerald-100 text-emerald-700' },
  { value: 'generic',      label: 'Générique (JSON)',       color: 'bg-slate-100 text-slate-600' },
]

const SEVERITIES = [
  { value: 'info',     label: 'Info' },
  { value: 'low',      label: 'Faible' },
  { value: 'medium',   label: 'Moyen' },
  { value: 'high',     label: 'Élevé' },
  { value: 'critical', label: 'Critique' },
]

const SEV_BADGE: Record<string, string> = {
  info:     'bg-slate-100 text-slate-600',
  low:      'bg-blue-100 text-blue-700',
  medium:   'bg-amber-100 text-amber-700',
  high:     'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const BLANK: ConnectorIn = {
  name: '', connector_type: 'zabbix', enabled: true,
  description: null,
  snmp_version: 'v2c', snmp_port: 162, snmp_community: 'public',
  snmp_v3_user: null, snmp_v3_auth_proto: null, snmp_v3_auth_key: null,
  snmp_v3_priv_proto: null, snmp_v3_priv_key: null,
  auto_create_incident: true, min_severity: 'high',
}

// ── Setup guides par outil ────────────────────────────────────────────────────

function SetupGuide({ type, ingestUrl }: { type: string; ingestUrl: string }) {
  // Anonymise le domaine dans les guides — l'URL réelle est déjà copiable depuis la carte connecteur
  const path = ingestUrl.replace(/^https?:\/\/[^/]+/, '')
  const maskedUrl = `https://[votre-cmdb]${path}`
  const snmpUrl = maskedUrl + '/snmp'
  const guides: Record<string, React.ReactNode> = {
    zabbix: (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Configuration Zabbix</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Administration → Types de médias → Créer un type de média</li>
          <li>Type : <strong>Webhook</strong>, URL : <code className="bg-muted px-1 rounded">{maskedUrl}</code></li>
          <li>Paramètres (champs à envoyer) : <code>subject</code>, <code>message</code>, <code>severity</code>, <code>host</code>, <code>status</code>, <code>event_id</code></li>
          <li>Lier le média à un utilisateur et créer une action d'alerte</li>
        </ol>
        <p className="text-[11px] text-muted-foreground/70">Valeurs Zabbix pour <code>severity</code> : Disaster, High, Average, Warning, Information</p>
      </div>
    ),
    alertmanager: (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Configuration Alertmanager</p>
        <pre className="bg-muted rounded p-2 text-[10px] overflow-x-auto">{`receivers:
  - name: cmdb
    webhook_configs:
      - url: '${maskedUrl}'
        send_resolved: true`}</pre>
        <p>Les labels <code>severity</code>, <code>instance</code> et <code>alertname</code> sont reconnus automatiquement.</p>
      </div>
    ),
    grafana: (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Configuration Grafana Alerting</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Alerting → Contact points → New contact point</li>
          <li>Type : <strong>Webhook</strong>, URL : <code className="bg-muted px-1 rounded">{maskedUrl}</code></li>
          <li>Ajouter le label <code>severity</code> dans les règles d'alerte (critical/high/medium/low)</li>
          <li>Lier le contact point à une notification policy</li>
        </ol>
      </div>
    ),
    prtg: (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Configuration PRTG</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Setup → Notifications → Add notification</li>
          <li>Type : <strong>Execute HTTP Action</strong></li>
          <li>URL : <code className="bg-muted px-1 rounded">{maskedUrl}</code>, Method : POST</li>
          <li>Body (JSON) : <code className="bg-muted px-1 rounded text-[10px]">{"\"device\":\"%device\",\"name\":\"%name\",\"status\":\"%status\",\"priority\":\"%priority\",\"message\":\"%message\""}</code></li>
        </ol>
      </div>
    ),
    snmp: (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Configuration SNMP trap forwarding</p>
        <p>Les équipements réseau envoient leurs traps SNMP vers <strong>snmptrapd</strong>, qui les transfère à la CMDB via un script :</p>
        <pre className="bg-muted rounded p-2 text-[10px] overflow-x-auto">{`# /etc/snmp/snmptrapd.conf
authCommunity log,execute,net public
traphandle default /usr/local/bin/cmdb-trap-forward.sh

# cmdb-trap-forward.sh
#!/bin/bash
AGENT=$1; OID=$(grep 'enterprises' | head -1)
curl -s -X POST '${snmpUrl}' \\
  -H 'Content-Type: application/json' \\
  -d "{\\"agent\\":\\"$AGENT\\",\\"oid\\":\\"$OID\\",\\"severity\\":\\"medium\\"}"`}</pre>
        <p className="text-[11px]">Version SNMP et crédentiels configurés ci-dessous sont documentatifs — snmptrapd gère l'authentification côté réseau.</p>
      </div>
    ),
    kuma: (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Configuration Uptime Kuma</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Settings → Notifications → Add notification</li>
          <li>Type : <strong>Webhook</strong></li>
          <li>URL : <code className="bg-muted px-1 rounded">{maskedUrl}</code></li>
          <li>Post Content Type : <strong>application/json</strong></li>
          <li>Activer <strong>Send on resolved</strong> pour les remises en service</li>
        </ol>
        <p>Le champ <code>monitor.hostname</code> (ou l'hôte extrait de l'URL surveillée) sert à l'association automatique avec un CI. Nommez vos moniteurs avec le nom exact du CI pour une liaison immédiate.</p>
        <p className="text-[11px] text-muted-foreground/70">Statut DOWN → alerte <em>high</em> · UP → résolution automatique de l'alerte existante.</p>
      </div>
    ),
    generic: (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Format JSON générique</p>
        <pre className="bg-muted rounded p-2 text-[10px] overflow-x-auto">{`POST ${maskedUrl}
Content-Type: application/json

{
  "title": "CPU élevé sur srv01",
  "severity": "high",        // info|low|medium|high|critical
  "status": "firing",        // firing|resolved
  "host": "srv01",           // pour liaison CI automatique
  "message": "CPU > 90%",
  "id": "alert-unique-id"    // pour dédoublonnage
}`}</pre>
      </div>
    ),
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-3 mt-3">
      {guides[type] ?? <p className="text-xs text-muted-foreground">Aucun guide disponible pour ce type.</p>}
    </div>
  )
}

// ── Modal connecteur ──────────────────────────────────────────────────────────

function ConnectorModal({
  initial, onClose, onSave, saving,
}: {
  initial: ConnectorIn
  onClose: () => void
  onSave: (d: ConnectorIn) => void
  saving: boolean
}) {
  const [form, setForm] = useState<ConnectorIn>(initial)
  const [showGuide, setShowGuide] = useState(false)
  const set = (k: keyof ConnectorIn, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const isSnmp = form.connector_type === 'snmp'
  const isV3   = form.snmp_version === 'v3'

  // URL d'ingestion provisoire (avant création)
  const ingestUrl = `${window.location.origin}/api/monitoring/ingest/[clé-générée]`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-xl bg-card border shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h3 className="font-semibold text-base">
            {initial.name ? 'Modifier le connecteur' : 'Nouveau connecteur monitoring'}
          </h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          {/* Nom + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nom *</label>
              <input
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Zabbix Production"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type *</label>
              <select
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.connector_type}
                onChange={e => set('connector_type', e.target.value)}
              >
                {CONNECTOR_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description</label>
            <input
              className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.description ?? ''}
              onChange={e => set('description', e.target.value || null)}
              placeholder="Surveillance infra datacenter…"
            />
          </div>

          {/* Config SNMP */}
          {isSnmp && (
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Wifi size={12} /> Configuration SNMP
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Version</label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={form.snmp_version}
                    onChange={e => set('snmp_version', e.target.value)}
                  >
                    <option value="v1">v1</option>
                    <option value="v2c">v2c (recommandé)</option>
                    <option value="v3">v3 (sécurisé)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Port UDP</label>
                  <input
                    type="number" min={1} max={65535}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={form.snmp_port}
                    onChange={e => set('snmp_port', parseInt(e.target.value) || 162)}
                  />
                </div>
                {!isV3 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Community</label>
                    <input
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={form.snmp_community ?? ''}
                      onChange={e => set('snmp_community', e.target.value || null)}
                      placeholder="public"
                    />
                  </div>
                )}
              </div>
              {isV3 && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Utilisateur v3</label>
                    <input
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={form.snmp_v3_user ?? ''}
                      onChange={e => set('snmp_v3_user', e.target.value || null)}
                      placeholder="snmpuser"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Auth proto</label>
                      <select
                        className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={form.snmp_v3_auth_proto ?? ''}
                        onChange={e => set('snmp_v3_auth_proto', e.target.value || null)}
                      >
                        <option value="">Aucun</option>
                        <option value="MD5">MD5</option>
                        <option value="SHA">SHA (recommandé)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Auth passphrase</label>
                      <input
                        type="password"
                        className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={form.snmp_v3_auth_key ?? ''}
                        onChange={e => set('snmp_v3_auth_key', e.target.value || null)}
                        placeholder="••••••••"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Priv proto</label>
                      <select
                        className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={form.snmp_v3_priv_proto ?? ''}
                        onChange={e => set('snmp_v3_priv_proto', e.target.value || null)}
                      >
                        <option value="">Aucun</option>
                        <option value="DES">DES</option>
                        <option value="AES">AES (recommandé)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Priv passphrase</label>
                      <input
                        type="password"
                        className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={form.snmp_v3_priv_key ?? ''}
                        onChange={e => set('snmp_v3_priv_key', e.target.value || null)}
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Traitement incidents */}
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <ShieldAlert size={12} /> Création automatique d'incidents
            </p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded"
                checked={form.auto_create_incident}
                onChange={e => set('auto_create_incident', e.target.checked)}
              />
              <span className="text-sm">Créer un incident automatiquement pour les alertes critiques</span>
            </label>
            {form.auto_create_incident && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Sévérité minimale déclenchant un incident</label>
                <select
                  className="w-48 h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={form.min_severity}
                  onChange={e => set('min_severity', e.target.value)}
                >
                  {SEVERITIES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Guide de configuration */}
          <button
            onClick={() => setShowGuide(v => !v)}
            className="flex items-center gap-1.5 text-xs text-brand hover:underline"
          >
            {showGuide ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Guide de configuration {CONNECTOR_TYPES.find(t => t.value === form.connector_type)?.label}
          </button>
          {showGuide && <SetupGuide type={form.connector_type} ingestUrl={ingestUrl} />}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t">
          <button onClick={onClose} className="px-4 py-2 rounded-md border text-sm text-muted-foreground hover:bg-muted">
            Annuler
          </button>
          <button
            disabled={!form.name.trim() || saving}
            onClick={() => onSave(form)}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-brand-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Spinner size="sm" /> : <Check size={14} />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Panneau alertes ───────────────────────────────────────────────────────────

function AlertsPanel({ connectorId }: { connectorId: string | null }) {
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['monitoring-alerts', connectorId],
    queryFn: () => listMonitoringAlerts({ connector_id: connectorId ?? undefined, limit: 50 }),
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="flex justify-center py-6"><Spinner /></div>
  if (!alerts.length) return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
      <Activity size={24} className="text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">Aucune alerte reçue.</p>
    </div>
  )

  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Titre</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Source</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Sévérité</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Statut</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Reçu le</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a, i) => (
            <tr key={a.id} className={cn('border-b last:border-0', i % 2 === 0 ? '' : 'bg-muted/20')}>
              <td className="px-3 py-2 max-w-[250px] truncate font-medium" title={a.title}>{a.title}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{a.host_hint ?? a.connector_name}</td>
              <td className="px-3 py-2">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SEV_BADGE[a.severity] ?? 'bg-slate-100 text-slate-600')}>
                  {a.severity}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                  a.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                  {a.status === 'resolved' ? 'Résolu' : 'Actif'}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                {formatDateTime(a.received_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function MonitoringConnectorsAdmin() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; editing: MonitoringConnector | null }>({ open: false, editing: null })
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const { data: connectors = [], isLoading } = useQuery({
    queryKey: ['monitoring-connectors'],
    queryFn: listMonitoringConnectors,
  })

  const saveMut = useMutation({
    mutationFn: (d: ConnectorIn) =>
      modal.editing ? updateMonitoringConnector(modal.editing.id, d) : createMonitoringConnector(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['monitoring-connectors'] }); setModal({ open: false, editing: null }) },
  })

  const toggleMut = useMutation({
    mutationFn: toggleMonitoringConnector,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monitoring-connectors'] }),
  })

  const delMut = useMutation({
    mutationFn: deleteMonitoringConnector,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['monitoring-connectors'] }); setDeleting(null) },
  })

  function copyUrl(key: string) {
    const url = `${window.location.origin}/api/monitoring/ingest/${key}`
    navigator.clipboard.writeText(url)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const getIngestUrl = (c: MonitoringConnector) =>
    `${window.location.origin}/api/monitoring/ingest/${c.ingest_key}${c.connector_type === 'snmp' ? '/snmp' : ''}`

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Activity size={20} className="text-brand" />
            Connecteurs de monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recevez des alertes de Zabbix, Alertmanager, Grafana, PRTG, Uptime Kuma ou via SNMP. Création d'incidents automatique.
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, editing: null })}
          className="flex items-center gap-2 rounded-md bg-brand text-brand-foreground px-3 py-2 text-sm font-medium hover:opacity-90 shrink-0"
        >
          <Plus size={14} />
          Nouveau connecteur
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : connectors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed gap-3 text-center">
          <Activity size={32} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Aucun connecteur configuré.</p>
          <button onClick={() => setModal({ open: true, editing: null })} className="text-sm text-brand hover:underline">
            Créer le premier connecteur
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {connectors.map(c => {
            const typeInfo = CONNECTOR_TYPES.find(t => t.value === c.connector_type)
            const url = getIngestUrl(c)
            const isSelected = selectedId === c.id

            return (
              <div key={c.id} className="rounded-xl border bg-card overflow-hidden">
                {/* En-tête connecteur */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggleMut.mutate(c.id)}
                    className={cn('shrink-0 transition-colors', c.enabled ? 'text-brand' : 'text-muted-foreground/40')}
                    title={c.enabled ? 'Désactiver' : 'Activer'}
                  >
                    {c.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{c.name}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', typeInfo?.color ?? 'bg-slate-100 text-slate-600')}>
                        {typeInfo?.label ?? c.connector_type}
                      </span>
                      {!c.enabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Désactivé</span>
                      )}
                    </div>
                    {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}

                    {/* URL d'ingestion */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <code className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground truncate max-w-[420px]">
                        {url}
                      </code>
                      <button
                        onClick={() => copyUrl(c.ingest_key)}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                        title="Copier l'URL"
                      >
                        {copied === c.ingest_key ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-medium">{c.alert_count} alerte{c.alert_count !== 1 ? 's' : ''}</p>
                      {c.last_alert_at && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                          <Clock size={9} />
                          {formatDateTime(c.last_alert_at)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedId(isSelected ? null : c.id)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border hover:bg-muted"
                    >
                      {isSelected ? 'Masquer' : 'Alertes'}
                    </button>
                    <button
                      onClick={() => setModal({ open: true, editing: c })}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <Pencil size={13} />
                    </button>
                    {deleting === c.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => delMut.mutate(c.id)} disabled={delMut.isPending}
                          className="text-xs px-2 py-1 rounded bg-destructive text-white">
                          {delMut.isPending ? '…' : 'Confirmer'}
                        </button>
                        <button onClick={() => setDeleting(null)} className="text-xs px-2 py-1 rounded border hover:bg-muted">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleting(c.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Panel alertes dépliable */}
                {isSelected && (
                  <div className="border-t px-4 pb-4 pt-3">
                    <AlertsPanel connectorId={c.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modal.open && (
        <ConnectorModal
          initial={modal.editing
            ? {
                name: modal.editing.name,
                connector_type: modal.editing.connector_type,
                enabled: modal.editing.enabled,
                description: modal.editing.description ?? null,
                snmp_version: modal.editing.snmp_version,
                snmp_port: modal.editing.snmp_port,
                snmp_community: modal.editing.snmp_community ?? null,
                snmp_v3_user: modal.editing.snmp_v3_user ?? null,
                snmp_v3_auth_proto: modal.editing.snmp_v3_auth_proto ?? null,
                snmp_v3_auth_key: null,
                snmp_v3_priv_proto: modal.editing.snmp_v3_priv_proto ?? null,
                snmp_v3_priv_key: null,
                auto_create_incident: modal.editing.auto_create_incident,
                min_severity: modal.editing.min_severity,
              }
            : BLANK
          }
          onClose={() => setModal({ open: false, editing: null })}
          onSave={d => saveMut.mutate(d)}
          saving={saveMut.isPending}
        />
      )}
    </div>
  )
}
