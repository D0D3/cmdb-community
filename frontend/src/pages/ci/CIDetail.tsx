import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Server, Package, Calendar, GitBranch, Pencil, Trash2, Loader2, ShieldAlert, ExternalLink, Network, Users, Plus, History, ChevronRight, Share2, X as XIcon } from 'lucide-react'
import CIGraph from '@/components/ci/CIGraph'
import AddRelationModal from '@/components/ci/AddRelationModal'
import { getCI, listRelations, addRelation, deleteRelation, listMaintenance, deleteCI, getCIGraph } from '@/api/ci'
import { getCISegments, assignSegment, unassignSegment, listSegments } from '@/api/network'
import { listCves, updateCICveStatus } from '@/api/cve'
import {
  listKeyUsers, addKeyUser, removeKeyUser, patchKeyUser, searchUsers,
  type CIKeyUserOut, type UserSearchResult, type AddKeyUserPayload,
} from '@/api/keyusers'
import { listCIAudit, type AuditLogEntry } from '@/api/audit'
import type { CIStatus, CICriticality, Cve, CICveStatus, NetworkSegment } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { formatDate, formatDateTime, cn } from '@/lib/utils'

const STATUS_LABELS: Record<CIStatus, string> = {
  ordered: 'Commandé', in_stock: 'En stock', in_service: 'En service',
  maintenance: 'Maintenance', retired: 'Retiré',
}
const STATUS_VARIANT: Record<CIStatus, 'success' | 'info' | 'muted' | 'warning' | 'danger'> = {
  ordered: 'info', in_stock: 'muted', in_service: 'success', maintenance: 'warning', retired: 'danger',
}
const CRIT_LABELS: Record<CICriticality, string> = {
  critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Faible',
}
const CRIT_VARIANT: Record<CICriticality, 'danger' | 'warning' | 'info' | 'muted'> = {
  critical: 'danger', high: 'warning', medium: 'info', low: 'muted',
}
const RELATION_LABELS: Record<string, string> = {
  hosted_on: 'Hébergé sur', depends_on: 'Dépend de', assigned_to: 'Assigné à', connected_to: 'Connecté à',
}
const MAINT_KIND_LABELS: Record<string, string> = {
  maintenance: 'Maintenance', update: 'Mise à jour', patch: 'Patch', audit: 'Audit',
}

type Tab = 'general' | 'relations' | 'maintenance' | 'cves' | 'graph' | 'network' | 'referents' | 'history'

const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: 'Création', update: 'Modification', delete: 'Suppression',
}
const AUDIT_ACTION_COLOR: Record<string, string> = {
  create: 'text-green-600', update: 'text-blue-600', delete: 'text-red-600',
}
const FIELD_LABELS: Record<string, string> = {
  name: 'Nom', description: 'Description', status: 'Statut',
  criticality: 'Criticité', team: 'Équipe', location: 'Emplacement',
}

