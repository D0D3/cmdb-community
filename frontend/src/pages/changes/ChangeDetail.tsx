import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Pencil, Trash2, ChevronRight, Server, Package,
  AlertTriangle, Send, CheckCircle, XCircle, RotateCcw, PlayCircle, Ban,
} from 'lucide-react'
import { getChange, transitionStatus, deleteChange, listComments, addComment } from '@/api/changes'
import type { ChangeRequest, ChangeStatus, ChangeType, ChangePriority, ChangeRisk } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/utils'

// ── Labels & variants ──────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ChangeStatus, string> = {
  draft:            'Brouillon',
  pending_approval: 'En attente d\'approbation',
  approved:         'Approuvée',
  in_progress:      'En cours',
  completed:        'Terminée',
  rejected:         'Rejetée',
  cancelled:        'Annulée',
}
const STATUS_VARIANT: Record<ChangeStatus, 'default' | 'info' | 'success' | 'warning' | 'danger' | 'muted'> = {
  draft:            'muted',
  pending_approval: 'warning',
  approved:         'info',
  in_progress:      'info',
  completed:        'success',
  rejected:         'danger',
  cancelled:        'muted',
}
const TYPE_LABEL: Record<ChangeType, string>   = { normal: 'Normal', standard: 'Standard', emergency: 'Urgent' }
const TYPE_VARIANT: Record<ChangeType, 'default' | 'info' | 'danger'> = { normal: 'default', standard: 'info', emergency: 'danger' }
const PRIORITY_LABEL: Record<ChangePriority, string> = { low: 'Faible', medium: 'Moyenne', high: 'Haute', critical: 'Critique' }
const PRIORITY_VARIANT: Record<ChangePriority, 'default' | 'info' | 'warning' | 'danger'> = {
  low: 'default', medium: 'info', high: 'warning', critical: 'danger',
}
const RISK_LABEL: Record<ChangeRisk, string>   = { low: 'Faible', medium: 'Moyen', high: 'Élevé' }
const RISK_VARIANT: Record<ChangeRisk, 'default' | 'warning' | 'danger'> = { low: 'default', medium: 'warning', high: 'danger' }
const IMPACT_VARIANT: Record<string, 'default' | 'warning' | 'danger'> = { info: 'default', affected: 'warning', critical: 'danger' }
const IMPACT_LABEL: Record<string, string> = { info: 'Info', affected: 'Affecté', critical: 'Critique' }

// ── Transitions disponibles depuis chaque statut ───────────────────────────────

const TRANSITIONS: Record<ChangeStatus, { status: ChangeStatus; label: string; icon: React.ElementType; variant: 'primary' | 'secondary' | 'ghost' | 'danger' }[]> = {
  draft:            [
    { status: 'pending_approval', label: 'Soumettre',  icon: Send,        variant: 'primary'   },
    { status: 'cancelled',        label: 'Annuler',    icon: Ban,         variant: 'danger'    },
  ],
  pending_approval: [
    { status: 'approved',         label: 'Approuver', icon: CheckCircle, variant: 'primary'   },
    { status: 'rejected',         label: 'Rejeter',   icon: XCircle,     variant: 'danger'    },
    { status: 'draft',            label: 'Reprendre', icon: RotateCcw,   variant: 'secondary' },
  ],
  approved:         [
    { status: 'in_progress',      label: 'Démarrer',  icon: PlayCircle,  variant: 'primary'   },
    { status: 'cancelled',        label: 'Annuler',   icon: Ban,         variant: 'danger'    },
  ],
  in_progress:      [
    { status: 'completed',        label: 'Terminer',  icon: CheckCircle, variant: 'primary'   },
    { status: 'cancelled',        label: 'Annuler',   icon: Ban,         variant: 'danger'    },
  ],
  completed:  [],
  rejected:   [{ status: 'draft', label: 'Remettre en brouillon', icon: RotateCcw, variant: 'secondary' }],
  cancelled:  [{ status: 'draft', label: 'Remettre en brouillon', icon: RotateCcw, variant: 'secondary' }],
}

// ── Composant principal ────────────────────────────────────────────────────────

