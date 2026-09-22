import { useState, type ElementType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock, Server, Package, ShieldCheck, Download, AlertTriangle, ListFilter } from 'lucide-react'
import { listExpiring, expiringCsvUrl, type ExpiringItem } from '@/api/expiring'
import { listDeadlines, deadlinesCsvUrl } from '@/api/alerts'
import type { Deadline } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { cn, formatDate } from '@/lib/utils'

// ── Constantes communes ───────────────────────────────────────────────────────

const EXPIRY_LABEL: Record<string, string> = {
  warranty: 'Fin de garantie',
  leasing:  'Fin de leasing',
  license:  'Fin de licence',
  eol:      'EOL éditeur',
}

const EXPIRY_COLOR: Record<string, string> = {
  warranty: 'text-purple-600 bg-purple-50 border-purple-200',
  leasing:  'text-blue-600 bg-blue-50 border-blue-200',
  license:  'text-amber-600 bg-amber-50 border-amber-200',
  eol:      'text-red-600 bg-red-50 border-red-200',
}

const DEADLINE_TYPE_LABELS: Record<string, string> = {
  warranty_expiry: 'Fin de garantie',
  license_expiry:  'Fin de licence',
  eol:             'EOL éditeur',
  sla_expiry:      'Contrat SLA',
  maintenance_due: 'Maintenance',
}

const SEV_VARIANT: Record<string, 'danger' | 'warning' | 'info'> = {
  critical: 'danger',
  warning:  'warning',
  info:     'info',
}

const SELECT = 'rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

// ── Helpers ───────────────────────────────────────────────────────────────────

function urgencyClass(days: number): string {
  if (days < 0)  return 'text-red-700 bg-red-100 border-red-300 font-bold'
  if (days < 30) return 'text-red-600 bg-red-50 border-red-200 font-semibold'
  if (days < 60) return 'text-orange-600 bg-orange-50 border-orange-200 font-medium'
  return                 'text-amber-600 bg-amber-50 border-amber-200'
}

function DaysChip({ days }: { days: number }) {
  const label = days < 0 ? `Expiré (${Math.abs(days)}j)` : days === 0 ? "Aujourd'hui" : `J-${days}`
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs', urgencyClass(days))}>
      {label}
    </span>
  )
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={cn('rounded-xl border p-4 text-center', color)}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-xs mt-1 opacity-80">{label}</p>
    </div>
  )
}

// ── Onglet 1 — Vue par CI (warranty/leasing/license/EOL) ─────────────────────

