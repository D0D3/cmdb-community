import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileCheck2, AlertTriangle, Clock, XCircle, ShieldOff, Plus, Pencil, Trash2, X, Server,
} from 'lucide-react'
import { getSLADashboard, createSLA, updateSLA, deleteSLA, type SLAContract } from '@/api/ci'
import type { SLA } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
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

// ── Badge expiration ───────────────────────────────────────────────────────────

function ExpiryBadge({ contract }: { contract: SLAContract }) {
  if (!contract.contract_end_date) {
    return <span className="text-xs text-muted-foreground/50">—</span>
  }
  const d = new Date(contract.contract_end_date).toLocaleDateString('fr-FR')
  const days = contract.days_until_expiry

  if (contract.expiry_status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
        <XCircle size={11} /> Expiré · {d}
      </span>
    )
  }
  if (contract.expiry_status === 'critical') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-medium">
        <AlertTriangle size={11} /> {days}j · {d}
      </span>
    )
  }
  if (contract.expiry_status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">
        <Clock size={11} /> {days}j · {d}
      </span>
    )
  }
  return (
    <span className="text-xs text-muted-foreground">{d}</span>
  )
}

// ── Modal création / édition ───────────────────────────────────────────────────

type SLAFormData = {
  name: string
  provider: string
  level: string
  contract_ref: string
  support_contact: string
  response_time: string
  contract_end_date: string
  notes: string
}

const EMPTY: SLAFormData = {
  name: '', provider: '', level: '', contract_ref: '',
  support_contact: '', response_time: '', contract_end_date: '', notes: '',
}

