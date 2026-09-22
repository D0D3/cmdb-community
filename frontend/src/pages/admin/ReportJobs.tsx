import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Play, CalendarClock, X, Mail, ToggleLeft, ToggleRight } from 'lucide-react'
import {
  listReportJobs, createReportJob, deleteReportJob, runReportJob, updateReportJob,
  type ReportJob, type ReportJobCreate,
} from '@/api/reports'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'

// ── Constantes ────────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  { value: 'inventory',  label: 'Inventaire complet' },
  { value: 'hardware',   label: 'Inventaire matériel' },
  { value: 'software',   label: 'Inventaire logiciels' },
  { value: 'cves',       label: 'Rapport CVE' },
  { value: 'deadlines',  label: 'Échéances' },
  { value: 'incidents',  label: 'Incidents ouverts' },
  { value: 'changes',    label: 'RFC actives' },
]

const SCHEDULES = [
  { value: 'manual',  label: 'Manuel' },
  { value: 'daily',   label: 'Quotidien (7h00 UTC)' },
  { value: 'weekly',  label: 'Hebdomadaire (lundi 7h00)' },
  { value: 'monthly', label: 'Mensuel (1er du mois, 7h00)' },
]

// ── Modal création ────────────────────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<ReportJobCreate>({
    name: '',
    report_type: 'inventory',
    format: 'csv',
    schedule: 'manual',
    recipients: [],
  })
  const [emailInput, setEmailInput] = useState('')
  const [emailError, setEmailError] = useState('')

  const mut = useMutation({
    mutationFn: createReportJob,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-jobs'] })
      onClose()
    },
  })

  const addEmail = () => {
    const email = emailInput.trim()
    if (!email) return
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setEmailError('Adresse email invalide')
      return
    }
    if (form.recipients.includes(email)) {
      setEmailError('Déjà dans la liste')
      return
    }
    setForm(f => ({ ...f, recipients: [...f.recipients, email] }))
    setEmailInput('')
    setEmailError('')
  }

  const removeEmail = (email: string) =>
    setForm(f => ({ ...f, recipients: f.recipients.filter(e => e !== email) }))

  const submit = () => {
    if (!form.name.trim()) return
    mut.mutate(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-card border shadow-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Nouveau rapport planifié</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Nom */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Nom *</label>
          <Input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="ex : Inventaire hebdo"
          />
        </div>

        {/* Type + Format */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Type de rapport</label>
            <select
              value={form.report_type}
              onChange={e => setForm(f => ({ ...f, report_type: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Format</label>
            <select
              value={form.format}
              onChange={e => setForm(f => ({ ...f, format: e.target.value as 'csv' | 'pdf' }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </select>
          </div>
        </div>

        {/* Planification */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Planification</label>
          <select
            value={form.schedule}
            onChange={e => setForm(f => ({ ...f, schedule: e.target.value as ReportJobCreate['schedule'] }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Destinataires */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Destinataires</label>
          <div className="flex gap-2">
            <Input
              value={emailInput}
              onChange={e => { setEmailInput(e.target.value); setEmailError('') }}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail())}
              placeholder="email@exemple.com"
              className="flex-1"
            />
            <Button variant="secondary" onClick={addEmail} className="shrink-0">Ajouter</Button>
          </div>
          {emailError && <p className="text-xs text-destructive">{emailError}</p>}
          {form.recipients.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {form.recipients.map(email => (
                <span key={email} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs text-brand font-medium">
                  <Mail size={11} />
                  {email}
                  <button onClick={() => removeEmail(email)} className="ml-1 text-brand/60 hover:text-destructive">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {mut.error && (
          <p className="text-sm text-destructive">
            {(mut.error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Erreur lors de la création'}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={!form.name.trim() || mut.isPending}>
            {mut.isPending ? <Spinner size="sm" /> : 'Créer'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Ligne de job ───────────────────────────────────────────────────────────────

function JobRow({ job }: { job: ReportJob }) {
  const qc = useQueryClient()
  const [runMsg, setRunMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const runMut = useMutation({
    mutationFn: () => runReportJob(job.id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['report-jobs'] })
      setRunMsg({ ok: true, text: res.message === 'OK' ? 'Envoyé !' : res.message })
      setTimeout(() => setRunMsg(null), 3000)
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setRunMsg({ ok: false, text: err.response?.data?.detail ?? 'Erreur' })
      setTimeout(() => setRunMsg(null), 4000)
    },
  })

  const toggleMut = useMutation({
    mutationFn: () => updateReportJob(job.id, { is_active: !job.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-jobs'] }),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteReportJob(job.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-jobs'] }),
  })

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-foreground">{job.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{job.report_type_label}</div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        <Badge variant={job.format === 'pdf' ? 'default' : 'info'}>{job.format.toUpperCase()}</Badge>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{job.schedule_label}</td>
      <td className="px-4 py-3">
        {job.recipients.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {job.recipients.slice(0, 2).map(e => (
              <span key={e} className="text-xs bg-muted rounded-full px-2 py-0.5 text-muted-foreground">{e}</span>
            ))}
            {job.recipients.length > 2 && (
              <span className="text-xs text-muted-foreground">+{job.recipients.length - 2}</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {job.last_run_at ? formatDate(job.last_run_at) : <span className="text-muted-foreground/40">Jamais</span>}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => toggleMut.mutate()}
          disabled={toggleMut.isPending}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={job.is_active ? 'Désactiver' : 'Activer'}
        >
          {job.is_active
            ? <ToggleRight size={20} className="text-brand" />
            : <ToggleLeft size={20} />
          }
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {runMsg ? (
            <span className={`text-xs font-medium ${runMsg.ok ? 'text-green-600' : 'text-destructive'}`}>
              {runMsg.text}
            </span>
          ) : (
            <button
              onClick={() => runMut.mutate()}
              disabled={runMut.isPending || !job.recipients.length}
              title={!job.recipients.length ? 'Aucun destinataire' : 'Exécuter maintenant'}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {runMut.isPending ? <Spinner size="sm" /> : <Play size={13} />}
              Lancer
            </button>
          )}
          <button
            onClick={() => { if (confirm(`Supprimer "${job.name}" ?`)) deleteMut.mutate() }}
            disabled={deleteMut.isPending}
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Supprimer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function ReportJobs() {
  const [showCreate, setShowCreate] = useState(false)

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['report-jobs'],
    queryFn: listReportJobs,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <CalendarClock size={20} className="text-brand" />
            Rapports planifiés
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Générez et envoyez des rapports automatiquement par email.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={15} />
          Nouveau job
        </Button>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !jobs?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <CalendarClock size={36} className="opacity-30" />
            <p className="text-sm">Aucun rapport planifié</p>
            <Button variant="secondary" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Créer le premier job
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left">Rapport</th>
                  <th className="px-4 py-2.5 text-left">Format</th>
                  <th className="px-4 py-2.5 text-left">Planification</th>
                  <th className="px-4 py-2.5 text-left">Destinataires</th>
                  <th className="px-4 py-2.5 text-left">Dernier envoi</th>
                  <th className="px-4 py-2.5 text-left">Actif</th>
                  <th className="px-4 py-2.5 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => <JobRow key={job.id} job={job} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
