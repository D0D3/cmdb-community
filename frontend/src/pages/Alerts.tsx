import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, AlertTriangle, AlertCircle, Info, Server } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { listAlerts, resolveAlert } from '@/api/alerts'
import type { AlertKind, AlertSeverity } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/utils'

const KIND_LABELS: Record<AlertKind, string> = {
  warranty_expiry:  'Garantie',
  license_expiry:   'Licence',
  eol:              'EOL éditeur',
  sla_expiry:       'Contrat SLA',
  maintenance_due:  'Maintenance',
  cve_match:        'CVE',
  app_update:       'Mise à jour',
}

const SEV_VARIANT: Record<AlertSeverity, 'danger' | 'warning' | 'info'> = {
  critical: 'danger',
  warning:  'warning',
  info:     'info',
}
const SEV_LABELS: Record<AlertSeverity, string> = {
  critical: 'Critique',
  warning:  'Avertissement',
  info:     'Info',
}

const SEV_ICON: Record<AlertSeverity, React.ElementType> = {
  critical: AlertTriangle,
  warning:  AlertCircle,
  info:     Info,
}

const SELECT_CLASS =
  'h-9 rounded border border-[hsl(var(--border))] bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'

const KINDS = Object.entries(KIND_LABELS) as [AlertKind, string][]

export default function Alerts() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [openOnly, setOpenOnly] = useState(true)
  const [kind, setKind]         = useState('')
  const [severity, setSeverity] = useState('')
  const [page, setPage]         = useState(0)
  const LIMIT = 50

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', { openOnly, kind, severity, page }],
    queryFn: () => listAlerts({
      open_only: openOnly,
      ...(kind && { kind }),
      ...(severity && { severity }),
      skip: page * LIMIT,
      limit: LIMIT,
    }),
  })

  const resolveMut = useMutation({
    mutationFn: resolveAlert,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
    },
  })

  const total = data?.total ?? 0

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Centre d'alertes</h1>
          <p className="text-sm text-muted-foreground">{isLoading ? '…' : `${total} alerte${total > 1 ? 's' : ''}`}</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <select className={SELECT_CLASS} value={openOnly ? 'open' : 'all'} onChange={(e) => { setOpenOnly(e.target.value === 'open'); setPage(0) }}>
          <option value="open">Ouvertes</option>
          <option value="all">Toutes</option>
        </select>
        <select className={SELECT_CLASS} value={kind} onChange={(e) => { setKind(e.target.value); setPage(0) }}>
          <option value="">Tous types</option>
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className={SELECT_CLASS} value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(0) }}>
          <option value="">Toutes sévérités</option>
          <option value="critical">Critique</option>
          <option value="warning">Avertissement</option>
          <option value="info">Info</option>
        </select>
      </div>

      {/* Liste */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !data?.items.length ? (
          <div className="py-14 text-center">
            <CheckCheck size={28} className="mx-auto text-green-500 mb-2" />
            <p className="font-medium text-foreground">Aucune alerte</p>
            <p className="text-sm text-muted-foreground mt-1">Tout est sous contrôle.</p>
          </div>
        ) : (
          <>
            <div className="divide-y">
              {data.items.map((alert) => {
                const sev = alert.severity as AlertSeverity
                const Icon = SEV_ICON[sev]
                return (
                  <div key={alert.id} className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors">
                    <Icon size={18} className={sev === 'critical' ? 'text-red-500 shrink-0 mt-0.5' : sev === 'warning' ? 'text-amber-500 shrink-0 mt-0.5' : 'text-blue-500 shrink-0 mt-0.5'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground">{alert.title}</span>
                        <Badge variant={SEV_VARIANT[sev]}>{SEV_LABELS[sev]}</Badge>
                        <Badge variant="muted">{KIND_LABELS[alert.kind] ?? alert.kind}</Badge>
                      </div>
                      {alert.body && <p className="text-sm text-muted-foreground mt-0.5 truncate">{alert.body}</p>}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">{formatDateTime(alert.created_at)}</span>
                        {alert.ci_id && (
                          <button
                            onClick={() => navigate(`/ci/${alert.ci_id}`)}
                            className="text-xs text-brand hover:underline flex items-center gap-1"
                          >
                            <Server size={11} /> Voir le CI
                          </button>
                        )}
                      </div>
                    </div>
                    {!alert.resolved_at && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={resolveMut.isPending && resolveMut.variables === alert.id}
                        onClick={() => resolveMut.mutate(alert.id)}
                      >
                        Résoudre
                      </Button>
                    )}
                    {alert.resolved_at && (
                      <Badge variant="success">Résolu</Badge>
                    )}
                  </div>
                )
              })}
            </div>

            {total > LIMIT && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">{page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} sur {total}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
                  <Button variant="secondary" size="sm" disabled={(page + 1) * LIMIT >= total} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