export default function ChangeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { canWrite, canDelete } = useAuth()
  const [commentText, setCommentText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: cr, isLoading } = useQuery({
    queryKey: ['change', id],
    queryFn: () => getChange(id!),
    enabled: !!id,
  })

  const { data: comments = [] } = useQuery({
    queryKey: ['change-comments', id],
    queryFn: () => listComments(id!),
    enabled: !!id,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['change', id] })
    qc.invalidateQueries({ queryKey: ['change-comments', id] })
    qc.invalidateQueries({ queryKey: ['changes'] })
    qc.invalidateQueries({ queryKey: ['change-stats'] })
  }

  const transitionMut = useMutation({
    mutationFn: ({ status, comment }: { status: ChangeStatus; comment?: string }) =>
      transitionStatus(id!, status, comment),
    onSuccess: invalidate,
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteChange(id!),
    onSuccess: () => navigate('/changes'),
  })

  const commentMut = useMutation({
    mutationFn: (content: string) => addComment(id!, content),
    onSuccess: () => {
      setCommentText('')
      qc.invalidateQueries({ queryKey: ['change-comments', id] })
    },
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>
  if (!cr) return <p className="text-muted-foreground">RFC introuvable.</p>

  const actions = TRANSITIONS[cr.status] ?? []

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate('/changes')} className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Changements
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium truncate max-w-xs">{cr.title}</span>
      </div>

      {/* Titre + badges + actions */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">{cr.title}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge variant={STATUS_VARIANT[cr.status]}>{STATUS_LABEL[cr.status]}</Badge>
            <Badge variant={TYPE_VARIANT[cr.change_type]}>{TYPE_LABEL[cr.change_type]}</Badge>
            <Badge variant={PRIORITY_VARIANT[cr.priority]}>{PRIORITY_LABEL[cr.priority]}</Badge>
            <Badge variant={RISK_VARIANT[cr.risk]}>Risque {RISK_LABEL[cr.risk]}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {canWrite && actions.map(a => {
            const Icon = a.icon
            return (
              <Button
                key={a.status}
                variant={a.variant}
                size="sm"
                disabled={transitionMut.isPending}
                onClick={() => transitionMut.mutate({ status: a.status })}
              >
                <Icon className="w-3.5 h-3.5 mr-1" /> {a.label}
              </Button>
            )
          })}
          {['draft', 'cancelled', 'rejected'].includes(cr.status) && (
            <>
              {canWrite && (
                <Button variant="secondary" size="sm" onClick={() => navigate(`/changes/${id}/edit`)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Modifier
                </Button>
              )}
              {canDelete && (!confirmDelete ? (
                <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Supprimer
                </Button>
              ) : (
                <Button variant="danger" size="sm" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
                  Confirmer la suppression
                </Button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Grille infos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title="Informations">
          <Row label="Demandeur"   value={cr.requester_name ?? '—'} />
          <Row label="Approbateur" value={cr.approver_name  ?? '—'} />
          <Row label="Créée le"    value={formatDateTime(cr.created_at)} />
          <Row label="Modifiée le" value={formatDateTime(cr.updated_at)} />
        </Card>

        <Card title="Planification">
          <Row label="Début prévu" value={cr.planned_start ? formatDateTime(cr.planned_start) : '—'} />
          <Row label="Fin prévue"  value={cr.planned_end   ? formatDateTime(cr.planned_end)   : '—'} />
          <Row label="Début réel"  value={cr.actual_start  ? formatDateTime(cr.actual_start)  : '—'} />
          <Row label="Fin réelle"  value={cr.actual_end    ? formatDateTime(cr.actual_end)    : '—'} />
        </Card>
      </div>

      {/* Description */}
      {cr.description && (
        <Card title="Description">
          <p className="text-sm text-foreground whitespace-pre-wrap">{cr.description}</p>
        </Card>
      )}

      {/* Plan de retour arrière */}
      {cr.rollback_plan && (
        <Card title="Plan de retour arrière">
          <p className="text-sm text-foreground whitespace-pre-wrap">{cr.rollback_plan}</p>
        </Card>
      )}

      {/* CIs impactés */}
      {cr.ci_links.length > 0 && (
        <Card title={`CIs impactés (${cr.ci_links.length})`}>
          <div className="space-y-2">
            {cr.ci_links.map(lnk => {
              const Icon = lnk.ci_type === 'hardware' ? Server : Package
              return (
                <div key={lnk.ci_id} className="flex items-center justify-between py-1.5 border-b border-[hsl(var(--border))] last:border-0">
                  <Link
                    to={`/ci/${lnk.ci_id}`}
                    className="flex items-center gap-2 text-sm hover:text-brand transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{lnk.ci_name ?? lnk.ci_id}</span>
                    {lnk.ci_status && (
                      <Badge variant="muted">{lnk.ci_status}</Badge>
                    )}
                  </Link>
                  <Badge variant={IMPACT_VARIANT[lnk.impact]}>{IMPACT_LABEL[lnk.impact]}</Badge>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Notes */}
      {cr.notes && (
        <Card title="Notes">
          <p className="text-sm text-foreground whitespace-pre-wrap">{cr.notes}</p>
        </Card>
      )}

      {/* Commentaires */}
      <Card title={`Commentaires (${comments.length})`}>
        <div className="space-y-3 mb-4">
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun commentaire.</p>
          )}
          {comments.map(c => (
            <div key={c.id} className="bg-muted/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-foreground">{c.author_name ?? 'Système'}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="Ajouter un commentaire…"
            rows={2}
            className="flex-1 rounded border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
          <Button
            size="sm"
            disabled={!commentText.trim() || commentMut.isPending}
            onClick={() => commentMut.mutate(commentText.trim())}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </Card>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  )
}
