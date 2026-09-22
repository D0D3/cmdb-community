import { useQuery } from '@tanstack/react-query'
import {
  Activity, Database, Cpu, Radio, Bot, PlugZap,
  CheckCircle2, XCircle, AlertCircle, Clock, RefreshCw,
} from 'lucide-react'
import { client } from '@/api/client'
import Spinner from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceStatus { status: 'ok' | 'error' | 'unknown'; detail?: string }
interface AgentStatus {
  id: string; name: string; description: string | null
  status: 'active' | 'inactive' | 'never' | 'revoked'
  last_seen_at: string | null; last_seen_hostname: string | null; revoked: boolean
}
interface ConnectorStatus {
  id: string; name: string; connector_type: string; enabled: boolean
  sync_status: 'ok' | 'stale' | 'never' | 'disabled'
  last_sync_at: string | null; last_sync_result: Record<string, unknown> | null
}
interface OpsData {
  checked_at: string
  services: Record<string, ServiceStatus>
  agents: AgentStatus[]
  connectors: ConnectorStatus[]
}

async function fetchOps(): Promise<OpsData> {
  const r = await client.get<OpsData>('/ops/status')
  return r.data
}

// ── Indicateur générique ───────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'ok' || status === 'active'   ? 'bg-green-500' :
    status === 'error' || status === 'inactive' || status === 'stale' ? 'bg-amber-500' :
    status === 'revoked' || status === 'disabled' ? 'bg-slate-300' :
    'bg-slate-400'
  return <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', cls)} />
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'ok' || status === 'active')
    return <CheckCircle2 size={16} className="text-green-500" />
  if (status === 'error' || status === 'stale' || status === 'inactive')
    return <AlertCircle size={16} className="text-amber-500" />
  if (status === 'disabled' || status === 'revoked')
    return <XCircle size={16} className="text-slate-400" />
  return <Clock size={16} className="text-slate-400" />
}

function statusLabel(s: string) {
  return ({
    ok: 'Opérationnel', error: 'Erreur', unknown: 'Inconnu',
    active: 'Actif', inactive: 'Inactif', never: 'Jamais vu', revoked: 'Révoqué',
    stale: 'Obsolète', disabled: 'Désactivé', never_synced: 'Jamais synchronisé',
  })[s] ?? s
}

function relativeTime(iso: string | null) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2)  return 'à l\'instant'
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}

// ── Section Services ──────────────────────────────────────────────────────────

const SERVICE_META: Record<string, { label: string; icon: React.ElementType }> = {
  database: { label: 'Base de données', icon: Database },
  redis:    { label: 'Redis (broker)',   icon: Cpu },
  celery:   { label: 'Worker Celery',   icon: Radio },
}

function ServicesSection({ services }: { services: Record<string, ServiceStatus> }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
        <Activity size={15} className="text-brand" />
        <span className="text-sm font-semibold text-foreground">Services</span>
      </div>
      <div className="divide-y">
        {Object.entries(SERVICE_META).map(([key, meta]) => {
          const svc = services[key] ?? { status: 'unknown' }
          const Icon = meta.icon
          return (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Icon size={15} className="text-muted-foreground" />
                <span className="text-sm text-foreground">{meta.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusIcon status={svc.status} />
                <span className={cn(
                  'text-xs font-medium',
                  svc.status === 'ok' ? 'text-green-600' :
                  svc.status === 'error' ? 'text-red-600' : 'text-muted-foreground',
                )}>
                  {statusLabel(svc.status)}
                </span>
                {svc.detail && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{svc.detail}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Section Agents ────────────────────────────────────────────────────────────

function AgentsSection({ agents }: { agents: AgentStatus[] }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot size={15} className="text-brand" />
          <span className="text-sm font-semibold text-foreground">Agents</span>
        </div>
        <span className="text-xs text-muted-foreground">{agents.filter(a => a.status === 'active').length} actif(s) / {agents.length}</span>
      </div>
      {agents.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun token agent créé</div>
      ) : (
        <div className="divide-y">
          {agents.map(a => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <StatusDot status={a.status} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
                  {a.last_seen_hostname && (
                    <p className="text-xs text-muted-foreground truncate">{a.last_seen_hostname}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <span className={cn(
                  'text-xs font-medium',
                  a.status === 'active'   ? 'text-green-600' :
                  a.status === 'inactive' ? 'text-amber-600' :
                  a.status === 'revoked'  ? 'text-slate-400' : 'text-muted-foreground',
                )}>
                  {statusLabel(a.status)}
                </span>
                {a.last_seen_at && (
                  <span className="text-xs text-muted-foreground">{relativeTime(a.last_seen_at)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section Connecteurs ───────────────────────────────────────────────────────

function ConnectorsSection({ connectors }: { connectors: ConnectorStatus[] }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PlugZap size={15} className="text-brand" />
          <span className="text-sm font-semibold text-foreground">Connecteurs</span>
        </div>
        <span className="text-xs text-muted-foreground">{connectors.filter(c => c.enabled).length} actif(s) / {connectors.length}</span>
      </div>
      {connectors.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun connecteur configuré</div>
      ) : (
        <div className="divide-y">
          {connectors.map(c => {
            const syncResult = c.last_sync_result
            const summary = syncResult
              ? Object.entries(syncResult).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}: ${v}`).join(' · ')
              : null
            return (
              <div key={c.id} className="flex items-start justify-between px-4 py-3 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <StatusDot status={c.sync_status} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.connector_type}</p>
                    {summary && <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{summary}</p>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className={cn(
                    'text-xs font-medium',
                    c.sync_status === 'ok'       ? 'text-green-600' :
                    c.sync_status === 'stale'    ? 'text-amber-600' :
                    c.sync_status === 'disabled' ? 'text-slate-400' : 'text-muted-foreground',
                  )}>
                    {statusLabel(c.sync_status)}
                  </span>
                  {c.last_sync_at && (
                    <span className="text-xs text-muted-foreground">{relativeTime(c.last_sync_at)}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function OpsStatus() {
  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['ops-status'],
    queryFn: fetchOps,
    refetchInterval: 60_000,
  })

  const allServicesOk = data
    ? Object.values(data.services).every(s => s.status === 'ok' || s.status === 'unknown')
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Activity size={20} className="text-brand" />
            État opérationnel
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Services, agents et connecteurs — actualisation toutes les 60 s.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground">
              Mis à jour {relativeTime(new Date(dataUpdatedAt).toISOString())}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Bandeau global */}
      {!isLoading && data && (
        <div className={cn(
          'flex items-center gap-3 rounded-xl border px-4 py-3',
          allServicesOk ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900' :
                          'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900',
        )}>
          {allServicesOk
            ? <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            : <AlertCircle size={18} className="text-amber-600 shrink-0" />}
          <div>
            <p className={cn('text-sm font-semibold', allServicesOk ? 'text-green-800 dark:text-green-200' : 'text-amber-800 dark:text-amber-200')}>
              {allServicesOk ? 'Tous les services sont opérationnels' : 'Un ou plusieurs services nécessitent votre attention'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.agents.filter(a => a.status === 'active').length} agent(s) actif(s) ·{' '}
              {data.connectors.filter(c => c.sync_status === 'ok').length} connecteur(s) synchronisé(s)
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ServicesSection services={data.services} />
          <AgentsSection agents={data.agents} />
          <ConnectorsSection connectors={data.connectors} />
        </div>
      ) : null}
    </div>
  )
}