function HistoryTab({ ciId }: { ciId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-ci', ciId],
    queryFn: () => listCIAudit(ciId, { limit: 100 }),
  })

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
  if (!data?.items.length) return (
    <div className="py-12 text-center">
      <History size={28} className="mx-auto text-muted-foreground/30 mb-2" />
      <p className="text-sm text-muted-foreground">Aucun historique pour ce CI.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {data.items.map((entry: AuditLogEntry) => {
        const hasChanges = entry.changes && Object.keys(entry.changes).length > 0
        return (
          <div key={entry.id} className="rounded-lg border bg-card px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${AUDIT_ACTION_COLOR[entry.action] ?? 'text-foreground'}`}>
                    {AUDIT_ACTION_LABEL[entry.action] ?? entry.action}
                  </span>
                  <span className="text-xs text-muted-foreground">par</span>
                  <span className="text-sm text-foreground">
                    {entry.performed_by_name ?? 'Système'}
                  </span>
                </div>
                {hasChanges && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(entry.changes!).map(([field, diff]) => (
                      <span key={field} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{FIELD_LABELS[field] ?? field} :</span>
                        <span className="rounded bg-red-100 px-1 text-red-700 line-through">{diff.before ?? '—'}</span>
                        <ChevronRight size={10} />
                        <span className="rounded bg-green-100 px-1 text-green-700">{diff.after}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                {new Date(entry.created_at).toLocaleString('fr-FR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const SEV_VARIANT: Record<string, 'danger' | 'warning' | 'info' | 'muted'> = {
  CRITICAL: 'danger', HIGH: 'warning', MEDIUM: 'info', LOW: 'muted',
}
const SEV_LABELS: Record<string, string> = {
  CRITICAL: 'Critique', HIGH: 'Haute', MEDIUM: 'Moyenne', LOW: 'Faible',
}
const CVESTATUS_LABELS: Record<CICveStatus, string> = {
  open: 'Ouvert', acknowledged: 'Reconnu', mitigated: 'Mitigé', not_affected: 'Non concerné',
}
const CVESTATUS_VARIANT: Record<CICveStatus, 'danger' | 'warning' | 'info' | 'muted'> = {
  open: 'danger', acknowledged: 'warning', mitigated: 'info', not_affected: 'muted',
}

function CveRow({ cve, ciId }: { cve: Cve; ciId: string }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<CICveStatus | null>(null)

  async function handleStatusChange(next: CICveStatus) {
    setStatus(next)
    await updateCICveStatus(cve.id, ciId, next)
    qc.invalidateQueries({ queryKey: ['ci-cves', ciId] })
  }

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <a
          href={cve.source_url ?? `https://nvd.nist.gov/vuln/detail/${cve.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 font-mono text-xs font-medium text-brand hover:underline"
        >
          {cve.id}
          <ExternalLink size={10} className="shrink-0" />
        </a>
      </td>
      <td className="px-4 py-3">
        {cve.cvss_severity
          ? <Badge variant={SEV_VARIANT[cve.cvss_severity] ?? 'muted'}>{SEV_LABELS[cve.cvss_severity] ?? cve.cvss_severity}</Badge>
          : <span className="text-xs text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-foreground max-w-xs">
        <span className="line-clamp-2">{cve.summary ?? '—'}</span>
      </td>
      <td className="px-4 py-3">
        {cve.is_kev && <Badge variant="danger">KEV</Badge>}
      </td>
      <td className="px-4 py-3">
        <select
          value={status ?? 'open'}
          onChange={(e) => handleStatusChange(e.target.value as CICveStatus)}
          className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {(Object.entries(CVESTATUS_LABELS) as [CICveStatus, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </td>
    </tr>
  )
}

const KU_ROLE_LABELS: Record<CIKeyUserOut['role'], string> = {
  key_user: 'Key User', owner: 'Propriétaire', referent: 'Référent', local_admin: 'Admin local',
}

function KeyUserRow({
  ku, onRemove, onPatch,
}: { ku: CIKeyUserOut; onRemove: () => void; onPatch: (d: Partial<CIKeyUserOut>) => void }) {
  const [editing, setEditing] = useState(false)
  const [role, setRole] = useState<CIKeyUserOut['role']>(ku.role)
  const { canWrite, canDelete } = useAuth()

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
            {ku.display_name[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{ku.display_name}</p>
            <p className="text-xs text-muted-foreground truncate">{ku.email}</p>
          </div>
          <span className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
            ku.user_type === 'entra' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-muted text-muted-foreground',
          )}>
            {ku.user_type === 'entra' ? 'EntraID' : 'Local'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <select
            value={role}
            onChange={e => setRole(e.target.value as CIKeyUserOut['role'])}
            onBlur={() => { onPatch({ role }); setEditing(false) }}
            autoFocus
            className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {(Object.entries(KU_ROLE_LABELS) as [CIKeyUserOut['role'], string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        ) : canWrite ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-accent transition-colors"
          >
            <Badge variant="info">{KU_ROLE_LABELS[ku.role]}</Badge>
            <Pencil size={11} className="text-muted-foreground" />
          </button>
        ) : (
          <Badge variant="info">{KU_ROLE_LABELS[ku.role]}</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {[ku.job_title, ku.department].filter(Boolean).join(' · ') || '—'}
      </td>
      <td className="px-4 py-3 text-right">
        {canDelete && (
          <button
            onClick={onRemove}
            className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  )
}

function ReferentsTab({ ciId }: { ciId: string }) {
  const qc = useQueryClient()
  const { canWrite } = useAuth()
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null)
  const [role, setRole] = useState<CIKeyUserOut['role']>('key_user')

  const { data: keyUsers = [], isLoading } = useQuery({
    queryKey: ['ci-key-users', ciId],
    queryFn: () => listKeyUsers(ciId),
  })

  const { data: searchResults = [] } = useQuery({
    queryKey: ['user-search', search],
    queryFn: () => searchUsers(search),
    enabled: search.length >= 2,
    staleTime: 30_000,
  })

  const addMut = useMutation({
    mutationFn: (payload: AddKeyUserPayload) => addKeyUser(ciId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ci-key-users', ciId] })
      setSelectedUser(null)
      setSearch('')
      setRole('key_user')
    },
  })

  const removeMut = useMutation({
    mutationFn: (kuId: string) => removeKeyUser(ciId, kuId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ci-key-users', ciId] }),
  })

  const patchMut = useMutation({
    mutationFn: ({ kuId, data }: { kuId: string; data: { role?: CIKeyUserOut['role'] } }) =>
      patchKeyUser(ciId, kuId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ci-key-users', ciId] }),
  })

  const handleAdd = () => {
    if (!selectedUser) return
    const base = { role, user_type: selectedUser.source } as const
    let payload: AddKeyUserPayload
    if (selectedUser.source === 'local') {
      payload = { ...base, local_user_id: selectedUser.source_id }
    } else if (selectedUser.source === 'ldap') {
      payload = {
        ...base,
        ldap_dn: selectedUser.source_id,
        ldap_uid: selectedUser.ldap_uid,
        ldap_email: selectedUser.email,
        ldap_display_name: selectedUser.display_name,
        ldap_job_title: selectedUser.job_title,
        ldap_department: selectedUser.department,
      }
    } else {
      payload = {
        ...base,
        entra_oid: selectedUser.source_id,
        entra_email: selectedUser.email,
        entra_display_name: selectedUser.display_name,
        entra_job_title: selectedUser.job_title,
        entra_department: selectedUser.department,
      }
    }
    addMut.mutate(payload)
  }

  return (
    <div className="space-y-4">
      {/* Ajout */}
      {canWrite && <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-medium">Ajouter un référent</h3>
        <div className="relative mb-3">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Rechercher par nom ou e-mail (local ou EntraID)…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {showDropdown && search.length >= 2 && searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-lg">
              {searchResults.map(u => (
                <button
                  key={`${u.source}:${u.source_id}`}
                  onMouseDown={() => { setSelectedUser(u); setSearch(u.display_name); setShowDropdown(false) }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent text-sm"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                    {u.display_name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{u.display_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.email}{u.department ? ` · ${u.department}` : ''}
                    </p>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                    u.source === 'entra' ? 'bg-blue-100 text-blue-700' :
                    u.source === 'ldap'  ? 'bg-violet-100 text-violet-700' :
                                           'bg-muted text-muted-foreground',
                  )}>
                    {u.source === 'entra' ? 'EntraID' : u.source === 'ldap' ? 'LDAP' : 'Local'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedUser && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 min-w-0 items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="font-medium truncate">{selectedUser.display_name}</span>
              <span className="text-xs text-muted-foreground truncate">{selectedUser.email}</span>
            </div>
            <select
              value={role}
              onChange={e => setRole(e.target.value as CIKeyUserOut['role'])}
              className="rounded-md border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {(Object.entries(KU_ROLE_LABELS) as [CIKeyUserOut['role'], string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={addMut.isPending}
              className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              <Plus size={14} />
              {addMut.isPending ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        )}
      </div>}

      {/* Liste des référents */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : keyUsers.length === 0 ? (
          <div className="py-10 text-center">
            <Users size={28} className="mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Aucun référent défini pour ce CI.</p>
            <p className="text-xs text-muted-foreground mt-1">Recherchez un utilisateur ci-dessus pour en ajouter un.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {['Utilisateur', 'Rôle', 'Service / Poste', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keyUsers.map(ku => (
                <KeyUserRow
                  key={ku.id}
                  ku={ku}
                  onRemove={() => removeMut.mutate(ku.id)}
                  onPatch={data => patchMut.mutate({ kuId: ku.id, data })}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-brand text-brand'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      <Icon size={14} />
      {label}
    </button>
  )
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex px-4 py-3 text-sm border-b last:border-0">
      <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
      <span>{value ?? <span className="text-muted-foreground">—</span>}</span>
    </div>
  )
}

function DeleteModal({ ciName, onConfirm, onCancel, isPending }: {
  ciName: string; onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 mb-4">
          <Trash2 size={20} className="text-red-600" />
        </div>
        <h2 className="text-base font-semibold text-foreground">Supprimer ce CI ?</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{ciName}</span> sera supprimé définitivement.
          Cette action est irréversible.
        </p>
        <div className="mt-5 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isPending && <Loader2 size={13} className="animate-spin" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CIDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { canWrite, canDelete } = useAuth()
  const [tab, setTab] = useState<Tab>('general')
  const [showDelete, setShowDelete] = useState(false)
  const [showAddRelation, setShowAddRelation] = useState(false)
  const [graphDepth, setGraphDepth] = useState<1 | 2 | 3 | 4 | 5>(3)

  const deleteMutation = useMutation({
    mutationFn: () => deleteCI(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ci'] })
      navigate('/ci', { replace: true })
    },
  })

  const deleteRelMutation = useMutation({
    mutationFn: (relId: string) => deleteRelation(id!, relId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ci', id, 'relations'] })
      qc.invalidateQueries({ queryKey: ['ci-graph', id] })
    },
  })

  const { data: ci, isLoading } = useQuery({
    queryKey: ['ci', id],
    queryFn: () => getCI(id!),
    enabled: !!id,
  })

  const { data: relations, isLoading: relLoading } = useQuery({
    queryKey: ['ci', id, 'relations'],
    queryFn: () => listRelations(id!),
    enabled: !!id && tab === 'relations',
  })

  const { data: maintenance, isLoading: maintLoading } = useQuery({
    queryKey: ['ci', id, 'maintenance'],
    queryFn: () => listMaintenance(id!),
    enabled: !!id && tab === 'maintenance',
  })

  const { data: cveList, isLoading: cveLoading } = useQuery({
    queryKey: ['ci-cves', id],
    queryFn: () => listCves({ ci_id: id, limit: 100 }),
    enabled: !!id && tab === 'cves',
    staleTime: 60_000,
  })

  // Compteur de CVEs ouvertes — toujours chargé pour afficher le badge sur l'onglet
  const { data: cveCount } = useQuery({
    queryKey: ['ci-cves-count', id],
    queryFn: () => listCves({ ci_id: id, limit: 1 }),
    enabled: !!id && !!ci && ci.ci_type === 'software',
    staleTime: 120_000,
  })

  const { data: graphData, isLoading: graphLoading } = useQuery({
    queryKey: ['ci-graph', id, graphDepth],
    queryFn: () => getCIGraph(id!, graphDepth),
    enabled: !!id && tab === 'graph',
    staleTime: 60_000,
  })

  const { data: keyUsersCount } = useQuery({
    queryKey: ['ci-key-users', id],
    queryFn: () => listKeyUsers(id!),
    enabled: !!id,
    staleTime: 120_000,
    select: data => data.length,
  })

  const { data: ciSegments = [], isLoading: segLoading } = useQuery({
    queryKey: ['ci-segments', id],
    queryFn: () => getCISegments(id!),
    enabled: !!id && tab === 'network',
    staleTime: 60_000,
  })
  const { data: allSegments = [] } = useQuery({
    queryKey: ['network-segments'],
    queryFn: listSegments,
    enabled: tab === 'network',
    staleTime: 60_000,
  })
  const assignedIds = new Set(ciSegments.map(s => s.id))
  const availableSegments = allSegments.filter(s => !assignedIds.has(s.id))

  const assignMut = useMutation({
    mutationFn: (segId: string) => assignSegment(id!, segId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ci-segments', id] }),
  })
  const unassignMut = useMutation({
    mutationFn: (segId: string) => unassignSegment(id!, segId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ci-segments', id] }),
  })

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>

  if (!ci) return (
    <div className="py-12 text-center">
      <p className="text-muted-foreground">CI introuvable.</p>
      <Button variant="ghost" className="mt-4" onClick={() => navigate('/ci')}>Retour à la liste</Button>
    </div>
  )

  const hw = ci.hardware_details
  const sw = ci.software_details

  return (
    <div className="max-w-4xl space-y-5">
      {showDelete && (
        <DeleteModal
          ciName={ci.name}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDelete(false)}
        />
      )}

      {showAddRelation && (
        <AddRelationModal
          ciId={ci.id}
          ciName={ci.name}
          onClose={() => setShowAddRelation(false)}
        />
      )}

      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> Retour
      </button>

      {/* En-tête */}
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              {ci.ci_type === 'hardware' ? <Server size={20} className="text-muted-foreground" /> : <Package size={20} className="text-muted-foreground" />}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">{ci.name}</h1>
              {ci.description && <p className="text-sm text-muted-foreground mt-0.5">{ci.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={STATUS_VARIANT[ci.status as CIStatus]}>{STATUS_LABELS[ci.status as CIStatus] ?? ci.status}</Badge>
            <Badge variant={CRIT_VARIANT[ci.criticality as CICriticality]}>{CRIT_LABELS[ci.criticality as CICriticality] ?? ci.criticality}</Badge>
            {canWrite && (
              <Link
                to={`/ci/${ci.id}/edit`}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Pencil size={13} />
                Éditer
              </Link>
            )}
            {canDelete && (
              <button
                onClick={() => setShowDelete(true)}
                className="flex items-center gap-1.5 rounded-md border border-red-200 bg-card px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} />
                Supprimer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div>
        <div className="flex border-b">
          <TabBtn active={tab === 'general'}     onClick={() => setTab('general')}     icon={Server}     label="Général" />
          <TabBtn active={tab === 'relations'}   onClick={() => setTab('relations')}   icon={GitBranch}  label="Relations" />
          <TabBtn active={tab === 'maintenance'} onClick={() => setTab('maintenance')} icon={Calendar}   label="Maintenances" />
          <TabBtn active={tab === 'graph'}       onClick={() => setTab('graph')}       icon={Network}    label="Carte" />
          <TabBtn active={tab === 'network'}     onClick={() => setTab('network')}     icon={Share2}     label="Réseau" />
          <button
            onClick={() => setTab('referents')}
            className={[
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              tab === 'referents'
                ? 'border-brand text-brand'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <Users size={14} />
            Référents
            {(keyUsersCount ?? 0) > 0 && (
              <span className={cn(
                'ml-0.5 flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                tab === 'referents' ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground',
              )}>
                {keyUsersCount}
              </span>
            )}
          </button>
          {ci.ci_type === 'software' && (
            <button
              onClick={() => setTab('cves')}
              className={[
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tab === 'cves'
                  ? 'border-brand text-brand'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <ShieldAlert size={14} />
              Vulnérabilités
              {(cveCount?.total ?? 0) > 0 && (
                <span className={cn(
                  'ml-0.5 flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                  tab === 'cves' ? 'bg-brand text-brand-foreground' : 'bg-red-100 text-red-700',
                )}>
                  {cveCount!.total > 99 ? '99+' : cveCount!.total}
                </span>
              )}
            </button>
          )}
          <TabBtn active={tab === 'history'} onClick={() => setTab('history')} icon={History} label="Historique" />
        </div>

        <div className="mt-4">
          {/* Général */}
          {tab === 'general' && (
            <div className="rounded-lg border bg-card">
              <Field label="Type"        value={ci.ci_type === 'hardware' ? 'Matériel' : 'Logiciel'} />
              <Field label="Équipe"      value={ci.team} />
              <Field label="Emplacement" value={ci.location} />
              <Field label="Créé le"     value={formatDateTime(ci.created_at)} />
              <Field label="Modifié le"  value={formatDateTime(ci.updated_at)} />
              {hw && <>
                {hw.hw_subtype && <Field label="Sous-type" value={{
                  server: 'Serveur', vm: 'Machine virtuelle', workstation: 'Poste de travail',
                  terminal_server: 'Serveur de terminaux', network_device: 'Équipement réseau',
                }[hw.hw_subtype] ?? hw.hw_subtype} />}
                <Field label="Fabricant"    value={hw.manufacturer} />
                <Field label="Modèle"       value={hw.model} />
                <Field label="N° série"     value={hw.serial_number} />
                <Field label="Date d'achat" value={formatDate(hw.purchase_date)} />
                <Field label="Fin garantie" value={formatDate(hw.warranty_end_date)} />
                <Field label="Fournisseur"  value={hw.supplier} />
              </>}
              {sw && <>
                <Field label="Éditeur"      value={sw.vendor} />
                <Field label="Produit"      value={sw.product} />
                <Field label="Version"      value={sw.version} />
                <Field label="Type licence" value={sw.license_type} />
                <Field label="Fin licence"  value={formatDate(sw.license_end_date)} />
                <Field label="EOL"          value={formatDate(sw.eol_date)} />
                <Field label="Installations" value={sw.install_count?.toString()} />
                {/* CPE */}
                <div className="flex px-4 py-3 text-sm border-b last:border-0 items-start gap-2">
                  <span className="w-40 shrink-0 text-muted-foreground">CPE</span>
                  {sw.cpe_name ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground break-all">
                        {sw.cpe_name}
                      </code>
                      <a
                        href={`https://nvd.nist.gov/products/cpe/search/results?namingFormat=2.3&keyword=${encodeURIComponent(sw.cpe_name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Voir sur NVD"
                        className="shrink-0 text-muted-foreground hover:text-brand transition-colors"
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                {/* OSV */}
                <div className="flex px-4 py-3 text-sm border-b last:border-0 items-start gap-2">
                  <span className="w-40 shrink-0 text-muted-foreground">OSV Ecosystem</span>
                  {sw.osv_ecosystem ? (
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                      {sw.osv_ecosystem}
                    </code>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex px-4 py-3 text-sm border-b last:border-0 items-start gap-2">
                  <span className="w-40 shrink-0 text-muted-foreground">OSV Package</span>
                  {sw.osv_package ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground break-all">
                        {sw.osv_package}
                      </code>
                      <a
                        href={`https://osv.dev/list?ecosystem=${encodeURIComponent(sw.osv_ecosystem ?? '')}&q=${encodeURIComponent(sw.osv_package)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Voir sur OSV"
                        className="shrink-0 text-muted-foreground hover:text-brand transition-colors"
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </>}
            </div>
          )}

          {/* Relations */}
          {tab === 'relations' && (
            <div className="space-y-3">
              {canWrite && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowAddRelation(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-brand text-brand-foreground text-sm font-medium px-3 py-2 hover:opacity-90 transition-opacity"
                  >
                    <Plus size={14} />
                    Ajouter une relation
                  </button>
                </div>
              )}
              <div className="rounded-lg border bg-card overflow-hidden">
                {relLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : !relations?.length ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Aucune relation enregistrée.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {['Source', 'Type', 'Cible', 'Créé le', ''].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {relations.map((r) => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <Link to={`/ci/${r.source_ci_id}`} className="font-medium text-foreground hover:text-brand transition-colors">
                              {r.source_ci_name}
                            </Link>
                          </td>
                          <td className="px-4 py-3"><Badge variant="muted">{RELATION_LABELS[r.relation_type] ?? r.relation_type}</Badge></td>
                          <td className="px-4 py-3">
                            <Link to={`/ci/${r.target_ci_id}`} className="font-medium text-foreground hover:text-brand transition-colors">
                              {r.target_ci_name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                          <td className="px-4 py-3 text-right">
                            {canDelete && (
                              <button
                                onClick={() => deleteRelMutation.mutate(r.id)}
                                disabled={deleteRelMutation.isPending}
                                className="text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
                                title="Supprimer la relation"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Maintenances */}
          {tab === 'maintenance' && (
            <div className="rounded-lg border bg-card overflow-hidden">
              {maintLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : !maintenance?.length ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Aucune maintenance planifiée.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {['Titre', 'Type', 'Prochaine échéance', 'Statut'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {maintenance.map((m) => (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{m.title}</td>
                        <td className="px-4 py-3"><Badge variant="info">{MAINT_KIND_LABELS[m.kind] ?? m.kind}</Badge></td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(m.next_due_date)}</td>
                        <td className="px-4 py-3"><Badge variant={m.is_active ? 'success' : 'muted'}>{m.is_active ? 'Actif' : 'Inactif'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Carte des dépendances */}
          {tab === 'graph' && (
            <div className="relative">
              {graphLoading ? (
                <div className="flex justify-center py-16"><Spinner /></div>
              ) : graphData ? (
                <CIGraph
                  data={graphData}
                  rootId={id!}
                  depth={graphDepth}
                  onDepthChange={setGraphDepth}
                />
              ) : null}
            </div>
          )}

          {/* Segments réseau */}
          {tab === 'network' && (
            <div className="space-y-4">
              {segLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : ciSegments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed gap-2 text-center">
                  <Share2 size={24} className="text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Aucun segment réseau assigné à ce CI.</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {ciSegments.map((seg: NetworkSegment) => (
                    <div key={seg.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: seg.resolved_color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{seg.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {seg.type.toUpperCase()}
                          {seg.vlan_id != null && ` · VLAN ${seg.vlan_id}`}
                          {seg.subnet && ` · ${seg.subnet}`}
                          {seg.description && ` — ${seg.description}`}
                        </p>
                      </div>
                      {canWrite && (
                        <button
                          onClick={() => unassignMut.mutate(seg.id)}
                          disabled={unassignMut.isPending}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Retirer ce segment"
                        >
                          <XIcon size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canWrite && availableSegments.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Ajouter un segment :</p>
                  <div className="flex flex-wrap gap-2">
                    {availableSegments.map((seg: NetworkSegment) => (
                      <button
                        key={seg.id}
                        onClick={() => assignMut.mutate(seg.id)}
                        disabled={assignMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted transition-colors"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: seg.resolved_color }} />
                        {seg.name}
                        <Plus size={11} className="text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Référents */}
          {tab === 'referents' && <ReferentsTab ciId={id!} />}

          {/* Historique */}
          {tab === 'history' && <HistoryTab ciId={id!} />}

          {/* Vulnérabilités */}
          {tab === 'cves' && ci.ci_type === 'software' && (
            <div className="rounded-lg border bg-card overflow-hidden">
              {cveLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : !cveList?.items.length ? (
                <div className="py-10 text-center space-y-2">
                  <ShieldAlert size={28} className="mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {sw?.cpe_name
                      ? 'Aucune CVE détectée pour ce logiciel.'
                      : 'Aucun CPE renseigné — définissez-le pour activer la détection CVE.'}
                  </p>
                  {!sw?.cpe_name && canWrite && (
                    <Link
                      to={`/ci/${ci.id}/edit`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/20 transition-colors"
                    >
                      <Pencil size={13} />
                      Renseigner le CPE
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <div className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
                    {cveList.total} vulnérabilité{cveList.total > 1 ? 's' : ''} détectée{cveList.total > 1 ? 's' : ''}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {['CVE', 'Sévérité', 'Description', 'KEV', 'Statut'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cveList.items.map((cve) => (
                        <CveRow key={cve.id} cve={cve} ciId={id!} />
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