function TabCI() {
  const [horizon,        setHorizon]        = useState(90)
  const [ciType,         setCiType]         = useState('')
  const [includeExpired, setIncludeExpired] = useState(true)

  const { data, isLoading } = useQuery({
    queryKey: ['expiring', horizon, ciType, includeExpired],
    queryFn:  () => listExpiring({ horizon, ci_type: ciType || undefined, include_expired: includeExpired }),
    staleTime: 60_000,
  })

  const items    = data?.items ?? []
  const expired  = items.filter(i => i.days_remaining < 0).length
  const urgent   = items.filter(i => i.days_remaining >= 0 && i.days_remaining < 30).length
  const warning  = items.filter(i => i.days_remaining >= 30 && i.days_remaining < 60).length
  const upcoming = items.filter(i => i.days_remaining >= 60).length

  return (
    <div className="space-y-5">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={expiringCsvUrl({ horizon, ci_type: ciType || undefined, include_expired: includeExpired })}
          download="fin_de_vie.csv"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
        >
          <Download size={14} /> CSV
        </a>
        <select className={SELECT} value={horizon} onChange={e => setHorizon(+e.target.value)}>
          <option value={30}>30 jours</option>
          <option value={60}>60 jours</option>
          <option value={90}>90 jours</option>
          <option value={180}>6 mois</option>
          <option value={365}>1 an</option>
        </select>
        <select className={SELECT} value={ciType} onChange={e => setCiType(e.target.value)}>
          <option value="">Tous les types</option>
          <option value="hardware">Matériel</option>
          <option value="software">Logiciels</option>
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={includeExpired} onChange={e => setIncludeExpired(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand focus:ring-ring" />
          Inclure expirés
        </label>
      </div>

      {/* KPIs */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Expirés"             value={expired}  color="border-red-300 bg-red-50 text-red-700" />
          <KpiCard label="Critiques (< 30j)"   value={urgent}   color="border-orange-300 bg-orange-50 text-orange-700" />
          <KpiCard label="Attention (30–60j)"  value={warning}  color="border-amber-300 bg-amber-50 text-amber-700" />
          <KpiCard label={`À venir (60–${horizon}j)`} value={upcoming} color="border-border bg-card text-foreground" />
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 gap-3 text-center">
          <ShieldCheck size={36} className="text-green-500/60" />
          <p className="text-sm font-medium text-muted-foreground">Aucune échéance à venir</p>
          <p className="text-xs text-muted-foreground/60">dans les {horizon} prochains jours</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {['CI', 'Type', 'Équipe', 'Échéance', 'Date', 'Délai'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item: ExpiringItem, i) => {
                const Icon = item.ci_type === 'hardware' ? Server : Package
                return (
                  <tr key={`${item.ci_id}-${item.expiry_type}`}
                    className={cn('border-b last:border-0 transition-colors hover:bg-muted/30', i % 2 !== 0 && 'bg-muted/10')}>
                    <td className="px-4 py-3">
                      <Link to={`/ci/${item.ci_id}`}
                        className="flex items-center gap-2 font-medium text-foreground hover:text-brand transition-colors">
                        <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded',
                          item.ci_type === 'hardware' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}>
                          <Icon size={11} />
                        </div>
                        <span className="truncate max-w-[220px]">{item.ci_name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {item.ci_type === 'hardware' ? 'Matériel' : 'Logiciel'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{item.team ?? <span className="opacity-40">—</span>}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium', EXPIRY_COLOR[item.expiry_type])}>
                        {EXPIRY_LABEL[item.expiry_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(item.expiry_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3"><DaysChip days={item.days_remaining} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
            {data?.total} échéance{(data?.total ?? 0) > 1 ? 's' : ''} trouvée{(data?.total ?? 0) > 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Onglet 2 — Vue par priorité (moteur d'alertes, inclut SLA + maintenance) ─

function TabPriority() {
  const navigate = useNavigate()
  const [daysAhead,      setDaysAhead]      = useState(90)
  const [includeExpired, setIncludeExpired] = useState(true)
  const [typeFilter,     setTypeFilter]     = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['deadlines', { daysAhead, includeExpired }],
    queryFn:  () => listDeadlines({ days_ahead: daysAhead, include_expired: includeExpired }),
    staleTime: 60_000,
  })

  const items  = (data?.items ?? []).filter(d => !typeFilter || d.deadline_type === typeFilter)
  const csvUrl = deadlinesCsvUrl({ days_ahead: daysAhead, include_expired: includeExpired })

  return (
    <div className="space-y-5">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <a href={csvUrl} download="echeances-priorite.csv"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors">
          <Download size={14} /> CSV
        </a>
        <select className={SELECT} value={daysAhead} onChange={e => setDaysAhead(+e.target.value)}>
          <option value={30}>30 jours</option>
          <option value={60}>60 jours</option>
          <option value={90}>90 jours</option>
          <option value={180}>6 mois</option>
          <option value={365}>1 an</option>
        </select>
        <select className={SELECT} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">Tous types</option>
          {Object.entries(DEADLINE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={includeExpired} onChange={e => setIncludeExpired(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand focus:ring-ring" />
          Inclure expirés
        </label>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !items.length ? (
          <div className="py-14 text-center">
            <Clock size={28} className="mx-auto text-muted-foreground/50 mb-2" />
            <p className="font-medium text-foreground">Aucune échéance dans cette période</p>
            <p className="text-sm text-muted-foreground mt-1">Élargissez la fenêtre ou ajoutez des dates aux CIs.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {['CI / Contrat', 'Type', 'Date', 'Délai', 'Sévérité'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item: Deadline, i) => (
                <tr key={`${item.ci_id}-${item.deadline_type}-${item.deadline_date}-${i}`}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    {item.ci_id ? (
                      <button onClick={() => navigate(`/ci/${item.ci_id}`)}
                        className="font-medium text-brand hover:underline text-left">
                        {item.ci_name}
                      </button>
                    ) : (
                      <span className="font-medium">{item.ci_name}</span>
                    )}
                    {item.ci_type && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({item.ci_type === 'hardware' ? 'Matériel' : 'Logiciel'})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3"><Badge variant="muted">{item.deadline_label}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(item.deadline_date)}</td>
                  <td className="px-4 py-3"><DaysChip days={item.days_remaining} /></td>
                  <td className="px-4 py-3">
                    <Badge variant={SEV_VARIANT[item.severity]}>
                      {item.severity === 'critical' ? 'Critique' : item.severity === 'warning' ? 'Attention' : 'Info'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

type Tab = 'ci' | 'priority'

const TABS: { id: Tab; label: string; icon: ElementType; description: string }[] = [
  { id: 'ci',       label: 'Vue par CI',       icon: AlertTriangle, description: 'Garanties, leasings, licences et EOL par équipement' },
  { id: 'priority', label: 'Vue par priorité', icon: ListFilter,    description: 'Toutes les échéances triées par sévérité (inclut SLA et maintenances)' },
]

export default function Expiring() {
  const [activeTab, setActiveTab] = useState<Tab>('ci')
  const active = TABS.find(t => t.id === activeTab)!

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Clock size={20} className="text-brand" />
          Fin de vie & Échéances
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{active.description}</p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Contenu */}
      {activeTab === 'ci'       && <TabCI />}
      {activeTab === 'priority' && <TabPriority />}
    </div>
  )
}
