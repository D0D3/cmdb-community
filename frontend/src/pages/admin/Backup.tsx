import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  HardDrive, Plus, Play, Download, Trash2, Pencil, X, Check,
  AlertCircle, CheckCircle2, Loader2, Upload, Database,
  FileArchive, Clock3, CalendarClock, ArchiveRestore, RotateCcw,
  ServerIcon, ChevronDown, ChevronUp, Wifi, KeyRound, FolderOpen, StopCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { backupApi, type BackupJob, type BackupRun, type JobIn, type RestoreLog } from '@/api/backup'
import Spinner from '@/components/ui/Spinner'
import { cn, formatDateTime } from '@/lib/utils'

// ── Constantes ────────────────────────────────────────────────────────────────

const SCHEDULES = [
  { value: 'manual',  label: 'Manuel uniquement', icon: '—' },
  { value: 'daily',   label: 'Quotidien',          icon: '24h' },
  { value: 'weekly',  label: 'Hebdomadaire',       icon: '7j' },
  { value: 'monthly', label: 'Mensuel',            icon: '30j' },
]

const WEEKDAYS = [
  { value: 0, label: 'Lundi' },
  { value: 1, label: 'Mardi' },
  { value: 2, label: 'Mercredi' },
  { value: 3, label: 'Jeudi' },
  { value: 4, label: 'Vendredi' },
  { value: 5, label: 'Samedi' },
  { value: 6, label: 'Dimanche' },
]

function fmtTime(h: number | null, m: number | null): string {
  return `${String(h ?? 2).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`
}

function fmtSchedule(job: { schedule: string; schedule_hour: number | null; schedule_minute: number | null; schedule_weekday: number | null; schedule_monthday: number | null }): string {
  const t = fmtTime(job.schedule_hour, job.schedule_minute)
  if (job.schedule === 'daily')   return `Quotidien à ${t}`
  if (job.schedule === 'weekly') {
    const wd = WEEKDAYS[job.schedule_weekday ?? 0]?.label ?? 'Lundi'
    return `${wd} à ${t}`
  }
  if (job.schedule === 'monthly') {
    const d = job.schedule_monthday ?? 1
    return `Le ${d} du mois à ${t}`
  }
  return 'Manuel'
}

