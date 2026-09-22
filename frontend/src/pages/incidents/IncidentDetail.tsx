import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Flame, AlertTriangle, AlertCircle, Info,
  MessageSquare, Link2, Send, ChevronRight, ExternalLink, GitBranch, Pencil, Check, X,
} from 'lucide-react'
import {
  getIncident, transitionIncidentStatus, addIncidentComment, updateIncident,
} from '@/api/incidents'
import type { IncidentSeverity, IncidentStatus, IncidentHistoryEntry, IncidentComment } from '@/types/api'
import { listUsers } from '@/api/auth'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
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
const STATUS_VARIANT: Record<IncidentStatus, 'danger' | 'warning' | 'success' | 'muted'> = {
  open: 'danger', investigating: 'warning', resolved: 'success', closed: 'muted',
}
const TRANSITIONS: Record<IncidentStatus, { to: IncidentStatus; label: string; variant: 'primary' | 'secondary' | 'danger' | 'ghost' }[]> = {
  open:          [{ to: 'investigating', label: 'Démarrer l\'investigation', variant: 'primary' }, { to: 'resolved', label: 'Marquer résolu', variant: 'secondary' }, { to: 'closed', label: 'Clôturer', variant: 'ghost' }],
  investigating: [{ to: 'resolved', label: 'Marquer résolu', variant: 'primary' }, { to: 'closed', label: 'Clôturer', variant: 'ghost' }],
  resolved:      [{ to: 'closed', label: 'Clôturer', variant: 'primary' }, { to: 'open', label: 'Réouvrir', variant: 'ghost' }],
  closed:        [],
}

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { canWrite } = useAuth()

  const [comment, setComment]           = useState('')
  const [transitioning, setTrans]       = useState<IncidentStatus | null>(null)
  const [editAssignee, setEditAssignee] = useState(false)
  const [assigneeId, setAssigneeId]     = useState('')
  const [editTicket, setEditTicket]     = useState(false)
  const [ticketUrl, setTicketUrl]       = useState('')

  const { data: inc, isLoading } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => getIncident(id!),
    staleTime: 15_000,
  })

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    staleTime: 120_000,
    enabled: editAssignee,
  })

  const commentMut = useMutation({
    mutationFn: (body: string) => addIncidentComment(id!, body),
    onSuccess: () => {
      setComment('')
      qc.invalidateQueries({ queryKey: ['incident', id] })
    },
  })

  const transitionMut = useMutation({
    mutationFn: ({ to, comment }: { to: string; comment?: string }) =>
      transitionIncidentStatus(id!, to, comment),
    onSuccess: () => {
      setTrans(null)
      qc.invalidateQueries({ queryKey: ['incident', id] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['incident-stats'] })
    },
  })

  const assigneeMut = useMutation({
    mutationFn: (aid: string) => updateIncident(id!, { assignee_id: aid || undefined }),
    onSuccess: () => {
      setEditAssignee(false)
      qc.invalidateQueries({ queryKey: ['incident', id] })
    },
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (!inc) return <div className="py-20 text-center text-muted-foreground">Incident introuvable.</div>

  const SevIcon = SEV_ICON[inc.severity]
  const transitions = TRANSITIONS[inc.status] ?? []

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* En-tête */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/incidents')} className="mt-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <SevIcon size={15} className={
              inc.severity === 'critical' ? 'text-red-500' :
              inc.severity === 'high'     ? 'text-orange-500' :
              inc.severity === 'medium'   ? 'text-amber-500' : 'text-blue-400'
            } />
            <Badge variant={SEV_VARIANT[inc.severity]}>{SEV_LABEL[inc.severity]}</Badge>
            <Badge variant={STATUS_VARIANT[inc.status]}>{STATUS_LABEL[inc.status]}</Badge>
          </div>
          <h1 className="text-xl font-semibold text-foreground">{inc.title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Créé le {formatDate(inc.created_at)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Colonne principale */}
        <div className="col-span-2 space-y-4">

          {/* Description */}
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Description</h2>
            {inc.description
              ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{inc.description}</p>
              : <p className="text-sm text-muted-foreground/50 italic">Aucune description.</p>
            }
          </div>

          {/* CIs impactés */}
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <Link2 size={14} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">CIs impactés</h2>
            </div>
            {inc.ci_links && inc.ci_links.length > 0 ? (
              <div className="divide-y">
                {inc.ci_links.map((l) => (
                  <div key={l.ci_id} className="flex items-center justify-between py-2 text-sm">
                    <span
                      className="text-brand hover:underline cursor-pointer"
                      onClick={() => navigate(`/ci/${l.ci_id}`)}
                    >
                      {l.ci_name}
                    </span>
                    <span className="text-xs text-muted-foreground">{l.ci_type === 'hardware' ? 'Matériel' : 'Logiciel'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/50 italic">Aucun CI lié.</p>
            )}
          </div>

          {/* Timeline activité */}
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="flex items-center gap-1.5">
              <MessageSquare size={14} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Activité & historique</h2>
            </div>

            {(() => {
              type TimelineItem =
                | { kind: 'comment'; data: IncidentComment; ts: string }
                | { kind: 'history'; data: IncidentHistoryEntry; ts: string }
                | { kind: 'created'; ts: string }

              const items: TimelineItem[] = [
                { kind: 'created' as const, ts: inc.created_at },
                ...(inc.comments ?? []).map(c => ({ kind: 'comment' as const, data: c, ts: c.created_at })),
                ...(inc.history  ?? []).map(h => ({ kind: 'history' as const, data: h, ts: h.created_at })),
              ].sort((a, b) => a.ts.localeCompare(b.ts))

              const STATUS_FR: Record<string, string> = {
                open: 'Ouvert', investigating: 'En investigation',
                resolved: 'Résolu', closed: 'Clôturé',
              }
              const STATUS_COLOR: Record<string, string> = {
                open: 'bg-red-100 text-red-600',
                investigating: 'bg-amber-100 text-amber-600',
                resolved: 'bg-green-100 text-green-600',
                closed: 'bg-slate-100 text-slate-500',
              }

              return (
                <div className="relative space-y-0">
                  {/* Trait vertical */}
                  <div className="absolute left-3 top-3 bottom-3 w-px bg-border" />

                  {items.map((item, i) => {
                    if (item.kind === 'created') return (
                      <div key="created" className="relative flex gap-3 pb-4">
                        <div className="size-6 shrink-0 rounded-full bg-brand/10 flex items-center justify-center z-10">
                          <GitBranch size={11} className="text-brand" />
                        </div>
                        <p className="text-xs text-muted-foreground pt-1">
                          Incident créé · {formatDate(item.ts)}
                        </p>
                      </div>
                    )

                    if (item.kind === 'history') {
                      const h = item.data
                      return (
                        <div key={h.id} className="relative flex gap-3 pb-4">
                          <div className={`size-6 shrink-0 rounded-full flex items-center justify-center z-10 text-[10px] font-bold ${STATUS_COLOR[h.to_status] ?? 'bg-muted text-muted-foreground'}`}>
                            →
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <p className="text-xs text-foreground">
                              <span className="font-medium">{h.author_name ?? 'Système'}</span>
                              {' '}a changé le statut{' '}
                              <span className="font-medium">{STATUS_FR[h.from_status] ?? h.from_status}</span>
                              {' → '}
                              <span className={`font-semibold px-1.5 py-0.5 rounded-full text-[10px] ${STATUS_COLOR[h.to_status] ?? ''}`}>
                                {STATUS_FR[h.to_status] ?? h.to_status}
                              </span>
                            </p>
                            {h.comment && (
                              <p className="text-xs text-muted-foreground mt-1 italic">"{h.comment}"</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(h.created_at)}</p>
                          </div>
                        </div>
                      )
                    }

                    const c = item.data
                    return (
                      <div key={c.id} className="relative flex gap-3 pb-4">
                        <div className="size-6 shrink-0 rounded-full bg-brand/10 flex items-center justify-center text-[9px] font-bold text-brand z-10">
                          {(c.author_name ?? 'U').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-xs font-medium text-foreground">{c.author_name ?? 'Utilisateur'}</span>
                            <span className="text-[10px] text-muted-foreground">{formatDate(c.created_at)}</span>
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{c.body}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {canWrite && (
              <div className="flex gap-2 pt-2 border-t border-[hsl(var(--border))]">
                <textarea
                  className="flex-1 rounded border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-none"
                  rows={2}
                  placeholder="Ajouter un commentaire… (Ctrl+Entrée pour envoyer)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && comment.trim()) {
                      commentMut.mutate(comment.trim())
                    }
                  }}
                />
                <button
                  disabled={!comment.trim() || commentMut.isPending}
                  onClick={() => commentMut.mutate(comment.trim())}
                  className="self-end mb-0.5 p-2 rounded bg-brand text-white disabled:opacity-40 hover:bg-brand/90 transition-colors"
                >
                  <Send size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Colonne latérale */}
        <div className="space-y-4">

          {/* Workflow */}
          {canWrite && transitions.length > 0 && (
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Workflow</h2>
              <div className="space-y-2">
                {transitions.map((t) => (
                  <Button
                    key={t.to}
                    variant={t.variant}
                    className="w-full justify-between"
                    disabled={transitionMut.isPending && transitioning === t.to}
                    onClick={() => {
                      setTrans(t.to)
                      transitionMut.mutate({ to: t.to })
                    }}
                  >
                    {t.label}
                    <ChevronRight size={14} />
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Méta */}
          <div className="rounded-xl border bg-card p-4 space-y-3 text-sm">
            <h2 className="font-semibold text-foreground">Détails</h2>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statut</span>
                <Badge variant={STATUS_VARIANT[inc.status]}>{STATUS_LABEL[inc.status]}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sévérité</span>
                <Badge variant={SEV_VARIANT[inc.severity]}>{SEV_LABEL[inc.severity]}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Assigné à</span>
                {editAssignee ? (
                  <select
                    className="text-xs rounded border border-[hsl(var(--border))] bg-card px-2 py-1"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    onBlur={() => assigneeMut.mutate(assigneeId)}
                    autoFocus
                  >
                    <option value="">Non assigné</option>
                    {users?.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={`text-foreground ${canWrite ? 'cursor-pointer hover:text-brand' : ''}`}
                    onClick={() => {
                      if (!canWrite) return
                      setAssigneeId(inc.assignee_id ?? '')
                      setEditAssignee(true)
                    }}
                  >
                    {inc.assignee_name ?? <span className="text-muted-foreground/50">—</span>}
                  </span>
                )}
              </div>
              {inc.resolved_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Résolu le</span>
                  <span className="text-foreground">{formatDate(inc.resolved_at)}</span>
                </div>
              )}
              {inc.closed_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Clôturé le</span>
                  <span className="text-foreground">{formatDate(inc.closed_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Ticket externe */}
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ExternalLink size={13} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Ticket externe</h2>
              </div>
              {canWrite && !editTicket && (
                <button
                  onClick={() => { setTicketUrl(inc.external_ticket_url ?? ''); setEditTicket(true) }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>

            {editTicket ? (
              <div className="space-y-2">
                <input
                  type="url"
                  className="w-full rounded border border-[hsl(var(--border))] bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  placeholder="https://jira.example.com/browse/INC-123"
                  value={ticketUrl}
                  onChange={(e) => setTicketUrl(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-1.5 justify-end">
                  <button
                    onClick={() => setEditTicket(false)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground"
                  >
                    <X size={13} />
                  </button>
                  <button
                    onClick={() => {
                      updateIncident(id!, { external_ticket_url: ticketUrl.trim() })
                        .then(() => { setEditTicket(false); qc.invalidateQueries({ queryKey: ['incident', id] }) })
                    }}
                    className="p-1 rounded text-green-600 hover:text-green-700"
                  >
                    <Check size={13} />
                  </button>
                </div>
              </div>
            ) : inc.external_ticket_url ? (
              <a
                href={inc.external_ticket_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-brand hover:underline break-all"
              >
                <ExternalLink size={11} className="shrink-0" />
                {inc.external_ticket_url}
              </a>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">
                {canWrite ? 'Aucun ticket — cliquez sur ✏ pour ajouter.' : 'Aucun ticket lié.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
