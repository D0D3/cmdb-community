import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  MonitorDot, Server, ShieldAlert, Unplug, Activity,
  Search, ExternalLink, Network, Plus,
} from 'lucide-react'
import { getVirtualStats, listVirtualVMs, type VirtualVM } from '@/api/ci'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import Input from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ordered: 'Commandé', in_stock: 'En stock', in_service: 'En service',
  maintenance: 'Maintenance', retired: 'Retiré',
}
const STATUS_VARIANT: Record<string, 'success' | 'info' | 'muted' | 'warning' | 'danger'> = {
  ordered: 'info', in_stock: 'muted', in_service: 'success', maintenance: 'warning', retired: 'danger',
}
const CRIT_LABELS: Record<string, string> = {
  critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Faible',
}
const CRIT_VARIANT: Record<string, 'danger' | 'warning' | 'info' | 'muted'> = {
  critical: 'danger', high: 'warning', medium: 'info', low: 'muted',
}
const SELECT_CLASS =
  'h-9 rounded border border-[hsl(var(--border))] bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, colorCls, sub,
}: {
  label: string
  value: number
  icon: React.ElementType
  colorCls: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', colorCls)}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Ligne VM ──────────────────────────────────────────────────────────────────

function VMRow({ vm }: { vm: VirtualVM }) {
  const navigate = useNavigate()
  return (
    <tr
      className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={() => navigate(`/ci/${vm.id}`)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <MonitorDot size={14} className="text-brand shrink-0" />
          <span className="font-medium text-sm text-foreground">{vm.name}</span>
        </div>
        {vm.team && <p className="text-xs text-muted-foreground ml-5 mt-0.5">{vm.team}</p>}
      </td>
      <td className="px-4 py-3">
        <Badge variant={STATUS_VARIANT[vm.status] ?? 'muted'}>
          {STATUS_LABELS[vm.status] ?? vm.status}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <Badge variant={CRIT_VARIANT[vm.criticality] ?? 'muted'}>
          {CRIT_LABELS[vm.criticality] ?? vm.criticality}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {vm.host_name ? (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/ci/${vm.host_id}`) }}
            className="flex items-center gap-1.5 text-sm text-foreground hover:text-brand transition-colors"
          >
            <Server size={13} className="text-muted-foreground" />
            {vm.host_name}
            <ExternalLink size={11} className="text-muted-foreground" />
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground/50">
            <Unplug size={12} /> Sans hôte
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {vm.location ?? <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="px-4 py-3">
        {vm.cve_count > 0 ? (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
            vm.cve_count >= 5 ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700',
          )}>
            <ShieldAlert size={11} />
            {vm.cve_count}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/graph?ci=${vm.id}`) }}
          title="Voir dans le graphe"
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-brand transition-colors"
        >
          <Network size={14} />
        </button>
      </td>
    </tr>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function VirtualPark() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus]       = useState('')
  const [criticality, setCrit]    = useState('')

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['virtual-stats'],
    queryFn: getVirtualStats,
  })

  const { data: vms, isLoading: vmsLoading } = useQuery({
    queryKey: ['virtual-vms', search, status, criticality],
    queryFn: () => listVirtualVMs({
      ...(search      && { search }),
      ...(status      && { status }),
      ...(criticality && { criticality }),
    }),
  })

  const isLoading = statsLoading || vmsLoading

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <MonitorDot size={20} className="text-brand" />
            Parc Virtuel
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Machines virtuelles et leurs hôtes physiques.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => navigate('/ci/new?type=hardware&hw_subtype=vm')}
            className="flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 transition-colors"
          >
            <Plus size={14} /> Nouvelle VM
          </button>
        )}
      </div>

      {/* KPIs */}
      {statsLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            label="Machines virtuelles"
            value={stats.total_vms}
            icon={MonitorDot}
            colorCls="bg-brand/10 text-brand"
          />
          <KpiCard
            label="VMs actives"
            value={stats.active_vms}
            icon={Activity}
            colorCls="bg-green-100 text-green-700"
            sub={stats.total_vms > 0 ? `${Math.round((stats.active_vms / stats.total_vms) * 100)} %` : undefined}
          />
          <KpiCard
            label="Hôtes physiques"
            value={stats.physical_hosts}
            icon={Server}
            colorCls="bg-purple-100 text-purple-700"
            sub={stats.physical_hosts > 0 ? `ratio ${(stats.total_vms / stats.physical_hosts).toFixed(1)} VM/hôte` : undefined}
          />
          <KpiCard
            label="Sans hôte défini"
            value={stats.vms_without_host}
            icon={Unplug}
            colorCls={stats.vms_without_host > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}
          />
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder="Rechercher une VM…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={SELECT_CLASS} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select className={SELECT_CLASS} value={criticality} onChange={(e) => setCrit(e.target.value)}>
          <option value="">Toutes criticités</option>
          {Object.entries(CRIT_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !vms?.length ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <MonitorDot size={36} className="opacity-25" />
            <p className="text-sm">Aucune machine virtuelle trouvée</p>
            <p className="text-xs text-muted-foreground/60">
              Créez un CI Matériel avec le sous-type « Machine virtuelle » pour le voir ici.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left">Machine virtuelle</th>
                  <th className="px-4 py-2.5 text-left">Statut</th>
                  <th className="px-4 py-2.5 text-left">Criticité</th>
                  <th className="px-4 py-2.5 text-left">Hôte physique</th>
                  <th className="px-4 py-2.5 text-left">Emplacement</th>
                  <th className="px-4 py-2.5 text-left">CVE</th>
                  <th className="px-4 py-2.5 text-left">Graphe</th>
                </tr>
              </thead>
              <tbody>
                {vms.map(vm => <VMRow key={vm.id} vm={vm} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
