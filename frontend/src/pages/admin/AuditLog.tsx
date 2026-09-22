import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, ChevronRight, ChevronLeft } from 'lucide-react'
import { listAudit, type AuditLogEntry } from '@/api/audit'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import { formatDateTime } from '@/lib/utils'

const ACTION_LABEL: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
}
const ACTION_VARIANT: Record<string, 'success' | 'info' | 'danger'> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
}
const TYPE_LABEL: Record<string, string> = {
  ci: 'CI',
  user: 'Utilisateur',
  connector: 'Connecteur',
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nom', description: 'Description', status: 'Statut',
  criticality: 'Criticité', team: 'Équipe', location: 'Emplacement',
}

const SELECT_CLASS =
  'h-9 rounded border border-[hsl(var(--border))] bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'

const LIMIT = 50

function DiffBadge({ field, before, after }: { field: string; before: string | null; after: string }) {
  const label = FIELD_LABELS[field] ?? field
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      <span className="font-medium text-foreground">{label} :</span>
      {before !== null && (
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 line-through">{before}</span>
      )}
      <span className="text-muted-foreground">→</span>
      <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">{after}</span>
    </span>
  )
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false)
  const hasChanges = entry.changes && Object.keys(entry.changes).length > 0

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {formatDateTime(entry.created_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{entry.entity_name ?? '—'}</span>
          <span className="text-xs text-muted-foreground">{TYPE_LABEL[entry.entity_type] ?? entry.entity_type}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant={ACTION_VARIANT[entry.action] ?? 'muted'}>
          {ACTION_LABEL[entry.action] ?? entry.action}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm text-foreground">
        {entry.performed_by_name ?? <span className="text-muted-foreground">Système</span>}
      </td>
      <td className="px-4 py-3">
        {hasChanges ? (
          <div className="space-y-1">
            {!open && Object.keys(entry.changes!).length > 0 && (
              <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight size={12} />
                {Object.keys(entry.changes!).length} champ{Object.keys(entry.changes!).length > 1 ? 's' : ''}
              </button>
            )}
            {open && (
              <>
                <div className="space-y-1">
                  {Object.entries(entry.changes!).map(([field, diff]) => (
                    <DiffBadge key={field} field={field} before={diff.before} after={diff.after} />
                  ))}
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft size={12} /> Réduire
                </button>
              </>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  )
}

export default function AuditLogAdmin() {
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['audit', entityType, action, page],
    queryFn: () => listAudit({
      ...(entityType && { entity_type: entityType }),
      ...(action && { action }),
      skip: page * LIMIT,
      limit: LIMIT,
    }),
  })

  const total = data?.total ?? 0

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10">
          <History size={18} className="text-brand" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Journal d'audit</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? '…' : `${total} entrée${total > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <select
          className={SELECT_CLASS}
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setPage(0) }}
        >
          <option value="">Tous les types</option>
          <option value="ci">CI</option>
          <option value="user">Utilisateur</option>
          <option value="connector">Connecteur</option>
        </select>

        <select
          className={SELECT_CLASS}
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(0) }}
        >
          <option value="">Toutes les actions</option>
          <option value="create">Création</option>
          <option value="update">Modification</option>
          <option value="delete">Suppression</option>
        </select>

        {(entityType || action) && (
          <button
            onClick={() => { setEntityType(''); setAction(''); setPage(0) }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !data?.items.length ? (
          <div className="py-14 text-center">
            <History size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Aucune entrée d'audit.</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {['Date', 'Entité', 'Action', 'Par', 'Modifications'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>

            {total > LIMIT && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} sur {total}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted/50 transition-colors"
                  >
                    <ChevronLeft size={14} /> Précédent
                  </button>
                  <button
                    disabled={(page + 1) * LIMIT >= total}
                    onClick={() => setPage((p) => p + 1)}
                    className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted/50 transition-colors"
                  >
                    Suivant <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
