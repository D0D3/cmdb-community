import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Plus, ClipboardList } from 'lucide-react'
import { listChanges, getChangeStats } from '@/api/changes'
import type { ChangeStatus, ChangeType, ChangePriority } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/utils'

const STATUS_LABEL: Record<ChangeStatus, string> = {
  draft:            'Brouillon',
  pending_approval: 'En attente',
  approved:         'Approuvée',
  in_progress:      'En cours',
  completed:        'Terminée',
  rejected:         'Rejetée',
  cancelled:        'Annulée',
}

const STATUS_VARIANT: Record<ChangeStatus, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft:            'default',
  pending_approval: 'warning',
  approved:         'info',
  in_progress:      'info',
  completed:        'success',
  rejected:         'danger',
  cancelled:        'default',
}

const TYPE_LABEL: Record<ChangeType, string> = {
  normal:    'Normal',
  standard:  'Standard',
  emergency: 'Urgent',
}

const TYPE_VARIANT: Record<ChangeType, 'default' | 'info' | 'danger'> = {
  normal:    'default',
  standard:  'info',
  emergency: 'danger',
}

const PRIORITY_LABEL: Record<ChangePriority, string> = {
  low:      'Faible',
  medium:   'Moyenne',
  high:     'Haute',
  critical: 'Critique',
}

const PRIORITY_VARIANT: Record<ChangePriority, 'default' | 'info' | 'warning' | 'danger'> = {
  low:      'default',
  medium:   'info',
  high:     'warning',
  critical: 'danger',
}

const SELECT_CLASS =
  'h-9 rounded border border-[hsl(var(--border))] bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'

export default function ChangeList() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const canWrite = can('changes:write')
  const [status, setStatus]     = useState('')
  const [changeType, setType]   = useState('')
  const [priority, setPriority] = useState('')
  const [page, setPage]         = useState(0)
  const LIMIT = 50

  const { data, isLoading } = useQuery({
    queryKey: ['changes', { status, changeType, priority, page }],
    queryFn: () => listChanges({
      ...(status     && { status }),
      ...(changeType && { change_type: changeType }),
      ...(priority   && { priority }),
      skip: page * LIMIT,
      limit: LIMIT,
    }),
  })

  const { data: stats } = useQuery({
    queryKey: ['change-stats'],
    queryFn: getChangeStats,
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Gestion des changements</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? '…' : `${total} RFC${total > 1 ? 's' : ''}`}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => navigate('/changes/new')} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Nouvelle RFC
          </Button>
        )}
      </div>

      {/* Stats rapides */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'En attente', value: stats.pending_approval, variant: 'warning' as const },
            { label: 'Approuvées', value: stats.approved,         variant: 'info' as const },
            { label: 'En cours',   value: stats.in_progress,      variant: 'info' as const },
            { label: 'Terminées',  value: stats.completed,        variant: 'success' as const },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-[hsl(var(--border))] bg-card p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(0) }} className={SELECT_CLASS}>
          <option value="">Tous les statuts</option>
          {(Object.entries(STATUS_LABEL) as [ChangeStatus, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={changeType} onChange={e => { setType(e.target.value); setPage(0) }} className={SELECT_CLASS}>
          <option value="">Tous les types</option>
          <option value="normal">Normal</option>
          <option value="standard">Standard</option>
          <option value="emergency">Urgent</option>
        </select>
        <select value={priority} onChange={e => { setPriority(e.target.value); setPage(0) }} className={SELECT_CLASS}>
          <option value="">Toutes priorités</option>
          <option value="low">Faible</option>
          <option value="medium">Moyenne</option>
          <option value="high">Haute</option>
          <option value="critical">Critique</option>
        </select>
      </div>

      {/* Tableau */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
          <ClipboardList className="w-10 h-10 opacity-40" />
          <p>Aucune RFC trouvée</p>
          <Button variant="secondary" size="sm" onClick={() => navigate('/changes/new')}>
            Créer la première RFC
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Titre</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Statut</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Priorité</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Demandeur</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Planifié le</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">CIs</th>
              </tr>
            </thead>
            <tbody>
              {items.map((cr, i) => (
                <tr
                  key={cr.id}
                  onClick={() => navigate(`/changes/${cr.id}`)}
                  className={`cursor-pointer hover:bg-muted/40 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/20'}`}
                >
                  <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">{cr.title}</td>
                  <td className="px-4 py-3">
                    <Badge variant={TYPE_VARIANT[cr.change_type]}>{TYPE_LABEL[cr.change_type]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[cr.status]}>{STATUS_LABEL[cr.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={PRIORITY_VARIANT[cr.priority]}>{PRIORITY_LABEL[cr.priority]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{cr.requester_name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {cr.planned_start ? formatDateTime(cr.planned_start).split(' ')[0] : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{cr.ci_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} / {total}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Préc.
            </Button>
            <Button variant="secondary" size="sm" disabled={(page + 1) * LIMIT >= total} onClick={() => setPage(p => p + 1)}>
              Suiv.
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
