import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  Server, Package, Activity, CheckCircle2,
  AlertTriangle, AlertCircle, Info,
  ShieldAlert, Flame, CalendarClock, KeyRound,
  ClipboardList, Clock, PlayCircle, Siren,
  HeartPulse, TrendingUp, ChevronDown,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { getHardwareStats, getSoftwareStats, getCiTrend, getKpiSummary } from '@/api/stats'
import type { KpiSummary, RiskyCi } from '@/api/stats'
import { getAlertStats, getRecentAlerts, listDeadlines } from '@/api/alerts'
import { listExpiring } from '@/api/expiring'
import type { ExpiringItem } from '@/api/expiring'
import { getCveStats } from '@/api/cve'
import { getChangeStats, listChanges } from '@/api/changes'
import { getIncidentStats } from '@/api/incidents'
import type { AlertSeverity, Deadline, ChangeStatus, ChangeType } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { formatDate, formatDateTime, cn } from '@/lib/utils'

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, colorCls, to, danger,
}: {
  label: string
  value: number | string
  sub?: string
  icon: React.ElementType
  colorCls: string
  to?: string
  danger?: boolean
}) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={to ? () => navigate(to) : undefined}
      disabled={!to}
      className={cn(
        'flex items-center gap-4 rounded-xl border bg-card px-5 py-4 text-left transition-all w-full',
        to ? 'cursor-pointer hover:shadow-md hover:border-brand/30' : 'cursor-default',
        danger && (value as number) > 0 ? 'border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20' : '',
      )}
    >
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', colorCls)}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <p className={cn('text-2xl font-bold leading-none mt-0.5', danger && (value as number) > 0 ? 'text-red-700 dark:text-red-400' : 'text-foreground')}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </button>
  )
}

// ── Helpers alertes ────────────────────────────────────────────────────────────

const SEV_ICON: Record<AlertSeverity, React.ElementType> = {
  critical: AlertTriangle, warning: AlertCircle, info: Info,
}
const SEV_VARIANT: Record<AlertSeverity, 'danger' | 'warning' | 'info'> = {
  critical: 'danger', warning: 'warning', info: 'info',
}
const SEV_LABELS: Record<AlertSeverity, string> = {
  critical: 'Critique', warning: 'Attention', info: 'Info',
}

// ── Helpers changements ───────────────────────────────────────────────────────

const CHANGE_STATUS_LABEL: Partial<Record<ChangeStatus, string>> = {
  pending_approval: 'En attente',
  approved:         'Approuvée',
  in_progress:      'En cours',
}
const CHANGE_STATUS_VARIANT: Partial<Record<ChangeStatus, 'warning' | 'info' | 'success'>> = {
  pending_approval: 'warning',
  approved:         'info',
  in_progress:      'info',
}
const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  normal: 'Normal', standard: 'Standard', emergency: 'Urgent',
}
const CHANGE_TYPE_VARIANT: Record<ChangeType, 'default' | 'info' | 'danger'> = {
  normal: 'default', standard: 'info', emergency: 'danger',
}

// ── Helpers échéances ─────────────────────────────────────────────────────────

const DEADLINE_ICONS: Record<string, React.ElementType> = {
  warranty:    Server,
  license:     KeyRound,
  eol:         Flame,
  maintenance: CalendarClock,
}
const DEADLINE_SEV: Record<string, 'danger' | 'warning' | 'info'> = {
  critical: 'danger', warning: 'warning', info: 'info',
}

// ── Score de santé ─────────────────────────────────────────────────────────────