function SLAModal({
  initial,
  onClose,
}: {
  initial?: SLA | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<SLAFormData>(
    initial
      ? {
          name: initial.name ?? '',
          provider: initial.provider ?? '',
          level: initial.level ?? '',
          contract_ref: initial.contract_ref ?? '',
          support_contact: initial.support_contact ?? '',
          response_time: initial.response_time ?? '',
          contract_end_date: initial.contract_end_date?.slice(0, 10) ?? '',
          notes: initial.notes ?? '',
        }
      : EMPTY,
  )

  const mut = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        provider: form.provider || null,
        level: form.level || null,
        contract_ref: form.contract_ref || null,
        support_contact: form.support_contact || null,
        response_time: form.response_time || null,
        contract_end_date: form.contract_end_date || null,
        notes: form.notes || null,
      }
      return initial ? updateSLA(initial.id, payload) : createSLA(payload as Parameters<typeof createSLA>[0])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-dashboard'] })
      onClose()
    },
  })

  const f = (k: keyof SLAFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-card border shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {initial ? 'Modifier le contrat SLA' : 'Nouveau contrat SLA'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nom *</label>
            <Input value={form.name} onChange={f('name')} placeholder="ex : Contrat Premium Serveurs" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prestataire</label>
            <Input value={form.provider} onChange={f('provider')} placeholder="Dell, HPE, Microsoft…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Niveau</label>
            <Input value={form.level} onChange={f('level')} placeholder="Gold, Silver, Standard…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Référence contrat</label>
            <Input value={form.contract_ref} onChange={f('contract_ref')} placeholder="REF-2024-001" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date d'expiration</label>
            <Input type="date" value={form.contract_end_date} onChange={f('contract_end_date')} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact support</label>
            <Input value={form.support_contact} onChange={f('support_contact')} placeholder="support@exemple.com" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Délai de réponse</label>
            <Input value={form.response_time} onChange={f('response_time')} placeholder="4h, NBD, 24/7…" />
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
            <textarea
              value={form.notes}
              onChange={f('notes')}
              rows={2}
              placeholder="Remarques, périmètre couvert…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>
        </div>

        {mut.error && (
          <p className="text-sm text-destructive">
            {(mut.error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Erreur'}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.name.trim() || mut.isPending}>
            {mut.isPending ? <Spinner size="sm" /> : initial ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Ligne contrat ──────────────────────────────────────────────────────────────

function ContractRow({
  contract,
  onEdit,
  onDelete,
  canWrite,
}: {
  contract: SLAContract
  onEdit: () => void
  onDelete: () => void
  canWrite: boolean
}) {
  const rowBg =
    contract.expiry_status === 'expired'  ? 'bg-red-50/40 dark:bg-red-950/20' :
    contract.expiry_status === 'critical' ? 'bg-orange-50/40 dark:bg-orange-950/20' :
    contract.expiry_status === 'warning'  ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''

  return (
    <tr className={cn('border-b last:border-0 hover:bg-muted/30 transition-colors', rowBg)}>
      <td className="px-4 py-3">
        <p className="font-medium text-sm text-foreground">{contract.name}</p>
        {contract.contract_ref && (
          <p className="text-xs text-muted-foreground mt-0.5">{contract.contract_ref}</p>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {contract.provider ?? <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="px-4 py-3">
        {contract.level ? (
          <Badge variant="info">{contract.level}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <ExpiryBadge contract={contract} />
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {contract.response_time ?? <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Server size={13} />
          {contract.ci_count}
        </span>
      </td>
      {canWrite && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Modifier"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Supprimer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function SLADashboard() {
  const qc = useQueryClient()
  const { can } = useAuth()
  const canWrite = can('contracts:write')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<SLA | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sla-dashboard'],
    queryFn: getSLADashboard,
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSLA(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sla-dashboard'] }),
  })

  function openCreate() { setEditing(null); setShowModal(true) }
  function openEdit(c: SLAContract) {
    setEditing({
      id: c.id, name: c.name, provider: c.provider, level: c.level,
      contract_ref: c.contract_ref, support_contact: c.support_contact,
      response_time: c.response_time, contract_end_date: c.contract_end_date,
      notes: c.notes, created_at: '', updated_at: '',
    })
    setShowModal(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <FileCheck2 size={20} className="text-brand" />
            Contrats SLA
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Suivi des contrats de support et couverture du parc.
          </p>
        </div>
        {canWrite && (
          <Button onClick={openCreate}>
            <Plus size={15} /> Nouveau contrat
          </Button>
        )}
      </div>

      {/* KPIs */}
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard label="Contrats total"   value={data.total}           icon={FileCheck2}  colorCls="bg-brand/10 text-brand" />
          <KpiCard label="Actifs"           value={data.active}          icon={FileCheck2}  colorCls="bg-green-100 text-green-700" />
          <KpiCard label="Expirent ≤ 30 j"  value={data.expiring_30d}    icon={AlertTriangle} colorCls={data.expiring_30d > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'} />
          <KpiCard label="Expirent ≤ 90 j"  value={data.expiring_90d}    icon={Clock}       colorCls={data.expiring_90d > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'} />
          <KpiCard label="Expirés"          value={data.expired}         icon={XCircle}     colorCls={data.expired > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'} />
          <KpiCard label="CIs sans contrat" value={data.cis_without_sla} icon={ShieldOff}   colorCls={data.cis_without_sla > 0 ? 'bg-slate-100 text-slate-600' : 'bg-green-100 text-green-700'}
            sub={data.cis_without_sla > 0 ? 'Non couverts' : '100 % couverts'}
          />
        </div>
      )}

      {/* Tableau contrats */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !data?.contracts.length ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <FileCheck2 size={36} className="opacity-25" />
            <p className="text-sm">Aucun contrat SLA défini</p>
            {canWrite && (
              <Button variant="secondary" onClick={openCreate}>
                <Plus size={14} /> Créer le premier contrat
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left">Contrat</th>
                  <th className="px-4 py-2.5 text-left">Prestataire</th>
                  <th className="px-4 py-2.5 text-left">Niveau</th>
                  <th className="px-4 py-2.5 text-left">Expiration</th>
                  <th className="px-4 py-2.5 text-left">Délai réponse</th>
                  <th className="px-4 py-2.5 text-left">CIs couverts</th>
                  {canWrite && <th className="px-4 py-2.5 text-left">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.contracts.map(c => (
                  <ContractRow
                    key={c.id}
                    contract={c}
                    onEdit={() => openEdit(c)}
                    onDelete={() => { if (confirm(`Supprimer "${c.name}" ?`)) deleteMut.mutate(c.id) }}
                    canWrite={canWrite}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <SLAModal initial={editing} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}
