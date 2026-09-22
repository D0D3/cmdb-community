import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, Flame, AlertTriangle, AlertCircle, Info, Clock } from 'lucide-react'
import { listIncidents, getIncidentStats, deleteIncident } from '@/api/incidents'
import type { IncidentSeverity, IncidentStatus } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { formatDate, cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

const SEV_LABEL: Record<IncidentSeverity, string> = {
  critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Faible',
}
const SEV_VARIANT: Record<IncidentSeverity, 'danger' | 'warning' | 'info' | 'muted'> = {
  critical: 'danger', high: 'warning', medium: 'info', low: 'muted',
}
const SEV_ICON: Record<IncidentSeverity, React.ElementType> = {
  critical: Flame, high: AlertTriangle, medium: AlertCircle, low: Info,
}
const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Ouvert', investigating: 'En investigation', resolved: 'Résolu', closed: 'Clôturé',
}
const STATUS_VARIANT: Record<IncidentStatus, 'danger' | 'warning' | 'info' | 'muted'> = {
  open: 'danger', investigating: 'warning', resolved: 'success' as any, closed: 'muted',
}

function StatCard({ label, value, colorCls }: { label: string; value: number | string; colorCls: string }) {
  return (
    <div className={`rounded-xl border bg-card px-5 py-4 ${colorCls}`}>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}

const LIMIT = 50

export default function IncidentList() {
  const navigate = useNavigate()
  const { hasRole, can } = useAuth()
  const canWrite = can('incidents:write')
  const qc = useQueryClient()

  const [search, setSearch]       = useState('')
  const [statusF, setStatusF]     = useState('')
  const [severityF, setSeverityF] = useState('')
  const [page, setPage]           = useState(0)

  const { data: stats } = useQuery({
    queryKey: ['incident-stats'],
    queryFn: getIncidentStats,
    staleTime: 30_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', { search, status: statusF, severity: severityF, page }],
    queryFn: () => listIncidents({
      search: search || undefined,
      status: statusF || undefined,
      severity: severityF || undefined,
      skip: page * LIMIT,
      limit: LIMIT,
    }),
    staleTime: 15_000,
  })

  const deleteMut = useMutation({
    mutationFn: deleteIncident,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['incident-stats'] })
    },
  })

  const SELECT = 'h-9 rounded border border-[hsl(var(--border))] bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'
  const total = data?.total ?? 0

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Incidents</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? '…' : `${total} incident${total > 1 ? 's' : ''}`}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => navigate('/incidents/new')}>
            <Plus size={16} /> Nouvel incident
          </Button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Ouverts"           value={stats.open}          colorCls="border-red-200" />
          <StatCard label="En investigation"  value={stats.investigating}  colorCls="border-amber-200" />
          <StatCard label="Critiques actifs"  value={stats.critical}       colorCls="border-orange-200" />
          <StatCard
            label="MTTR moyen"
            value={stats.mttr_hours !== null ? `${stats.mttr_hours}h` : '—'}
            colorCls=""
          />
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          />
        </div>
        <select className={SELECT} value={statusF} onChange={(e) => { setStatusF(e.target.value); setPage(0) }}>
          <option value="">Tous les statuts</option>
          <option value="open">Ouvert</option>
          <option value="investigating">En investigation</option>
          <option value="resolved">Résolu</option>
          <option value="closed">Clôturé</option>
        </select>
        <select className={SELECT} value={severityF} onChange={(e) => { setSeverityF(e.target.value); setPage(0) }}>
          <option value="">Toutes sévérités</option>
          <option value="critical">Critique</option>
          <option value="high">Haute</option>
          <option value="medium">Moyenne</option>
          <option value="low">Faible</option>
        </select>
        {(search || statusF || severityF) && (
          <button
            onClick={() => { setSearch(''); setStatusF(''); setSeverityF(''); setPage(0) }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : data?.items.length === 0 ? (
          <div className="py-14 text-center">
            <p className="font-medium text-foreground">Aucun incident trouvé</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {['Sévérité', 'Titre', 'Statut', 'Assigné', 'CIs', 'Créé', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.items.map((inc) => {
                  const SevIcon = SEV_ICON[inc.severity]
                  return (
                    <tr
                      key={inc.id}
                      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/incidents/${inc.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <SevIcon size={13} className={cn(
                            inc.severity === 'critical' ? 'text-red-500' :
                            inc.severity === 'high'     ? 'text-orange-500' :
                            inc.severity === 'medium'   ? 'text-amber-500' : 'text-blue-400'
                          )} />
                          <Badge variant={SEV_VARIANT[inc.severity]}>{SEV_LABEL[inc.severity]}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{inc.title}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[inc.status]}>{STATUS_LABEL[inc.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {inc.assignee_name ?? <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{inc.ci_count}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(inc.created_at)}</td>
                      <td className="px-4 py-3">
                        {canWrite && hasRole('admin') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm(`Supprimer l'incident « ${inc.title} » ?`)) deleteMut.mutate(inc.id)
                            }}
                            className="text-muted-foreground hover:text-red-600 transition-colors p-1 rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {total > LIMIT && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} sur {total}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Précédent</Button>
                  <Button variant="secondary" size="sm" disabled={(page + 1) * LIMIT >= total} onClick={() => setPage(p => p + 1)}>Suivant</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