const HEALTH_COLORS: Record<string, { ring: string; bg: string; text: string; badge: string }> = {
  green: {
    ring: 'stroke-green-500',
    bg:   'bg-green-50 dark:bg-green-950/20',
    text: 'text-green-700 dark:text-green-400',
    badge:'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  },
  amber: {
    ring: 'stroke-amber-500',
    bg:   'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-700 dark:text-amber-400',
    badge:'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  },
  red: {
    ring: 'stroke-red-500',
    bg:   'bg-red-50 dark:bg-red-950/20',
    text: 'text-red-700 dark:text-red-400',
    badge:'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  },
}

function HealthScoreCard({ kpi }: { kpi: KpiSummary }) {
  const { score, label, color, details } = kpi.health
  const cls = HEALTH_COLORS[color] ?? HEALTH_COLORS.green

  // SVG ring — circonférence ≈ 2π×36 ≈ 226
  const R   = 36
  const C   = 2 * Math.PI * R
  const dash = (score / 100) * C

  return (
    <div className={cn('rounded-xl border bg-card p-5 flex gap-5 items-start', cls.bg + '/40')}>
      {/* Jauge circulaire */}
      <div className="relative shrink-0 w-24 h-24">
        <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
          <circle cx="44" cy="44" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
          <circle
            cx="44" cy="44" r={R} fill="none"
            className={cls.ring}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`}
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-2xl font-bold leading-none', cls.text)}>{score}</span>
          <span className="text-[10px] text-muted-foreground mt-0.5">/100</span>
        </div>
      </div>

      {/* Texte */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <HeartPulse size={15} className={cls.text} />
          <h2 className="text-sm font-semibold text-foreground">Score de santé</h2>
          <span className={cn('ml-auto text-xs font-semibold px-2 py-0.5 rounded-full', cls.badge)}>{label}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Calculé sur les CVEs, incidents, alertes et échéances expirées.</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {details.map(d => (
            <div key={d.label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground truncate">{d.label}</span>
              <span className={cn('font-semibold ml-2', d.penalty > 0 ? 'text-red-600' : 'text-muted-foreground')}>
                {d.value > 0 ? `−${d.penalty}` : '✓'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Top CIs à risque ───────────────────────────────────────────────────────────

function TopRiskyCis({ cis }: { cis: RiskyCi[] }) {
  const navigate = useNavigate()
  if (!cis.length) return null
  const max = cis[0]?.risk_score || 1

  return (
    <CollapsiblePanel title="Top CIs à risque" count={cis.length} icon={ShieldAlert}>
      <div className="divide-y">
        {cis.map((ci) => (
          <div
            key={ci.id}
            className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
            onClick={() => navigate(`/ci/${ci.id}`)}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              {ci.ci_type === 'hardware' ? <Server size={13} /> : <Package size={13} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{ci.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {ci.cve_critical > 0 && (
                  <span className="text-[10px] text-red-600 font-medium">{ci.cve_critical} CVE crit.</span>
                )}
                {ci.open_incidents > 0 && (
                  <span className="text-[10px] text-orange-600 font-medium">{ci.open_incidents} incident{ci.open_incidents > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            <div className="w-20 shrink-0">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full"
                  style={{ width: `${Math.round((ci.risk_score / max) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-right mt-0.5">score {ci.risk_score}</p>
            </div>
          </div>
        ))}
      </div>
    </CollapsiblePanel>
  )
}

// ── Tendance alertes 30j ───────────────────────────────────────────────────────

function AlertTrendChart({ kpi }: { kpi: KpiSummary }) {
  const data = kpi.alert_trend.map(p => ({
    date: p.date.slice(5),  // "MM-DD"
    Total: p.total,
    Critiques: p.critical,
  }))

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={14} className="text-brand" />
        <h2 className="text-sm font-semibold text-foreground">Tendance alertes — 30 jours</h2>
      </div>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          Pas encore de données
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="Total"    stroke="#6d28d9" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Critiques" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function DeadlineLine({ d }: { d: Deadline }) {
  const navigate = useNavigate()
  const Icon = DEADLINE_ICONS[d.deadline_type] ?? CalendarClock
  const isPast = d.days_remaining < 0
  const isUrgent = d.days_remaining <= 7 && !isPast

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => d.ci_id && navigate(`/ci/${d.ci_id}`)}
    >
      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
        isPast ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : isUrgent ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400',
      )}>
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{d.ci_name}</p>
        <p className="text-[11px] text-muted-foreground">{d.deadline_label}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn(
          'text-xs font-semibold',
          isPast ? 'text-red-600' : isUrgent ? 'text-orange-600' : 'text-muted-foreground',
        )}>
          {isPast
            ? `−${Math.abs(d.days_remaining)}j`
            : d.days_remaining === 0 ? "Aujourd'hui"
            : `+${d.days_remaining}j`}
        </p>
        <p className="text-[10px] text-muted-foreground">{formatDate(d.deadline_date)}</p>
      </div>
    </div>
  )
}

