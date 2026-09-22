import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { Server, ShieldAlert, Clock, AlertTriangle, Plus } from 'lucide-react'
import { getHardwareStats } from '@/api/stats'
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

// Tooltip personnalisé recharts
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

export default function HardwareDashboard() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats-hardware'],
    queryFn: getHardwareStats,
    staleTime: 60_000,
  })

  const { data: list } = useQuery({
    queryKey: ['ci', 'hardware-list'],
    queryFn: () => listCIs({ ci_type: 'hardware', limit: 10, status: 'in_service' }),
    staleTime: 60_000,
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>

  const statusData = Object.entries(stats?.by_status ?? {})
    .map(([key, value]) => ({ name: STATUS_LABELS[key] ?? key, value, color: STATUS_COLORS[key] ?? '#8884d8' }))
    .filter(d => d.value > 0)

  const critData = CRIT_ORDER
    .filter(k => (stats?.by_criticality[k] ?? 0) > 0)
    .map(k => ({ name: CRIT_LABELS[k], value: stats!.by_criticality[k], fill: CRIT_COLORS[k] }))

  const mfrData = (stats?.top_manufacturers ?? []).map(m => ({ name: m.name, value: m.count }))

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Server size={20} className="text-purple-700" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Tableau de bord Matériel</h1>
            <p className="text-sm text-muted-foreground">Vue d'ensemble du parc matériel</p>
          </div>
        </div>
        {canWrite && (
          <button
            onClick={() => navigate('/ci/new')}
            className="flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 transition-colors"
          >
            <Plus size={14} /> Nouveau matériel
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total matériel"       value={stats?.total ?? 0}                icon={Server}       colorCls="bg-purple-100 text-purple-700" onClick={() => navigate('/ci?ci_type=hardware')} />
        <KpiCard label="En service"           value={stats?.by_status['in_service'] ?? 0} icon={Server}    colorCls="bg-green-100 text-green-700" />
        <KpiCard label="Garanties exp. 90 j"  value={stats?.warranty_expiring_90d ?? 0} icon={Clock}      colorCls="bg-amber-100 text-amber-700"  onClick={() => navigate('/expiring')} />
        <KpiCard label="Garanties expirées"   value={stats?.warranty_expired ?? 0}      icon={AlertTriangle} colorCls="bg-red-100 text-red-600" />
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
                  <Legend
                    formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                  />
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

        {/* Top fabricants */}
        <Card>
          <CardHeader><CardTitle>Top fabricants</CardTitle></CardHeader>
          <CardContent>
            {mfrData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucun fabricant renseigné
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={mfrData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" fill="#a78bfa" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Liste des derniers CIs en service */}
      {(list?.items.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Matériels en service (récents)</CardTitle>
              <button
                onClick={() => navigate('/ci?ci_type=hardware')}
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
                  {['Nom', 'Statut', 'Criticité', 'Fabricant'].map(h => (
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
                    <td className="px-4 py-3 font-medium text-foreground">{ci.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[ci.status as CIStatus]}>{STATUS_LABELS[ci.status] ?? ci.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={CRIT_BADGE[ci.criticality as CICriticality]}>{CRIT_LABELS[ci.criticality] ?? ci.criticality}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{ci.hardware_details?.manufacturer ?? '—'}</td>
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
          <Server size={36} className="mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-medium text-foreground">Aucun matériel enregistré</p>
          {canWrite && (
            <button
              onClick={() => navigate('/ci/new')}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 transition-colors"
            >
              <Plus size={14} /> Ajouter un matériel
            </button>
          )}
        </div>
      )}
    </div>
  )
}
