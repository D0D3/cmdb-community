import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { Package, Clock, ShieldAlert, Lock, Plus } from 'lucide-react'
import { getSoftwareStats } from '@/api/stats'
import { listCIs } from '@/api/ci'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'
import type { CIStatus, CICriticality } from '@/types/api'

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ordered: 'Commandé', in_stock: 'En stock', in_service: 'En service',
  maintenance: 'Maintenance', retired: 'Retraité',
}
const STATUS_COLORS: Record<string, string> = {
  ordered: '#60a5fa', in_stock: '#a3a3a3', in_service: '#34d399',
  maintenance: '#fbbf24', retired: '#f87171',
}
const CRIT_LABELS: Record<string, string> = {
  low: 'Faible', medium: 'Moyenne', high: 'Haute', critical: 'Critique',
}
const CRIT_COLORS: Record<string, string> = {
  low: '#a3a3a3', medium: '#60a5fa', high: '#f97316', critical: '#ef4444',
}
const CRIT_ORDER = ['low', 'medium', 'high', 'critical']

const STATUS_BADGE: Record<CIStatus, 'success' | 'info' | 'muted' | 'warning' | 'danger'> = {
  ordered: 'info', in_stock: 'muted', in_service: 'success', maintenance: 'warning', retired: 'danger',
}
const CRIT_BADGE: Record<CICriticality, 'danger' | 'warning' | 'info' | 'muted'> = {
  critical: 'danger', high: 'warning', medium: 'info', low: 'muted',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, colorCls, onClick }: {
  label: string; value: number | string; icon: React.ElementType; colorCls: string; onClick?: () => void
}) {
  return (
    <div
      className={cn('flex items-center gap-3 rounded-lg border bg-card px-4 py-3', onClick && 'cursor-pointer hover:shadow-sm transition-shadow')}
      onClick={onClick}
    >
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', colorCls)}>
        <Icon size={17} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">{payload[0].value} CI{payload[0].value > 1 ? 's' : ''}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SoftwareDashboard() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats-software'],
    queryFn: getSoftwareStats,
    staleTime: 60_000,
  })

  const { data: list } = useQuery({
    queryKey: ['ci', 'software-list'],
    queryFn: () => listCIs({ ci_type: 'software', limit: 10, status: 'in_service' }),
    staleTime: 60_000,
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>

  const statusData = Object.entries(stats?.by_status ?? {})
    .map(([key, value]) => ({ name: STATUS_LABELS[key] ?? key, value, color: STATUS_COLORS[key] ?? '#8884d8' }))
    .filter(d => d.value > 0)

  const critData = CRIT_ORDER
    .filter(k => (stats?.by_criticality[k] ?? 0) > 0)
    .map(k => ({ name: CRIT_LABELS[k], value: stats!.by_criticality[k], fill: CRIT_COLORS[k] }))

  const vendorData = (stats?.top_vendors ?? []).map(v => ({ name: v.name, value: v.count }))

  const externalCount = (stats?.total ?? 0) - (stats?.is_internal_count ?? 0)

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <Package size={20} className="text-blue-700" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Tableau de bord Logiciels</h1>
            <p className="text-sm text-muted-foreground">Vue d'ensemble du parc applicatif</p>
          </div>
        </div>
        {canWrite && (
          <button
            onClick={() => navigate('/ci/new?type=software')}
            className="flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 transition-colors"
          >
            <Plus size={14} /> Nouveau logiciel
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total logiciels"     value={stats?.total ?? 0}                   icon={Package}     colorCls="bg-blue-100 text-blue-700"   onClick={() => navigate('/ci?ci_type=software')} />
        <KpiCard label="Licences exp. 90 j"  value={stats?.license_expiring_90d ?? 0}    icon={Clock}       colorCls="bg-amber-100 text-amber-700"  onClick={() => navigate('/expiring')} />
        <KpiCard label="EOL dans 90 j"       value={stats?.eol_within_90d ?? 0}           icon={ShieldAlert} colorCls="bg-red-100 text-red-600"      onClick={() => navigate('/expiring')} />
        <KpiCard label="Développement interne" value={stats?.is_internal_count ?? 0}      icon={Lock}        colorCls="bg-slate-100 text-slate-600" />
      </div>

      {/* Graphiques */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Répartition statuts */}
        <Card>
          <CardHeader><CardTitle>Répartition par statut</CardTitle></CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucune donnée</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v} CI`, '']} />
                  <Legend formatter={(value) => <span className="text-xs text-foreground">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Répartition criticité */}
        <Card>
          <CardHeader><CardTitle>Répartition par criticité</CardTitle></CardHeader>
          <CardContent>
            {critData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucune donnée</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={critData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {critData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top éditeurs */}
        <Card>
          <CardHeader><CardTitle>Top éditeurs</CardTitle></CardHeader>
          <CardContent>
            {vendorData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucun éditeur renseigné
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={vendorData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" fill="#60a5fa" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Interne vs externe */}
      {(stats?.total ?? 0) > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground mb-1">Développements internes</p>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-foreground">{stats?.is_internal_count ?? 0}</span>
              <span className="text-sm text-muted-foreground mb-0.5">/ {stats?.total}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${stats?.total ? ((stats.is_internal_count / stats.total) * 100) : 0}%` }}
              />
            </div>
          </div>
          <div className="rounded-lg border bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground mb-1">Logiciels tiers (éditeur)</p>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-foreground">{externalCount}</span>
              <span className="text-sm text-muted-foreground mb-0.5">/ {stats?.total}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-400 transition-all"
                style={{ width: `${stats?.total ? ((externalCount / stats.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Liste des derniers logiciels en service */}
      {(list?.items.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Logiciels en service (récents)</CardTitle>
              <button
                onClick={() => navigate('/ci?ci_type=software')}
                className="text-xs text-brand hover:underline"
              >
                Voir tout
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {['Produit', 'Éditeur', 'Version', 'Criticité'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list!.items.map(ci => (
                  <tr
                    key={ci.id}
                    className="border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => navigate(`/ci/${ci.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{ci.software_details?.product ?? ci.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ci.software_details?.vendor ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ci.software_details?.version ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={CRIT_BADGE[ci.criticality as CICriticality]}>{CRIT_LABELS[ci.criticality] ?? ci.criticality}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* État vide */}
      {(stats?.total ?? 0) === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <Package size={36} className="mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-medium text-foreground">Aucun logiciel enregistré</p>
          {canWrite && (
            <button
              onClick={() => navigate('/ci/new')}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 transition-colors"
            >
              <Plus size={14} /> Ajouter un logiciel
            </button>
          )}
        </div>
      )}
    </div>
  )
}
