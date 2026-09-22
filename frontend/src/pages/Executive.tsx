import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Server, Package, Shield, ShieldAlert, Siren, Bell, AlertTriangle,
  FileCheck2, KeySquare, ClipboardCheck, HeartPulse, TrendingUp,
  TriangleAlert, CheckCircle2, Clock, Lightbulb, Printer, ChevronDown,
} from 'lucide-react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { getExecutiveSummary, type ExecutiveSummary } from '@/api/executive'
import Spinner from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

const GOV_COLORS: Record<string, { ring: string; text: string; badge: string; bg: string }> = {
  green: {
    ring: 'stroke-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    bg:   'bg-emerald-50/60 dark:bg-emerald-950/20',
  },
  amber: {
    ring: 'stroke-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    bg:   'bg-amber-50/60 dark:bg-amber-950/20',
  },
  red: {
    ring: 'stroke-red-500',
    text: 'text-red-700 dark:text-red-400',
    badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    bg:   'bg-red-50/60 dark:bg-red-950/20',
  },
}

function pctColor(v: number): string {
  if (v >= 80) return 'text-emerald-600'
  if (v >= 60) return 'text-amber-600'
  return 'text-red-600'
}

function pctBarColor(v: number): string {
  if (v >= 80) return 'bg-emerald-500'
  if (v >= 60) return 'bg-amber-400'
  return 'bg-red-500'
}

// ── Score de gouvernance ──────────────────────────────────────────────────────

function GovernanceGauge({ data }: { data: ExecutiveSummary }) {
  const R   = 54
  const C   = 2 * Math.PI * R
  const pct = Math.max(0, Math.min(100, data.governance_score))
  const dash = (pct / 100) * C
  const cls  = GOV_COLORS[data.governance_color] ?? GOV_COLORS.green

  return (
    <div className={cn('rounded-2xl border p-6 flex flex-col items-center gap-4', cls.bg)}>
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 132 132" className="w-full h-full -rotate-90">
          <circle cx="66" cy="66" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
          <circle
            cx="66" cy="66" r={R} fill="none"
            className={cls.ring}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`}
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-4xl font-bold leading-none', cls.text)}>{pct}</span>
          <span className="text-xs text-muted-foreground mt-1">/100</span>
        </div>
      </div>
      <div className="text-center">
        <span className={cn('text-sm font-semibold px-3 py-1 rounded-full', cls.badge)}>
          {data.governance_label}
        </span>
        <p className="text-xs text-muted-foreground mt-2">Score de gouvernance global</p>
      </div>
    </div>
  )
}

// ── Pilier ────────────────────────────────────────────────────────────────────

function PillarCard({
  label, value, icon: Icon, to,
}: { label: string; value: number; icon: React.ElementType; to?: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={to ? () => navigate(to) : undefined}
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-card px-4 py-4 text-left w-full',
        to ? 'hover:shadow-sm hover:border-brand/30 cursor-pointer transition-all' : 'cursor-default',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <div className={cn('text-2xl font-bold', pctColor(value))}>{value}<span className="text-sm font-normal text-muted-foreground"> /100</span></div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', pctBarColor(value))}
          style={{ width: `${value}%` }}
        />
      </div>
    </button>
  )
}

// ── KPI opérationnel ──────────────────────────────────────────────────────────

function KpiOp({
  label, value, sub, icon: Icon, danger, to,
}: {
  label: string
  value: number | string
  sub?: string
  icon: React.ElementType
  danger?: boolean
  to?: string
}) {
  const navigate = useNavigate()
  const isDanger = danger && typeof value === 'number' && value > 0
  return (
    <button
      type="button"
      onClick={to ? () => navigate(to) : undefined}
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left w-full transition-all',
        to ? 'hover:shadow-sm hover:border-brand/30 cursor-pointer' : 'cursor-default',
        isDanger ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20' : '',
      )}
    >
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        isDanger ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-muted text-muted-foreground',
      )}>
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={cn('text-xl font-bold', isDanger ? 'text-red-700' : 'text-foreground')}>
          {value}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground leading-tight">{sub}</p>}
      </div>
    </button>
  )
}

// ── Recommandations ───────────────────────────────────────────────────────────

function RecommendationList({ items }: { items: string[] }) {
  const isOk = items.length === 1 && items[0].startsWith('Aucune')
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <ChevronDown
            size={13}
            className={cn('shrink-0 text-muted-foreground transition-transform duration-200', !open && '-rotate-90')}
          />
          <Lightbulb size={14} className={isOk ? 'text-emerald-500' : 'text-amber-500'} />
          <h2 className="text-sm font-semibold text-foreground">Recommandations prioritaires</h2>
        </button>
        {!isOk && (
          <span className="shrink-0 text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {items.length} action{items.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {open && (
        <div className="divide-y">
          {items.map((r, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-3">
              {isOk
                ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                : <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold mt-0.5">{i + 1}</span>
              }
              <p className="text-sm text-foreground/90">{r}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Top CIs à risque ──────────────────────────────────────────────────────────

function TopRisksTable({ data }: { data: ExecutiveSummary }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)
  if (!data.top_risky_cis.length) return null
  const max = data.top_risky_cis[0]?.risk_score || 1

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <ChevronDown
            size={13}
            className={cn('shrink-0 text-muted-foreground transition-transform duration-200', !open && '-rotate-90')}
          />
          <TriangleAlert size={14} className="text-orange-500" />
          <h2 className="text-sm font-semibold text-foreground">CIs à risque les plus élevés</h2>
        </button>
      </div>
      {open && <div className="divide-y">
        {data.top_risky_cis.map((ci) => (
          <div
            key={ci.id}
            className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 cursor-pointer"
            onClick={() => navigate(`/ci/${ci.id}`)}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              {ci.ci_type === 'hardware' ? <Server size={13} /> : <Package size={13} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{ci.name}</p>
              <div className="flex gap-3 mt-0.5">
                {ci.cve_critical > 0 && (
                  <span className="text-[10px] text-red-600 font-medium">
                    {ci.cve_critical} CVE crit.
                  </span>
                )}
                {ci.open_incidents > 0 && (
                  <span className="text-[10px] text-orange-600 font-medium">
                    {ci.open_incidents} incident{ci.open_incidents > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            <div className="w-24 shrink-0">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full"
                  style={{ width: `${Math.round((ci.risk_score / max) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-right text-muted-foreground mt-0.5">score {ci.risk_score}</p>
            </div>
          </div>
        ))}
      </div>}
    </div>
  )
}

