import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Download, Clock } from 'lucide-react'
import { listDeadlines, deadlinesCsvUrl } from '@/api/alerts'
import type { Deadline } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'

const TYPE_LABELS: Record<string, string> = {
  warranty_expiry: 'Fin de garantie',
  license_expiry:  'Fin de licence',
  eol:             'EOL éditeur',
  sla_expiry:      'Contrat SLA',
  maintenance_due: 'Maintenance',
}

const SEV_VARIANT: Record<string, 'danger' | 'warning' | 'info'> = {
  critical: 'danger',
  warning:  'warning',
  info:     'info',
}

function DaysChip({ days }: { days: number }) {
  if (days < 0) return <span className="text-xs font-semibold text-red-600">Expiré ({Math.abs(days)} j)</span>
  if (days === 0) return <span className="text-xs font-semibold text-red-600">Aujourd'hui</span>
  return <span className="text-xs font-medium text-muted-foreground">J-{days}</span>
}

const SELECT_CLASS = 'h-9 rounded border border-[hsl(var(--border))] bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'

export default function Deadlines() {
  const navigate = useNavigate()
  const [daysAhead, setDaysAhead] = useState(90)
  const [includeExpired, setIncludeExpired] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['deadlines', { daysAhead, includeExpired }],
    queryFn: () => listDeadlines({ days_ahead: daysAhead, include_expired: includeExpired }),
  })

  const items = (data?.items ?? []).filter((d) => !typeFilter || d.deadline_type === typeFilter)

  const csvUrl = deadlinesCsvUrl({ days_ahead: daysAhead, include_expired: includeExpired })

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Échéances</h1>
          <p className="text-sm text-muted-foreground">{isLoading ? '…' : `${items.length} échéance${items.length > 1 ? 's' : ''} affichée${items.length > 1 ? 's' : ''}`}</p>
        </div>
        <a
          href={csvUrl}
          download="echeances.csv"
          className="inline-flex items-center gap-2 rounded border border-[hsl(var(--border))] bg-card px-3 h-9 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Download size={15} /> Export CSV
        </a>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <select className={SELECT_CLASS} value={daysAhead} onChange={(e) => setDaysAhead(Number(e.target.value))}>
          <option value={30}>Moins de 30 jours</option>
          <option value={60}>Moins de 60 jours</option>
          <option value={90}>Moins de 90 jours</option>
          <option value={180}>Moins de 6 mois</option>
          <option value={365}>Moins d'un an</option>
        </select>
        <select className={SELECT_CLASS} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Tous types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={includeExpired}
            onChange={(e) => setIncludeExpired(e.target.checked)}
            className="h-4 w-4 rounded border-[hsl(var(--border))]"
          />
          Inclure les expirés
        </label>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !items.length ? (
          <div className="py-14 text-center">
            <Clock size={28} className="mx-auto text-muted-foreground/50 mb-2" />
            <p className="font-medium text-foreground">Aucune échéance dans cette période</p>
            <p className="text-sm text-muted-foreground mt-1">Élargissez la fenêtre ou ajoutez des dates aux CI.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {['CI / Contrat', 'Type', 'Date', 'Jours restants', 'Sévérité'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr
                  key={`${item.ci_id}-${item.deadline_type}-${item.deadline_date}-${i}`}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    {item.ci_id ? (
                      <button
                        onClick={() => navigate(`/ci/${item.ci_id}`)}
                        className="font-medium text-brand hover:underline text-left"
                      >
                        {item.ci_name}
                      </button>
                    ) : (
                      <span className="font-medium">{item.ci_name}</span>
                    )}
                    {item.ci_type && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({item.ci_type === 'hardware' ? 'Matériel' : 'Logiciel'})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="muted">{item.deadline_label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(item.deadline_date)}</td>
                  <td className="px-4 py-3"><DaysChip days={item.days_remaining} /></td>
                  <td className="px-4 py-3">
                    <Badge variant={SEV_VARIANT[item.severity]}>
                      {item.severity === 'critical' ? 'Critique' : item.severity === 'warning' ? 'Attention' : 'Info'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
