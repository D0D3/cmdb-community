import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  KeySquare, Package, AlertTriangle, XCircle, Clock, TrendingUp, Search,
} from 'lucide-react'
import { getLicenseDashboard, type LicenseItem } from '@/api/ci'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, colorCls, sub,
}: {
  label: string; value: number; icon: React.ElementType; colorCls: string; sub?: string
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

// ── Barre de progression sièges ───────────────────────────────────────────────

function SeatBar({ item }: { item: LicenseItem }) {
  if (item.max_seats === null || item.install_count === null) {
    return <span className="text-xs text-muted-foreground/40">—</span>
  }
  const pct = Math.min((item.install_count / item.max_seats) * 100, 100)
  const over = item.install_count > item.max_seats
  const warn = !over && (item.utilization_pct ?? 0) >= 80

  return (
    <div className="space-y-1 min-w-[100px]">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className={cn('font-medium', over ? 'text-red-600' : warn ? 'text-amber-600' : '')}>
          {item.install_count}
          {over && <span className="ml-0.5">⚠</span>}
        </span>
        <span>/ {item.max_seats}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            over ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-brand',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Badge expiration ───────────────────────────────────────────────────────────

function ExpiryBadge({ item }: { item: LicenseItem }) {
  if (!item.license_end_date) return <span className="text-xs text-muted-foreground/40">—</span>
  const d = new Date(item.license_end_date).toLocaleDateString('fr-FR')
  const days = item.days_until_expiry

  if (item.expiry_status === 'expired')
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium"><XCircle size={10} /> Expiré · {d}</span>
  if (item.expiry_status === 'critical')
    return <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-medium"><AlertTriangle size={10} /> {days}j · {d}</span>
  if (item.expiry_status === 'warning')
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium"><Clock size={10} /> {days}j · {d}</span>
  return <span className="text-xs text-muted-foreground">{d}</span>
}

// ── Filtres ───────────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'h-9 rounded border border-[hsl(var(--border))] bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'

// ── Ligne licence ─────────────────────────────────────────────────────────────

function LicenseRow({ item }: { item: LicenseItem }) {
  const navigate = useNavigate()
  const rowBg =
    item.seat_status === 'over'         ? 'bg-red-50/40 dark:bg-red-950/20' :
    item.expiry_status === 'expired'    ? 'bg-red-50/30 dark:bg-red-950/10' :
    item.expiry_status === 'critical'   ? 'bg-orange-50/40 dark:bg-orange-950/20' :
    item.expiry_status === 'warning'    ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''

  return (
    <tr
      className={cn('border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer', rowBg)}
      onClick={() => navigate(`/ci/${item.ci_id}`)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Package size={13} className="text-muted-foreground shrink-0" />
          <div>
            <p className="font-medium text-sm text-foreground">{item.ci_name}</p>
            <p className="text-xs text-muted-foreground">{item.product}{item.version ? ` ${item.version}` : ''}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {item.vendor ?? <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="px-4 py-3">
        {item.license_type
          ? <Badge variant="muted">{item.license_type}</Badge>
          : <span className="text-xs text-muted-foreground/40">—</span>}
      </td>
      <td className="px-4 py-3">
        <ExpiryBadge item={item} />
      </td>
      <td className="px-4 py-3">
        <SeatBar item={item} />
      </td>
      <td className="px-4 py-3">
        {item.utilization_pct !== null ? (
          <span className={cn(
            'text-sm font-medium',
            item.seat_status === 'over'    ? 'text-red-600' :
            item.seat_status === 'warning' ? 'text-amber-600' : 'text-muted-foreground',
          )}>
            {item.utilization_pct} %
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
    </tr>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function Licenses() {
  const [search, setSearch]   = useState('')
  const [filterExp, setExp]   = useState('')  // '' | 'expiring' | 'expired'
  const [filterSeat, setSeat] = useState('')  // '' | 'over' | 'warning'

  const { data, isLoading } = useQuery({
    queryKey: ['license-dashboard'],
    queryFn: getLicenseDashboard,
  })

  const filtered = (data?.licenses ?? []).filter(item => {
    if (search) {
      const s = search.toLowerCase()
      if (
        !item.ci_name.toLowerCase().includes(s) &&
        !item.product.toLowerCase().includes(s) &&
        !(item.vendor ?? '').toLowerCase().includes(s)
      ) return false
    }
    if (filterExp === 'expiring' && !['warning', 'critical'].includes(item.expiry_status)) return false
    if (filterExp === 'expired'  && item.expiry_status !== 'expired') return false
    if (filterSeat === 'over'    && item.seat_status !== 'over') return false
    if (filterSeat === 'warning' && !['warning', 'over'].includes(item.seat_status)) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <KeySquare size={20} className="text-brand" />
          Gestion des licences
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Suivi des sièges, expiration et couverture licences logicielles.
        </p>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <KpiCard label="Logiciels total"   value={data.total_software} icon={Package}       colorCls="bg-brand/10 text-brand" />
          <KpiCard label="Sous licence"      value={data.licensed}       icon={KeySquare}     colorCls="bg-green-100 text-green-700" />
          <KpiCard label="Internes"          value={data.internal}       icon={Package}       colorCls="bg-slate-100 text-slate-600" />
          <KpiCard label="Expirent ≤ 30 j"  value={data.expiring_30d}   icon={AlertTriangle} colorCls={data.expiring_30d > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'} />
          <KpiCard label="Expirent ≤ 90 j"  value={data.expiring_90d}   icon={Clock}         colorCls={data.expiring_90d > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'} />
          <KpiCard label="Expirées"          value={data.expired}        icon={XCircle}       colorCls={data.expired > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'} />
          <KpiCard label="Dépassement sièges" value={data.over_limit}   icon={TrendingUp}    colorCls={data.over_limit > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}
            sub={data.over_limit > 0 ? 'Non conformes' : 'Conformes'}
          />
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder="Logiciel, éditeur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={SELECT_CLASS} value={filterExp} onChange={(e) => setExp(e.target.value)}>
          <option value="">Toutes expirations</option>
          <option value="expiring">Expirent ≤ 90 j</option>
          <option value="expired">Expirées</option>
        </select>
        <select className={SELECT_CLASS} value={filterSeat} onChange={(e) => setSeat(e.target.value)}>
          <option value="">Tous les sièges</option>
          <option value="warning">Utilisation ≥ 80 %</option>
          <option value="over">Dépassement</option>
        </select>
        {(search || filterExp || filterSeat) && (
          <button
            onClick={() => { setSearch(''); setExp(''); setSeat('') }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Tableau */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <KeySquare size={36} className="opacity-25" />
            <p className="text-sm">Aucune licence trouvée</p>
            <p className="text-xs text-muted-foreground/60">
              Renseignez le type de licence et les sièges dans les fiches CI logiciel.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left">Logiciel</th>
                  <th className="px-4 py-2.5 text-left">Éditeur</th>
                  <th className="px-4 py-2.5 text-left">Type licence</th>
                  <th className="px-4 py-2.5 text-left">Expiration</th>
                  <th className="px-4 py-2.5 text-left">Sièges utilisés / max</th>
                  <th className="px-4 py-2.5 text-left">Utilisation</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => <LicenseRow key={item.ci_id} item={item} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