// ── Tendance alertes ──────────────────────────────────────────────────────────

function AlertTrendMini({ data }: { data: ExecutiveSummary }) {
  const chartData = useMemo(() => data.alert_trend.map(p => ({
    date: p.date.slice(5),
    Total: p.total,
    Critiques: p.critical,
  })), [data.alert_trend])

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={14} className="text-brand" />
        <h2 className="text-sm font-semibold text-foreground">Tendance alertes — 30 jours</h2>
      </div>
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          Pas encore de données
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={chartData} margin={{ top: 2, right: 4, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gCrit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
            <Area type="monotone" dataKey="Total"    stroke="#8b5cf6" fill="url(#gTotal)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="Critiques" stroke="#ef4444" fill="url(#gCrit)"  strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Distribution risques ──────────────────────────────────────────────────────

function RiskDistribution({ data }: { data: ExecutiveSummary }) {
  const COLORS: Record<string, string> = {
    critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
  }
  const LABELS: Record<string, string> = {
    critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Faible',
  }
  const ORDER = ['critical', 'high', 'medium', 'low']

  const pieData = [
    { name: 'critical', value: data.critical_cves   },
    { name: 'high',     value: data.open_incidents   },
    { name: 'medium',   value: data.open_alerts       },
    { name: 'low',      value: data.total_ci > 0 ? Math.max(0, data.active_ci - data.critical_incidents) : 0 },
  ].filter(d => d.value > 0).sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name))

  const total = pieData.reduce((s, d) => s + d.value, 0)
  if (total === 0) {
    return (
      <div className="rounded-xl border bg-card p-5 flex items-center justify-center h-full">
        <div className="text-center">
          <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
          <p className="text-sm text-muted-foreground">Aucun risque détecté</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Shield size={14} className="text-brand" />
        <h2 className="text-sm font-semibold text-foreground">Distribution des risques</h2>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            cx="50%" cy="50%"
            innerRadius={32} outerRadius={55}
            paddingAngle={3}
            startAngle={90} endAngle={-270}
          >
            {pieData.map((entry) => (
              <Cell key={entry.name} fill={COLORS[entry.name] ?? '#94a3b8'} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
            formatter={(v: number, name: string) => [
              `${v} (${Math.round(v / total * 100)}%)`,
              LABELS[name] ?? name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
        {pieData.map(d => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[d.name] }} />
            <span className="truncate">{LABELS[d.name] ?? d.name}</span>
            <span className="ml-auto font-medium text-foreground">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Synthèse SLA / Licences ───────────────────────────────────────────────────

function ComplianceSummary({ data }: { data: ExecutiveSummary }) {
  const navigate = useNavigate()

  const slaItems = [
    { label: 'Contrats actifs',          value: data.sla_total,         color: 'text-foreground' },
    { label: 'Expirant sous 30 jours',   value: data.sla_expiring_30d,  color: data.sla_expiring_30d  > 0 ? 'text-amber-600' : 'text-foreground' },
    { label: 'Expirés',                  value: data.sla_expired,       color: data.sla_expired       > 0 ? 'text-red-600'   : 'text-foreground' },
    { label: 'CIs sans contrat',         value: data.cis_without_sla,   color: data.cis_without_sla   > 0 ? 'text-amber-600' : 'text-foreground' },
  ]

  const licItems = [
    { label: 'Logiciels suivis',         value: data.license_total,          color: 'text-foreground' },
    { label: 'Expirant sous 30 jours',   value: data.license_expiring_30d,   color: data.license_expiring_30d > 0 ? 'text-amber-600' : 'text-foreground' },
    { label: 'Expirées',                 value: data.license_expired,        color: data.license_expired      > 0 ? 'text-red-600'   : 'text-foreground' },
    { label: 'En dépassement de sièges', value: data.license_over_limit,     color: data.license_over_limit   > 0 ? 'text-red-600'   : 'text-foreground' },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* SLA */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <FileCheck2 size={14} className="text-brand" />
            <h2 className="text-sm font-semibold">Contrats SLA</h2>
          </div>
          <button onClick={() => navigate('/sla')} className="text-xs text-brand hover:underline">
            Voir →
          </button>
        </div>
        <div className="divide-y">
          {slaItems.map(it => (
            <div key={it.label} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className="text-muted-foreground">{it.label}</span>
              <span className={cn('font-semibold', it.color)}>{it.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Licences */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <KeySquare size={14} className="text-brand" />
            <h2 className="text-sm font-semibold">Licences logicielles</h2>
          </div>
          <button onClick={() => navigate('/licenses')} className="text-xs text-brand hover:underline">
            Voir →
          </button>
        </div>
        <div className="divide-y">
          {licItems.map(it => (
            <div key={it.label} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className="text-muted-foreground">{it.label}</span>
              <span className={cn('font-semibold', it.color)}>{it.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function Executive() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['executive-summary'],
    queryFn:  getExecutiveSummary,
    staleTime: 120_000,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex justify-center py-20 text-sm text-muted-foreground">
        Impossible de charger le tableau de bord exécutif.
      </div>
    )
  }

  const now = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Rapport exécutif</h1>
          <p className="text-sm text-muted-foreground">Synthèse de gouvernance au {now}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors print:hidden"
        >
          <Printer size={14} />
          Imprimer
        </button>
      </div>

      {/* ── Score de gouvernance + 4 piliers ──────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <GovernanceGauge data={data} />
        </div>
        <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <PillarCard
            label="Santé du parc"
            value={data.health_score}
            icon={HeartPulse}
            to="/dashboard"
          />
          <PillarCard
            label="Qualité données"
            value={data.quality_score}
            icon={ClipboardCheck}
            to="/quality"
          />
          <PillarCard
            label="Couverture SLA"
            value={data.sla_coverage_pct}
            icon={FileCheck2}
            to="/sla"
          />
          <PillarCard
            label="Conformité licences"
            value={data.license_compliance_pct}
            icon={KeySquare}
            to="/licenses"
          />
        </div>
      </div>

      {/* ── KPIs opérationnels ────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Indicateurs opérationnels
        </h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <KpiOp
            label="CIs actifs"
            value={data.active_ci}
            sub={`/ ${data.total_ci} total`}
            icon={Server}
            to="/hardware"
          />
          <KpiOp
            label="Incidents ouverts"
            value={data.open_incidents}
            sub={data.critical_incidents > 0 ? `dont ${data.critical_incidents} critiques` : undefined}
            icon={Siren}
            danger
            to="/incidents"
          />
          <KpiOp
            label="CVEs critiques"
            value={data.critical_cves}
            icon={ShieldAlert}
            danger
            to="/vulnerabilities"
          />
          <KpiOp
            label="Alertes ouvertes"
            value={data.open_alerts}
            sub={data.critical_alerts > 0 ? `dont ${data.critical_alerts} critiques` : undefined}
            icon={Bell}
            danger
            to="/alerts"
          />
          <KpiOp
            label="MTTR incidents"
            value={data.mttr_hours !== null ? `${data.mttr_hours}h` : '—'}
            sub="temps moyen de résolution"
            icon={Clock}
            to="/incidents"
          />
          <KpiOp
            label="Alertes critiques"
            value={data.critical_alerts}
            icon={AlertTriangle}
            danger
            to="/alerts"
          />
        </div>
      </section>

      {/* ── Recommandations ───────────────────────────────────────────── */}
      <RecommendationList items={data.recommendations} />

      {/* ── Graphiques ────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AlertTrendMini data={data} />
        <RiskDistribution data={data} />
      </div>

      {/* ── Top CIs à risque ──────────────────────────────────────────── */}
      {data.top_risky_cis.length > 0 && <TopRisksTable data={data} />}

      {/* ── Synthèse conformité SLA + Licences ───────────────────────── */}
      <ComplianceSummary data={data} />

    </div>
  )
}