// ── Widget Fin de vie ────────────────────────────────────────────────────

const EXPIRY_COLOR: Record<ExpiringItem['expiry_type'], string> = {
  warranty: 'bg-purple-100 text-purple-700',
  leasing:  'bg-blue-100 text-blue-700',
  license:  'bg-amber-100 text-amber-700',
  eol:      'bg-red-100 text-red-600',
}
const EXPIRY_LABEL: Record<ExpiringItem['expiry_type'], string> = {
  warranty: 'Garantie',
  leasing:  'Leasing',
  license:  'Licence',
  eol:      'EOL',
}

function ExpiringWidget({ items, total }: { items: ExpiringItem[]; total: number }) {
  const navigate = useNavigate()
  return (
    <CollapsiblePanel
      title="Fin de vie — 30 jours"
      count={total}
      link="/expiring"
      linkLabel="Voir tout →"
      icon={Clock}
    >
      {!items.length ? (
        <div className="py-8 text-center">
          <CalendarClock size={22} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Aucune expiration dans 30 jours.</p>
        </div>
      ) : (
        <div className="divide-y">
          {items.slice(0, 6).map((item) => {
            const isPast   = item.days_remaining < 0
            const isUrgent = item.days_remaining <= 7 && !isPast
            return (
              <div
                key={`${item.ci_id}-${item.expiry_type}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => navigate(`/ci/${item.ci_id}`)}
              >
                <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', EXPIRY_COLOR[item.expiry_type])}>
                  {EXPIRY_LABEL[item.expiry_type]}
                </span>
                <p className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">{item.ci_name}</p>
                <span className={cn(
                  'shrink-0 text-xs font-semibold',
                  isPast ? 'text-red-600' : isUrgent ? 'text-orange-600' : 'text-muted-foreground',
                )}>
                  {isPast ? `−${Math.abs(item.days_remaining)}j` : item.days_remaining === 0 ? "Auj." : `+${item.days_remaining}j`}
                </span>
              </div>
            )
          })}
          {total > 6 && (
            <div
              className="px-4 py-2.5 text-xs text-center text-muted-foreground hover:text-brand cursor-pointer"
              onClick={() => navigate('/expiring')}
            >
              +{total - 6} autres éléments
            </div>
          )}
        </div>
      )}
    </CollapsiblePanel>
  )
}

// ── Panneau réductible ────────────────────────────────────────────────────

function CollapsiblePanel({
  title, count, link, linkLabel, defaultOpen = true, className, children, icon: Icon,
}: {
  title: string
  count?: number
  link?: string
  linkLabel?: string
  defaultOpen?: boolean
  className?: string
  children: React.ReactNode
  icon?: React.ElementType
}) {
  const [open, setOpen] = useState(defaultOpen)
  const navigate = useNavigate()
  return (
    <div className={cn('rounded-xl border bg-card overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-5 py-3.5 border-b">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left group"
        >
          <ChevronDown
            size={13}
            className={cn(
              'shrink-0 text-muted-foreground transition-transform duration-200',
              !open && '-rotate-90',
            )}
          />
          {Icon && <Icon size={14} className="shrink-0 text-muted-foreground" />}
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {!open && count !== undefined && count > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {count}
            </span>
          )}
        </button>
        {link && (
          <button
            type="button"
            onClick={() => navigate(link)}
            className="shrink-0 text-xs text-brand hover:underline"
          >
            {linkLabel ?? 'Voir tout →'}
          </button>
        )}
      </div>
      {open && children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()

  const { data: kpi                    }     = useQuery({ queryKey: ['kpi-summary'],    queryFn: getKpiSummary,     staleTime: 60_000 })
  const { data: hw,        isLoading: lHw  } = useQuery({ queryKey: ['hw-stats'],       queryFn: getHardwareStats,  staleTime: 60_000 })
  const { data: sw,        isLoading: lSw  } = useQuery({ queryKey: ['sw-stats'],       queryFn: getSoftwareStats,  staleTime: 60_000 })
  const { data: cveStats,  isLoading: lCve } = useQuery({ queryKey: ['cve-stats'],      queryFn: getCveStats,       staleTime: 60_000 })
  const { data: trend                  }     = useQuery({ queryKey: ['ci-trend'],        queryFn: getCiTrend,        staleTime: 300_000 })
  const { data: alStats                }     = useQuery({ queryKey: ['alert-stats'],     queryFn: getAlertStats,     staleTime: 30_000 })
  const { data: recent                 }     = useQuery({ queryKey: ['alerts-recent'],   queryFn: () => getRecentAlerts(6), staleTime: 30_000 })
  const { data: chStats                }     = useQuery({ queryKey: ['change-stats'],    queryFn: getChangeStats,    staleTime: 60_000 })
  const { data: activeChanges          }     = useQuery({
    queryKey: ['changes-dashboard'],
    queryFn: () => listChanges({ limit: 5 }),
    staleTime: 60_000,
  })
  const { data: deadlines              }     = useQuery({
    queryKey: ['deadlines-dashboard'],
    queryFn: () => listDeadlines({ days_ahead: 30, include_expired: false }),
    staleTime: 120_000,
  })
  const { data: incStats               }     = useQuery({ queryKey: ['incident-stats'], queryFn: getIncidentStats, staleTime: 30_000 })
  const { data: expiring               }     = useQuery({
    queryKey: ['expiring-dashboard'],
    queryFn: () => listExpiring({ horizon: 30, include_expired: false }),
    staleTime: 120_000,
  })

  const activeCount = (chStats?.pending_approval ?? 0) + (chStats?.approved ?? 0) + (chStats?.in_progress ?? 0)
  const isLoading = lHw || lSw || lCve
  const totalCI   = (hw?.total ?? 0) + (sw?.total ?? 0)
  const inService = (hw?.by_status?.['in_service'] ?? 0) + (sw?.by_status?.['in_service'] ?? 0)
  const expiring90 = (hw?.warranty_expiring_90d ?? 0) + (sw?.license_expiring_90d ?? 0) + (sw?.eol_within_90d ?? 0)

  return (
    <div className="space-y-7">

      {/* En-tête */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">Vue d'ensemble du parc informatique</p>
      </div>

      {/* ── Score de santé + tendance alertes (hors isLoading principal) ─ */}
      {kpi && (
        <section className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <HealthScoreCard kpi={kpi} />
          </div>
          <div className="lg:col-span-2">
            <AlertTrendChart kpi={kpi} />
          </div>
        </section>
      )}

      {/* ── Top CIs à risque ────────────────────────────────────────────── */}
      {kpi && kpi.top_risky_cis.length > 0 && (
        <TopRiskyCis cis={kpi.top_risky_cis} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <>
          {/* ── Inventaire ─────────────────────────────────────────────── */}
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Inventaire
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Total CIs"
                value={totalCI}
                sub={`${inService} en service`}
                icon={Activity}
                colorCls="bg-slate-100 text-slate-600"
                to="/ci"
              />
              <KpiCard
                label="Matériel"
                value={hw?.total ?? 0}
                sub={`${hw?.warranty_expiring_90d ?? 0} garanties exp. 90j`}
                icon={Server}
                colorCls="bg-purple-100 text-purple-700"
                to="/hardware"
              />
              <KpiCard
                label="Logiciels"
                value={sw?.total ?? 0}
                sub={`${sw?.eol_within_90d ?? 0} EOL dans 90j`}
                icon={Package}
                colorCls="bg-blue-100 text-blue-700"
                to="/software"
              />
              <KpiCard
                label="En service"
                value={inService}
                sub={totalCI > 0 ? `${Math.round(inService / totalCI * 100)} % du parc` : ''}
                icon={CheckCircle2}
                colorCls="bg-green-100 text-green-700"
              />
            </div>
          </section>

          {/* ── Sécurité & ops ─────────────────────────────────────────── */}
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Sécurité & opérations
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Alertes ouvertes"
                value={alStats?.open ?? 0}
                sub={alStats?.critical ? `dont ${alStats.critical} critiques` : undefined}
                icon={AlertTriangle}
                colorCls="bg-red-100 text-red-600"
                to="/alerts"
                danger
              />
              <KpiCard
                label="CVEs critiques"
                value={cveStats?.critical ?? 0}
                sub={cveStats?.kev_count ? `${cveStats.kev_count} KEV actifs` : `${cveStats?.total ?? 0} total`}
                icon={ShieldAlert}
                colorCls="bg-orange-100 text-orange-600"
                to="/vulnerabilities"
                danger
              />
              <KpiCard
                label="Expirations 90j"
                value={expiring90}
                sub="garanties + licences + EOL"
                icon={CalendarClock}
                colorCls="bg-amber-100 text-amber-700"
                to="/expiring"
                danger
              />
              <KpiCard
                label="RFC actives"
                value={activeCount}
                sub={chStats?.in_progress ? `${chStats.in_progress} en cours` : `${chStats?.pending_approval ?? 0} en attente`}
                icon={ClipboardList}
                colorCls="bg-violet-100 text-violet-700"
                to="/changes"
                danger={false}
              />
            </div>
          </section>

          {/* ── Incidents ──────────────────────────────────────────────── */}
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Incidents
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Incidents ouverts"
                value={incStats?.open ?? 0}
                sub={incStats?.critical ? `dont ${incStats.critical} critiques` : undefined}
                icon={Siren}
                colorCls="bg-red-100 text-red-600"
                to="/incidents"
                danger
              />
              <KpiCard
                label="En investigation"
                value={incStats?.investigating ?? 0}
                icon={AlertCircle}
                colorCls="bg-amber-100 text-amber-600"
                to="/incidents"
              />
              <KpiCard
                label="Incidents critiques"
                value={incStats?.critical ?? 0}
                icon={Flame}
                colorCls="bg-orange-100 text-orange-600"
                to="/incidents"
                danger
              />
              <KpiCard
                label="MTTR moyen"
                value={incStats?.mttr_hours !== null && incStats?.mttr_hours !== undefined ? `${incStats.mttr_hours}h` : '—'}
                sub="temps moyen de résolution"
                icon={Clock}
                colorCls="bg-slate-100 text-slate-600"
                to="/incidents"
              />
            </div>
          </section>

          {/* ── Graphiques (3 colonnes sur la même ligne) ───────────── */}
          <section className="grid gap-5 lg:grid-cols-3">

            {/* Area chart évolution 12 mois */}
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Évolution — 12 mois</h2>
              {!trend || trend.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                  Pas encore de données
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={190}>
                  <AreaChart data={trend} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hw" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="sw" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                      formatter={(v: number, name: string) => [v, name === 'hardware' ? 'Matériel' : 'Logiciels']}
                    />
                    <Legend
                      iconType="circle" iconSize={7}
                      formatter={(v) => <span style={{ fontSize: 10 }}>{v === 'hardware' ? 'Matériel' : 'Logiciels'}</span>}
                    />
                    <Area type="monotone" dataKey="hardware" stroke="#8b5cf6" fill="url(#hw)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="software" stroke="#3b82f6" fill="url(#sw)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Donut criticité — légende sous le donut, pas de labels sur les tranches */}
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Répartition par criticité</h2>
              {(() => {
                const combined: Record<string, number> = {}
                for (const [k, v] of Object.entries(hw?.by_criticality ?? {})) combined[k] = (combined[k] ?? 0) + v
                for (const [k, v] of Object.entries(sw?.by_criticality ?? {})) combined[k] = (combined[k] ?? 0) + v
                const COLORS: Record<string, string> = {
                  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
                }
                const LABELS: Record<string, string> = {
                  critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Faible',
                }
                const ORDER = ['critical', 'high', 'medium', 'low']
                const data = Object.entries(combined)
                  .map(([name, value]) => ({ name, value, label: LABELS[name] ?? name }))
                  .sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name))
                if (data.length === 0) return (
                  <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Aucune donnée</div>
                )
                const total = data.reduce((s, d) => s + d.value, 0)
                return (
                  <>
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie
                          data={data}
                          dataKey="value"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={42}
                          outerRadius={65}
                          paddingAngle={3}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {data.map((entry) => (
                            <Cell key={entry.name} fill={COLORS[entry.name] ?? '#94a3b8'} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                          formatter={(v: number, name: string) => [`${v} (${total > 0 ? Math.round(v / total * 100) : 0}%)`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Légende manuelle sous le donut */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                      {data.map((d) => (
                        <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[d.name] ?? '#94a3b8' }} />
                          <span className="truncate">{d.label}</span>
                          <span className="ml-auto font-medium text-foreground">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Bar chart statuts */}
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Répartition par statut</h2>
              {(() => {
                const STATUS_LABELS: Record<string, string> = {
                  ordered: 'Commandé', in_stock: 'En stock', in_service: 'En service',
                  maintenance: 'Maint.', retired: 'Retiré',
                }
                const combined: Record<string, { hardware: number; software: number }> = {}
                for (const [k, v] of Object.entries(hw?.by_status ?? {})) {
                  if (!combined[k]) combined[k] = { hardware: 0, software: 0 }
                  combined[k].hardware += v
                }
                for (const [k, v] of Object.entries(sw?.by_status ?? {})) {
                  if (!combined[k]) combined[k] = { hardware: 0, software: 0 }
                  combined[k].software += v
                }
                const data = Object.entries(combined).map(([key, val]) => ({
                  name: STATUS_LABELS[key] ?? key,
                  Matériel: val.hardware,
                  Logiciels: val.software,
                }))
                if (data.length === 0) return (
                  <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Aucune donnée</div>
                )
                return (
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={data} barSize={14} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                      />
                      <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="Matériel" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Logiciels" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )
              })()}
            </div>
          </section>

          {/* ── Panels ─────────────────────────────────────────────────── */}
          <div className="grid gap-5 lg:grid-cols-5">

            {/* Alertes récentes */}
            <CollapsiblePanel
              title="Alertes récentes"
              count={alStats?.open}
              link="/alerts"
              linkLabel="Voir toutes →"
              className="lg:col-span-3"
              icon={Siren}
            >
              {!recent?.length ? (
                <div className="py-10 text-center">
                  <CheckCircle2 size={24} className="mx-auto text-green-500 mb-2" />
                  <p className="text-sm text-muted-foreground">Aucune alerte active.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {recent.map((alert) => {
                    const sev = alert.severity as AlertSeverity
                    const Icon = SEV_ICON[sev]
                    return (
                      <div key={alert.id} className="flex items-start gap-3 px-5 py-3">
                        <Icon
                          size={15}
                          className={cn(
                            'shrink-0 mt-0.5',
                            sev === 'critical' ? 'text-red-500' :
                            sev === 'warning'  ? 'text-amber-500' : 'text-blue-400',
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{alert.title}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(alert.created_at)}</p>
                        </div>
                        <Badge variant={SEV_VARIANT[sev]}>{SEV_LABELS[sev]}</Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CollapsiblePanel>

            {/* Échéances imminentes */}
            <CollapsiblePanel
              title="Échéances 30j"
              count={deadlines?.total}
              link="/expiring"
              linkLabel="Voir toutes →"
              className="lg:col-span-2"
              icon={CalendarClock}
            >
              {!deadlines?.items.length ? (
                <div className="py-10 text-center">
                  <CalendarClock size={24} className="mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">Aucune échéance dans 30 jours.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {deadlines.items.slice(0, 7).map((d, i) => (
                    <DeadlineLine key={i} d={d} />
                  ))}
                  {deadlines.total > 7 && (
                    <div
                      className="px-4 py-2.5 text-xs text-center text-muted-foreground hover:text-brand cursor-pointer"
                      onClick={() => navigate('/expiring')}
                    >
                      +{deadlines.total - 7} autres échéances
                    </div>
                  )}
                </div>
              )}
            </CollapsiblePanel>
          </div>

          {/* ── Fin de vie imminente ────────────────────────────────────── */}
          {expiring && (
            <ExpiringWidget items={expiring.items} total={expiring.total} />
          )}

          {/* ── Changements en cours ───────────────────────────────────── */}
          <CollapsiblePanel
            title="Changements récents"
            count={activeChanges?.total}
            link="/changes"
            linkLabel="Voir tous →"
            icon={ClipboardList}
          >
            {!activeChanges?.items.length ? (
              <div className="py-8 text-center">
                <ClipboardList size={22} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Aucune RFC en cours.</p>
              </div>
            ) : (
              <div className="divide-y">
                {activeChanges.items.map(cr => {
                  const statusVariant = CHANGE_STATUS_VARIANT[cr.status] ?? 'default'
                  const statusLabel   = CHANGE_STATUS_LABEL[cr.status]  ?? cr.status
                  const typeVariant   = CHANGE_TYPE_VARIANT[cr.change_type]
                  const typeLabel     = CHANGE_TYPE_LABEL[cr.change_type]
                  const Icon = cr.status === 'in_progress'
                    ? PlayCircle
                    : cr.status === 'pending_approval' ? Clock : CheckCircle2
                  return (
                    <div
                      key={cr.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/changes/${cr.id}`)}
                    >
                      <Icon
                        size={15}
                        className={cn(
                          'shrink-0',
                          cr.status === 'in_progress'      ? 'text-blue-500' :
                          cr.status === 'pending_approval' ? 'text-amber-500' : 'text-green-500',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{cr.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {cr.requester_name ?? '—'} · {cr.ci_count} CI{cr.ci_count > 1 ? 's' : ''}
                          {cr.planned_start ? ` · ${formatDate(cr.planned_start)}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Badge variant={typeVariant as any}>{typeLabel}</Badge>
                        <Badge variant={statusVariant as any}>{statusLabel}</Badge>
                      </div>
                    </div>
                  )
                })}
                {(activeChanges.total ?? 0) > 5 && (
                  <div
                    className="px-5 py-2.5 text-xs text-center text-muted-foreground hover:text-brand cursor-pointer"
                    onClick={() => navigate('/changes')}
                  >
                    +{activeChanges.total - 5} autres RFC
                  </div>
                )}
              </div>
            )}
          </CollapsiblePanel>

          {/* Empty state parc vide */}
          {totalCI === 0 && (
            <div className="rounded-xl border border-dashed bg-card p-12 text-center">
              <Server size={36} className="mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-semibold text-foreground">Parc vide</p>
              <p className="text-sm text-muted-foreground mt-1 mb-5">
                Commencez par ajouter votre premier élément de configuration.
              </p>
              {canWrite && (
                <button
                  onClick={() => navigate('/ci/new')}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground hover:bg-brand/90 transition-colors"
                >
                  Créer un CI
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