const RUN_STATUS = {
  running:   { label: 'En cours',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',    dot: 'bg-blue-500',   Icon: Loader2 },
  success:   { label: 'Réussi',    color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', dot: 'bg-green-500', Icon: CheckCircle2 },
  error:     { label: 'Erreur',    color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',         dot: 'bg-red-500',   Icon: AlertCircle },
  cancelled: { label: 'Annulé',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', dot: 'bg-orange-500', Icon: StopCircle },
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / 1_048_576).toFixed(1)} Mo`
}

function fmtDuration(started: string, finished: string | null): string {
  if (!finished) return '…'
  const s = Math.round((new Date(finished).getTime() - new Date(started).getTime()) / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

// ── Sparkline runs (5 derniers) ───────────────────────────────────────────────

function RunSparkline({ runs, jobId }: { runs: BackupRun[] | undefined; jobId: string }) {
  const jobRuns = (runs ?? []).filter(r => r.job_id === jobId).slice(0, 7)
  if (!jobRuns.length) return <span className="text-xs text-muted-foreground/50 italic">aucune exécution</span>
  return (
    <div className="flex items-center gap-1" title="7 dernières exécutions (plus récente à droite)">
      {[...jobRuns].reverse().map(r => {
        const st = RUN_STATUS[r.status] ?? RUN_STATUS.error
        return (
          <span
            key={r.id}
            title={`${st.label} — ${formatDateTime(r.started_at)}${r.size_bytes ? ' · ' + fmtSize(r.size_bytes) : ''}`}
            className={cn('w-2.5 h-2.5 rounded-sm inline-block', st.dot, r.status === 'running' && 'animate-pulse')}
          />
        )
      })}
    </div>
  )
}

// ── Formulaire job ────────────────────────────────────────────────────────────

const DEFAULT_FORM: JobIn = {
  name: '', schedule: 'manual',
  schedule_hour: 2, schedule_minute: 0, schedule_weekday: 0, schedule_monthday: 1,
  retention_count: 7, include_uploads: true, is_active: true,
  remote_enabled: false, remote_type: 'sftp', remote_host: null, remote_port: null,
  remote_user: null, remote_password: null, remote_path: null, remote_ssh_key: null, remote_smb_share: null,
}

const INPUT = 'px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 w-full'

function JobForm({
  initial, job, onSave, onCancel, onTestRemote,
}: {
  initial: JobIn
  job?: BackupJob
  onSave: (d: JobIn) => void
  onCancel: () => void
  onTestRemote?: () => void
}) {
  const [form, setForm] = useState<JobIn>(initial)
  const [showRemote, setShowRemote] = useState(initial.remote_enabled)
  function set<K extends keyof JobIn>(k: K, v: JobIn[K]) { setForm(f => ({ ...f, [k]: v })) }

  const isSFTP = form.remote_type === 'sftp'
  const isSMB  = form.remote_type === 'smb'

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* ── Champs principaux ───────────────────────────────────────────── */}
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Nom du job</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Backup nuit" className={INPUT} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Planification</label>
            <select value={form.schedule} onChange={e => set('schedule', e.target.value)} className={INPUT}>
              {SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Champs conditionnels selon la fréquence */}
          {form.schedule !== 'manual' && (
            <>
              {form.schedule === 'weekly' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Jour de la semaine</label>
                  <select
                    value={form.schedule_weekday ?? 0}
                    onChange={e => set('schedule_weekday', Number(e.target.value))}
                    className={INPUT}
                  >
                    {WEEKDAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              )}
              {form.schedule === 'monthly' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Jour du mois</label>
                  <select
                    value={form.schedule_monthday ?? 1}
                    onChange={e => set('schedule_monthday', Number(e.target.value))}
                    className={INPUT}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d === 31 ? `${d} (ou dernier du mois)` : d}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Heure de déclenchement</label>
                <input
                  type="time"
                  value={fmtTime(form.schedule_hour, form.schedule_minute)}
                  onChange={e => {
                    const [h, m] = e.target.value.split(':').map(Number)
                    set('schedule_hour', isNaN(h) ? 2 : h)
                    set('schedule_minute', isNaN(m) ? 0 : m)
                  }}
                  className={INPUT}
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Rétention (nombre d'archives)</label>
            <input type="number" min={1} max={90} value={form.retention_count} onChange={e => set('retention_count', Number(e.target.value))} className={INPUT} />
          </div>
          <div className="flex flex-col gap-3 justify-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" checked={form.include_uploads} onChange={e => set('include_uploads', e.target.checked)} className="accent-brand" />
              Inclure les fichiers uploadés
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="accent-brand" />
              Job actif
            </label>
          </div>
        </div>
      </div>

      {/* ── Section destination distante ────────────────────────────────── */}
      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => setShowRemote(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <ServerIcon size={14} className={form.remote_enabled ? 'text-brand' : 'text-muted-foreground'} />
            Destination distante
            {form.remote_enabled && form.remote_host && (
              <span className="text-xs text-brand font-normal">
                — {form.remote_type?.toUpperCase()} {form.remote_host}
              </span>
            )}
          </span>
          {showRemote ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showRemote && (
          <div className="px-5 pb-5 space-y-4 bg-muted/20">
            {/* Activer/type */}
            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.remote_enabled}
                  onChange={e => { set('remote_enabled', e.target.checked); if (!form.remote_type) set('remote_type', 'sftp') }}
                  className="accent-brand"
                />
                Activer l'export distant
              </label>
            </div>

            {form.remote_enabled && (
              <>
                {/* Type */}
                <div className="grid grid-cols-2 gap-2">
                  {(['sftp', 'smb'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set('remote_type', t)}
                      className={cn(
                        'py-2 rounded-lg border text-sm font-medium transition-colors',
                        form.remote_type === t
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-border hover:bg-muted',
                      )}
                    >
                      {t === 'sftp' ? '🐧 SFTP — Linux / Windows SSH' : '🪟 SMB — Partage réseau Windows'}
                    </button>
                  ))}
                </div>

                {/* Champs communs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Wifi size={11} /> Hôte / IP</label>
                    <input value={form.remote_host ?? ''} onChange={e => set('remote_host', e.target.value || null)} placeholder="192.168.1.100 ou serveur.domaine.fr" className={INPUT} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Port</label>
                    <input
                      type="number"
                      value={form.remote_port ?? (isSFTP ? 22 : 445)}
                      onChange={e => set('remote_port', Number(e.target.value) || null)}
                      placeholder={isSFTP ? '22' : '445'}
                      className={INPUT}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Utilisateur</label>
                    <input value={form.remote_user ?? ''} onChange={e => set('remote_user', e.target.value || null)} placeholder={isSFTP ? 'backupuser' : 'DOMAINE\\utilisateur'} className={INPUT} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {isSFTP ? 'Mot de passe (ou passphrase clé SSH)' : 'Mot de passe'}
                    </label>
                    <input
                      type="password"
                      value={form.remote_password ?? ''}
                      onChange={e => set('remote_password', e.target.value || null)}
                      placeholder={job?.remote_has_password ? '••••••• (inchangé si vide)' : 'Mot de passe'}
                      className={INPUT}
                    />
                  </div>
                </div>

                {/* SMB : nom du partage */}
                {isSMB && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Nom du partage SMB</label>
                    <input value={form.remote_smb_share ?? ''} onChange={e => set('remote_smb_share', e.target.value || null)} placeholder="Backups" className={INPUT} />
                    <p className="text-xs text-muted-foreground">Exemple : <code className="bg-muted px-1 rounded">\\serveur\Backups</code> → saisir <code className="bg-muted px-1 rounded">Backups</code></p>
                  </div>
                )}

                {/* Chemin de destination */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FolderOpen size={11} /> Répertoire de destination</label>
                  <input
                    value={form.remote_path ?? ''}
                    onChange={e => set('remote_path', e.target.value || null)}
                    placeholder={isSFTP ? '/backups/cmdb' : 'cmdb\\backups'}
                    className={INPUT}
                  />
                </div>

                {/* SFTP : clé SSH */}
                {isSFTP && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <KeyRound size={11} /> Clé privée SSH (optionnel — RSA ou Ed25519 en PEM)
                    </label>
                    <textarea
                      rows={4}
                      value={form.remote_ssh_key ?? ''}
                      onChange={e => set('remote_ssh_key', e.target.value || null)}
                      placeholder={job?.remote_has_ssh_key ? '(clé existante — laisser vide pour conserver)' : '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
                      className={cn(INPUT, 'font-mono text-xs resize-y')}
                    />
                    <p className="text-xs text-muted-foreground">Si renseignée, prioritaire sur le mot de passe.</p>
                  </div>
                )}

                {/* Bouton test */}
                {job && onTestRemote && (
                  <button
                    type="button"
                    onClick={onTestRemote}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors"
                  >
                    <Wifi size={12} /> Tester la connexion
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2 p-5 pt-4 border-t border-border">
        <button
          onClick={() => { if (form.name.trim()) { onSave(form) } else { toast.error('Nom requis') } }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Check size={14} /> Enregistrer
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
        >
          <X size={14} /> Annuler
        </button>
      </div>
    </div>
  )
}

// ── Card job ──────────────────────────────────────────────────────────────────

function JobCard({
  job, runs, selected, onSelect, onEdit, onRun, onDelete, runPending,
}: {
  job:        BackupJob
  runs:       BackupRun[] | undefined
  selected:   boolean
  onSelect:   () => void
  onEdit:     () => void
  onRun:      () => void
  onDelete:   () => void
  runPending: boolean
}) {
  const active = job.is_active

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative flex gap-0 rounded-xl border transition-all cursor-pointer group overflow-hidden',
        selected
          ? 'border-brand/60 shadow-sm ring-1 ring-brand/20'
          : 'border-border hover:border-border/80 hover:shadow-sm',
        !active && 'opacity-60',
      )}
    >
      {/* Bandeau latéral actif/inactif */}
      <div className={cn('w-1 shrink-0 rounded-l-xl', active ? 'bg-green-500' : 'bg-muted-foreground/30')} />

      <div className="flex-1 flex items-center gap-4 px-4 py-3 bg-card min-w-0">
        {/* Icône */}
        <div className={cn(
          'shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
          active ? 'bg-green-50 text-green-600 dark:bg-green-900/30' : 'bg-muted text-muted-foreground',
        )}>
          <Database size={16} />
        </div>

        {/* Infos principales */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('font-semibold text-sm truncate', !active && 'line-through decoration-muted-foreground/40')}>
              {job.name}
            </span>

            {/* Badge actif / inactif */}
            <span className={cn(
              'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full leading-none',
              active
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                : 'bg-muted text-muted-foreground',
            )}>
              {active ? 'Actif' : 'Inactif'}
            </span>

            {/* Badge planification */}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium leading-none">
              {fmtSchedule(job)}
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileArchive size={11} />
              Rétention {job.retention_count} archiv{job.retention_count > 1 ? 'es' : 'e'}
            </span>
            <span>{job.include_uploads ? '+ uploads' : 'DB seule'}</span>
            {job.last_run_at
              ? <span className="flex items-center gap-1"><Clock3 size={11} />{formatDateTime(job.last_run_at)}</span>
              : <span className="italic">jamais exécuté</span>
            }
          </div>

          {/* Remote + Sparkline */}
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <RunSparkline runs={runs} jobId={job.id} />
            {job.remote_enabled && job.remote_host && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-medium">
                <ServerIcon size={10} />
                {job.remote_type?.toUpperCase()} → {job.remote_host}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            title="Lancer maintenant"
            onClick={onRun}
            disabled={runPending}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              active
                ? 'hover:bg-green-100 text-green-700 dark:hover:bg-green-900/40'
                : 'text-muted-foreground cursor-not-allowed opacity-50',
            )}
          >
            {runPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          </button>
          <button
            title="Modifier"
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <Pencil size={14} />
          </button>
          <button
            title="Supprimer"
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors dark:hover:bg-red-900/30"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function BackupAdmin() {
  const qc = useQueryClient()
  const [showForm, setShowForm]       = useState(false)
  const [editJob, setEditJob]         = useState<BackupJob | null>(null)
  const [selectedJob, setSelectedJob] = useState<string | null>(null)
  const [restoring, setRestoring]     = useState(false)
  const [testingRemote, setTestingRemote] = useState<string | null>(null)

  const { data: jobs, isLoading: loadingJobs } = useQuery({
    queryKey: ['backup-jobs'],
    queryFn:  backupApi.listJobs,
  })

  const { data: runs, isLoading: loadingRuns } = useQuery({
    queryKey:      ['backup-runs', selectedJob],
    queryFn:       () => backupApi.listRuns(selectedJob ?? undefined),
    refetchInterval: (query) => query.state.data?.some(r => r.status === 'running') ? 2000 : 8000,
  })

  const { data: restoreLogs } = useQuery({
    queryKey:      ['restore-logs'],
    queryFn:       backupApi.listRestoreLogs,
    refetchInterval: 10000,
  })

  const createMut = useMutation({
    mutationFn: backupApi.createJob,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['backup-jobs'] }); setShowForm(false); toast.success('Job créé') },
    onError:    () => toast.error('Erreur lors de la création'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: JobIn }) => backupApi.updateJob(id, data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['backup-jobs'] }); setEditJob(null); toast.success('Job mis à jour') },
    onError:    () => toast.error('Erreur lors de la mise à jour'),
  })

  const deleteMut = useMutation({
    mutationFn: backupApi.deleteJob,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['backup-jobs'] })
      qc.invalidateQueries({ queryKey: ['backup-runs'] })
      toast.success('Job supprimé')
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })

  const runMut = useMutation({
    mutationFn: backupApi.runJob,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['backup-runs'] })
      qc.invalidateQueries({ queryKey: ['backup-jobs'] })
      toast.success('Sauvegarde lancée')
    },
    onError: () => toast.error('Erreur au lancement'),
  })

  const deleteRunMut = useMutation({
    mutationFn: backupApi.deleteRun,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['backup-runs'] }); toast.success('Archive supprimée') },
    onError:    () => toast.error('Erreur lors de la suppression'),
  })

  const restoreRunMut = useMutation({
    mutationFn: backupApi.restoreRun,
    onSuccess:  (res) => {
      qc.invalidateQueries({ queryKey: ['restore-logs'] })
      toast.success(res.message)
    },
    onError:    (err: unknown) => {
      qc.invalidateQueries({ queryKey: ['restore-logs'] })
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur lors de la restauration'
      toast.error(msg)
    },
  })

  const cancelRunMut = useMutation({
    mutationFn: backupApi.cancelRun,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['backup-runs'] })
      if (res.already_done) {
        toast.info(`Sauvegarde déjà terminée (${res.status === 'success' ? 'réussie' : 'en erreur'})`)
      } else {
        toast.success('Sauvegarde annulée')
      }
    },
    onError: () => toast.error('Impossible d\'annuler'),
  })

  async function handleTestRemote(jobId: string) {
    setTestingRemote(jobId)
    try {
      const res = await backupApi.testRemote(jobId)
      toast.success(res.message)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur de connexion'
      toast.error(msg)
    } finally {
      setTestingRemote(null)
    }
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.tar.gz')) { toast.error('Fichier .tar.gz attendu'); return }
    if (!window.confirm(`Restaurer depuis "${file.name}" ?\n\nCette opération remplacera entièrement la base de données et les fichiers uploadés. Elle est irréversible.`)) return
    setRestoring(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/backup/restore', { method: 'POST', body: fd, credentials: 'include' })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail ?? 'Erreur serveur') }
      toast.success('Restauration terminée avec succès')
      qc.invalidateQueries({ queryKey: ['restore-logs'] })
    } catch (err: unknown) {
      qc.invalidateQueries({ queryKey: ['restore-logs'] })
      toast.error((err as Error).message ?? 'Erreur lors de la restauration')
    } finally {
      setRestoring(false)
      e.target.value = ''
    }
  }

  // Stats globales
  const totalRuns    = runs?.length ?? 0
  const successRuns  = runs?.filter(r => r.status === 'success').length ?? 0
  const errorRuns    = runs?.filter(r => r.status === 'error').length   ?? 0
  const runningRuns  = runs?.filter(r => r.status === 'running').length ?? 0
  const activeJobs   = jobs?.filter(j => j.is_active).length  ?? 0
  const inactiveJobs = (jobs?.length ?? 0) - activeJobs

  if (loadingJobs) return <div className="flex items-center justify-center py-24"><Spinner /></div>

  return (
    <div className="space-y-8 p-6 max-w-5xl">

      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <HardDrive size={22} className="text-brand" />
            Sauvegardes & Restauration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Export automatique ou manuel — archive <code className="bg-muted px-1 rounded text-xs">.tar.gz</code> contenant la base de données et les fichiers uploadés.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <label className={cn(
            'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm cursor-pointer hover:bg-muted transition-colors',
            restoring && 'opacity-60 pointer-events-none',
          )}>
            {restoring ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Importer une archive externe
            <input type="file" accept=".tar.gz" className="hidden" onChange={handleRestore} disabled={restoring} />
          </label>
          {!showForm && !editJob && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={14} /> Nouveau job
            </button>
          )}
        </div>
      </div>

      {/* ── Compteurs rapides ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Jobs actifs',   value: activeJobs,   color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Jobs inactifs', value: inactiveJobs, color: 'text-muted-foreground', bg: 'bg-muted/40' },
          { label: 'Réussies',      value: successRuns,  color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'En erreur',     value: errorRuns,    color: 'text-red-600',   bg: 'bg-red-50 dark:bg-red-900/20' },
        ].map(c => (
          <div key={c.label} className={cn('rounded-xl p-3 flex flex-col gap-0.5', c.bg)}>
            <span className={cn('text-2xl font-bold leading-none', c.color)}>{c.value}</span>
            <span className="text-xs text-muted-foreground">{c.label}</span>
          </div>
        ))}
      </div>

      {/* ── Formulaire création ──────────────────────────────────────────────── */}
      {showForm && !editJob && (
        <JobForm initial={DEFAULT_FORM} onSave={d => createMut.mutate(d)} onCancel={() => setShowForm(false)} />
      )}


      {/* ── Liste des jobs ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
          <CalendarClock size={13} /> Jobs planifiés
        </h2>

        {!jobs?.length ? (
          <div className="text-sm text-muted-foreground py-10 text-center border border-dashed rounded-xl">
            Aucun job configuré — créez-en un pour commencer.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Actifs en premier */}
            {[...jobs].sort((a, b) => Number(b.is_active) - Number(a.is_active)).map(job => (
              <div key={job.id}>
                {editJob?.id === job.id ? (
                  <JobForm
                    initial={{
                      name: job.name, schedule: job.schedule,
                      schedule_hour: job.schedule_hour ?? 2,
                      schedule_minute: job.schedule_minute ?? 0,
                      schedule_weekday: job.schedule_weekday ?? 0,
                      schedule_monthday: job.schedule_monthday ?? 1,
                      retention_count: job.retention_count,
                      include_uploads: job.include_uploads, is_active: job.is_active,
                      remote_enabled: job.remote_enabled, remote_type: job.remote_type,
                      remote_host: job.remote_host, remote_port: job.remote_port,
                      remote_user: job.remote_user, remote_password: null,
                      remote_path: job.remote_path, remote_ssh_key: null,
                      remote_smb_share: job.remote_smb_share,
                    }}
                    job={job}
                    onSave={d => updateMut.mutate({ id: job.id, data: d })}
                    onCancel={() => setEditJob(null)}
                    onTestRemote={() => handleTestRemote(job.id)}
                  />
                ) : (
                  <JobCard
                    job={job}
                    runs={runs}
                    selected={selectedJob === job.id}
                    onSelect={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
                    onEdit={() => { setShowForm(false); setEditJob(job) }}
                    onRun={() => runMut.mutate(job.id)}
                    onDelete={() => { if (window.confirm(`Supprimer le job "${job.name}" et toutes ses archives ?`)) deleteMut.mutate(job.id) }}
                    runPending={runMut.isPending}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Historique ───────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Clock3 size={13} />
            Historique des sauvegardes
            {selectedJob && jobs && (
              <span className="normal-case font-normal text-foreground ml-1">
                — {jobs.find(j => j.id === selectedJob)?.name}
              </span>
            )}
            {runningRuns > 0 && (
              <span className="flex items-center gap-1 text-blue-600 font-medium normal-case tracking-normal">
                <Loader2 size={11} className="animate-spin" /> {runningRuns} en cours
              </span>
            )}
          </h2>
          {selectedJob && (
            <button
              onClick={() => setSelectedJob(null)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <X size={11} /> Tout afficher
            </button>
          )}
        </div>

        {loadingRuns ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : !runs?.length ? (
          <div className="text-sm text-muted-foreground py-10 text-center border border-dashed rounded-xl">
            {selectedJob ? 'Aucune exécution pour ce job.' : 'Aucune exécution enregistrée.'}
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(7 * 49px + 40px)' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/50 text-muted-foreground border-b border-border">
                  <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide">Job</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide">Statut</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Démarré</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Durée · Taille</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map(run => {
                  const isCancelled = run.status === 'error' && run.error_msg === 'Annulé manuellement'
                  const st = isCancelled ? RUN_STATUS.cancelled : (RUN_STATUS[run.status] ?? RUN_STATUS.error)
                  const { Icon } = st
                  const wasRestored = restoreLogs?.some(l => l.run_id === run.id && l.status === 'success')
                  return (
                    <tr
                      key={run.id}
                      className={cn(
                        'hover:bg-muted/30 transition-colors',
                        run.status === 'running' && 'bg-blue-50/40 dark:bg-blue-900/10',
                        run.status === 'error'   && 'bg-red-50/30 dark:bg-red-900/10',
                      )}
                    >
                      <td className="px-2 py-2 font-medium text-sm max-w-[130px] truncate" title={run.job_name}>{run.job_name}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium w-fit', st.color)}>
                            <Icon size={10} className={run.status === 'running' ? 'animate-spin' : ''} />
                            {st.label}
                          </span>
                          {wasRestored && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium w-fit bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              <RotateCcw size={9} /> Restauré
                            </span>
                          )}
                          {run.error_msg && !isCancelled && (
                            <p className="text-xs text-red-600 max-w-[140px] truncate" title={run.error_msg}>
                              {run.error_msg}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDateTime(run.started_at)}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                        {fmtDuration(run.started_at, run.finished_at)}
                        {run.size_bytes ? <span className="mx-1 opacity-40">·</span> : null}
                        {fmtSize(run.size_bytes)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          {run.status === 'running' && (
                            <button
                              title="Annuler la sauvegarde en cours"
                              disabled={cancelRunMut.isPending && cancelRunMut.variables === run.id}
                              onClick={() => {
                                if (window.confirm(`Annuler la sauvegarde en cours ?\n\nL'opération pg_dump sera interrompue et le run sera marqué comme annulé.`)) {
                                  cancelRunMut.mutate(run.id)
                                }
                              }}
                              className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors dark:hover:bg-red-900/30 disabled:opacity-50"
                            >
                              {cancelRunMut.isPending && cancelRunMut.variables === run.id
                                ? <Loader2 size={13} className="animate-spin" />
                                : <StopCircle size={13} />
                              }
                            </button>
                          )}
                          {run.status === 'success' && run.filename && (
                            <>
                              <button
                                title="Télécharger l'archive"
                                onClick={() => backupApi.downloadRun(run).catch(() => toast.error('Échec du téléchargement'))}
                                className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors dark:hover:bg-blue-900/30"
                              >
                                <Download size={13} />
                              </button>
                              <button
                                title="Restaurer depuis cette archive"
                                disabled={restoreRunMut.isPending}
                                onClick={() => {
                                  if (window.confirm(
                                    `Restaurer depuis « ${run.filename} » ?\n\n` +
                                    `Sauvegardé le ${formatDateTime(run.started_at)} · ${fmtSize(run.size_bytes)}\n\n` +
                                    `Cette opération remplace entièrement la base de données et les fichiers uploadés. Elle est irréversible.`
                                  )) {
                                    restoreRunMut.mutate(run.id)
                                  }
                                }}
                                className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-600 transition-colors dark:hover:bg-amber-900/30 disabled:opacity-50"
                              >
                                {restoreRunMut.isPending && restoreRunMut.variables === run.id
                                  ? <Loader2 size={13} className="animate-spin" />
                                  : <RotateCcw size={13} />
                                }
                              </button>
                            </>
                          )}
                          <button
                            title="Supprimer l'archive"
                            onClick={() => { if (window.confirm('Supprimer cette exécution et son fichier ?')) deleteRunMut.mutate(run.id) }}
                            className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors dark:hover:bg-red-900/30"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
            {/* Légende */}
            <div className="px-4 py-2 bg-muted/30 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
              {Object.entries(RUN_STATUS).map(([key, val]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className={cn('w-2 h-2 rounded-full', val.dot)} />
                  {val.label}
                </span>
              ))}
              <span className="ml-auto">Cliquer sur un job pour filtrer l'historique</span>
            </div>
          </div>
        )}
      </section>

      {/* ── Journal des restaurations ───────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2 mb-3">
          <ArchiveRestore size={13} /> Journal des restaurations
        </h2>

        {!restoreLogs?.length ? (
          <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-xl">
            Aucune restauration enregistrée.
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(7 * 48px + 41px)' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/50 text-muted-foreground border-b border-border">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Source</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Fichier / Référence</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {restoreLogs.map(log => {
                    const SOURCE: Record<string, { label: string; color: string; emoji: string }> = {
                      local:  { label: 'Liste locale',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',     emoji: '💾' },
                      upload: { label: 'Import externe', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', emoji: '📤' },
                      sftp:   { label: 'SFTP',           color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',     emoji: '🐧' },
                      smb:    { label: 'SMB / Windows',  color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', emoji: '🪟' },
                    }
                    const src = SOURCE[log.source_type] ?? { label: log.source_type, color: 'bg-muted text-muted-foreground', emoji: '?' }
                    return (
                      <tr key={log.id} className={cn(
                        'hover:bg-muted/30 transition-colors',
                        log.status === 'error' && 'bg-red-50/30 dark:bg-red-900/10',
                      )}>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium', src.color)}>
                            <span>{src.emoji}</span> {src.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[240px]">
                          <span className="truncate block font-mono" title={log.source_ref ?? ''}>{log.source_ref ?? '—'}</span>
                          {log.error_msg && (
                            <span className="text-red-600 block truncate mt-0.5" title={log.error_msg}>{log.error_msg}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
                            log.status === 'success'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                          )}>
                            {log.status === 'success' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                            {log.status === 'success' ? 'Restauré' : 'Échouée'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.started_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Note format ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-muted/40 border border-border p-4 text-sm text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground text-sm">Format des archives</p>
        <ul className="space-y-1 text-xs">
          <li><code className="bg-muted px-1 rounded">db.dump</code> — dump PostgreSQL format custom (<code className="bg-muted px-1 rounded">pg_dump -Fc</code>), restaurable avec pg_restore</li>
          <li><code className="bg-muted px-1 rounded">uploads/</code> — fichiers uploadés (logos, avatars…) — inclus si l'option est cochée</li>
          <li><code className="bg-muted px-1 rounded">metadata.json</code> — version, date, options utilisées</li>
        </ul>
        <p className="text-xs pt-0.5">La restauration remplace entièrement la base de données et les uploads. Elle est irréversible.</p>
      </div>
    </div>
  )
}
