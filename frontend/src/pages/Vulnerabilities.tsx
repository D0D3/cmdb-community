import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import {
  ShieldAlert, ShieldX, ShieldCheck, Flame, ExternalLink,
  ChevronDown, ChevronUp, RefreshCw, Loader2, Database, KeyRound, Zap, CheckCircle2, XCircle
} from 'lucide-react'
import { getCveStats, listCves, updateCICveStatus, triggerIngest, getCveSources } from '@/api/cve'
import type { Cve, CICveStatus, CveSeverity } from '@/types/api'
import { useAuth } from '@/contexts/AuthContext'
import { useIngest } from '@/contexts/IngestContext'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils'

// ── Constantes UI ─────────────────────────────────────────────────────────────

const SEV_BADGE: Record<CveSeverity, 'danger' | 'warning' | 'info' | 'success'> = {
  CRITICAL: 'danger',
  HIGH:     'warning',
  MEDIUM:   'info',
  LOW:      'success',
}

const SEV_LABEL: Record<CveSeverity, string> = {
  CRITICAL: 'Critique',
  HIGH:     'Élevé',
  MEDIUM:   'Moyen',
  LOW:      'Faible',
}

const STATUS_LABEL: Record<CICveStatus, string> = {
  open:          'Ouvert',
  acknowledged:  'Pris en compte',
  mitigated:     'Mitigé',
  not_affected:  'Non affecté',
}

const STATUS_NEXT: CICveStatus[] = ['open', 'acknowledged', 'mitigated', 'not_affected']

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, colorCls }: {
  label: string; value: number; icon: React.ElementType; colorCls: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', colorCls)}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  )
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score, severity }: { score: string | null; severity: CveSeverity | null }) {
  if (!score && !severity) return <span className="text-muted-foreground text-xs">—</span>
  const sev = severity ?? 'LOW'
  const cls = {
    CRITICAL: 'bg-red-100 text-red-700 border-red-200',
    HIGH:     'bg-orange-100 text-orange-700 border-orange-200',
    MEDIUM:   'bg-yellow-100 text-yellow-700 border-yellow-200',
    LOW:      'bg-slate-100 text-slate-600 border-slate-200',
  }[sev]
  return (
    <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold', cls)}>
      {score ? Number(score).toFixed(1) : SEV_LABEL[sev]}
    </span>
  )
}

// ── Ligne CVE avec expand ─────────────────────────────────────────────────────

function CveRow({ cve }: { cve: Cve }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const { data: detail, isFetching } = useQuery({
    queryKey: ['cve-detail', cve.id],
    queryFn: () => import('@/api/cve').then(m => m.getCve(cve.id)),
    enabled: open,
    staleTime: 60_000,
  })

  const mutation = useMutation({
    mutationFn: ({ ciId, status }: { ciId: string; status: CICveStatus }) =>
      updateCICveStatus(cve.id, ciId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cve-detail', cve.id] }),
  })

  return (
    <>
      <tr
        className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {open ? <ChevronUp size={13} className="text-muted-foreground shrink-0" />
                   : <ChevronDown size={13} className="text-muted-foreground shrink-0" />}
            <a
              href={cve.source_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="font-mono text-sm font-medium text-brand hover:underline flex items-center gap-1"
            >
              {cve.id}
              <ExternalLink size={11} />
            </a>
            {cve.is_kev && (
              <span className="inline-flex items-center gap-0.5 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                <Flame size={9} /> KEV
              </span>
            )}
          </div>
          {cve.summary && (
            <p className="ml-5 text-xs text-muted-foreground mt-0.5 line-clamp-1 max-w-md">{cve.summary}</p>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <ScoreBadge score={cve.cvss_score} severity={cve.cvss_severity} />
        </td>
        <td className="px-4 py-3 text-center">
          {cve.cvss_severity
            ? <Badge variant={SEV_BADGE[cve.cvss_severity]}>{SEV_LABEL[cve.cvss_severity]}</Badge>
            : <span className="text-muted-foreground text-xs">—</span>
          }
        </td>
        <td className="px-4 py-3 text-center text-sm text-foreground">{cve.affected_count}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {cve.published_at ? formatDateTime(cve.published_at).slice(0, 10) : '—'}
        </td>
      </tr>

      {open && (
        <tr className="border-b bg-muted/20">
          <td colSpan={5} className="px-6 py-3">
            {isFetching && <Spinner className="h-4 w-4" />}
            {detail && detail.affected_cis.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun CI affecté enregistré.</p>
            )}
            {detail && detail.affected_cis.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  CIs affectés
                </p>
                {detail.affected_cis.map(link => (
                  <div key={link.ci_id} className="flex items-center gap-3">
                    <Link
                      to={`/ci/${link.ci_id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-sm text-brand hover:underline min-w-0 truncate"
                    >
                      {link.ci_name}
                    </Link>
                    <span className="text-xs text-muted-foreground">{link.ci_type}</span>
                    <select
                      value={link.status}
                      onClick={e => e.stopPropagation()}
                      onChange={e => mutation.mutate({ ciId: link.ci_id, status: e.target.value as CICveStatus })}
                      className="ml-auto rounded border border-border bg-card px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    >
                      {STATUS_NEXT.map(s => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Vulnerabilities() {
  const { hasRole, can } = useAuth()
  const isAdmin = hasRole('admin') || can('cve:write')
  const { status: ingest, finishedVisible, notifyStarted } = useIngest()
  const [params, setParams] = useSearchParams()
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const qc = useQueryClient()

  const severity = params.get('severity') ?? ''
  const isKev    = params.get('is_kev') === 'true' ? true : params.get('is_kev') === 'false' ? false : undefined
  const search   = params.get('search') ?? ''

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next)
  }

  // Rafraîchit stats et liste dès que la bannière "terminée" s'affiche
  useEffect(() => {
    if (finishedVisible) {
      qc.invalidateQueries({ queryKey: ['cve-stats'] })
      qc.invalidateQueries({ queryKey: ['cves'] })
      qc.invalidateQueries({ queryKey: ['cve-sources'] })
    }
  }, [finishedVisible]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: sources } = useQuery({
    queryKey: ['cve-sources'],
    queryFn: getCveSources,
    staleTime: 300_000,
  })

  const { data: stats } = useQuery({
    queryKey: ['cve-stats'],
    queryFn: getCveStats,
    staleTime: 30_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['cves', severity, isKev, search],
    queryFn: () => listCves({
      severity: severity || undefined,
      is_kev: isKev,
      search: search || undefined,
      limit: 100,
    }),
    staleTime: 30_000,
  })

  const ingestMutation = useMutation({
    mutationFn: triggerIngest,
    onSuccess: () => notifyStarted(),
  })

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Vulnérabilités</h1>
          <p className="text-sm text-muted-foreground">CVE détectées sur les logiciels du parc — NVD + CISA KEV + OSV</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => ingestMutation.mutate()}
            disabled={ingestMutation.isPending || ingest.running}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60"
          >
            {(ingestMutation.isPending || ingest.running)
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />
            }
            {ingest.running ? "En cours…" : "Lancer l'ingestion"}
          </button>
        )}
      </div>

      {/* Bandeau progression ingestion */}
      {ingest.running && (
        <div className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm text-brand">
          <Loader2 size={15} className="animate-spin shrink-0" />
          <span>Ingestion CVE en cours — interrogation NVD, CISA KEV &amp; OSV…</span>
          {ingest.started_at && (
            <span className="ml-auto text-xs text-brand/60">
              Démarré à {new Date(ingest.started_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}
      {!ingest.running && finishedVisible && ingest.finished_at && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-4 py-2.5 text-sm text-green-700 dark:text-green-300">
          <ShieldCheck size={15} className="shrink-0" />
          <span>
            Ingestion terminée — {ingest.matched_cves ?? 0} CVE traités, {ingest.new_links ?? 0} nouveau{(ingest.new_links ?? 0) > 1 ? 'x' : ''} lien{(ingest.new_links ?? 0) > 1 ? 's' : ''}
          </span>
          {ingest.finished_at && (
            <span className="ml-auto text-xs opacity-60">
              {new Date(ingest.finished_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <StatCard label="Total CVE"    value={stats.total}      icon={ShieldAlert} colorCls="bg-slate-100 text-slate-600" />
          <StatCard label="Critiques"    value={stats.critical}   icon={ShieldX}     colorCls="bg-red-100 text-red-600" />
          <StatCard label="Élevées"      value={stats.high}       icon={ShieldAlert} colorCls="bg-orange-100 text-orange-600" />
          <StatCard label="Moyennes"     value={stats.medium}     icon={ShieldAlert} colorCls="bg-yellow-100 text-yellow-700" />
          <StatCard label="Faibles"      value={stats.low}        icon={ShieldCheck} colorCls="bg-slate-100 text-slate-500" />
          <StatCard label="CISA KEV"     value={stats.kev_count}  icon={Flame}       colorCls="bg-red-100 text-red-600" />
          <StatCard label="À traiter"    value={stats.open_count} icon={ShieldX}     colorCls="bg-brand/10 text-brand" />
        </div>
      )}

      {/* Sources de données — collapsible */}
      {sources && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setSourcesOpen(o => !o)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
          >
            <Database size={14} className="text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">Sources consultées</span>
            {sourcesOpen ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </button>

          {sourcesOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              <div className="grid gap-3 sm:grid-cols-3">

                {/* NVD */}
                <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/30">
                    <ShieldAlert size={15} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">NVD</p>
                      <span className="text-xs text-muted-foreground">NIST</span>
                      <a href={sources.nvd.url} target="_blank" rel="noopener noreferrer"
                        className="ml-auto text-muted-foreground hover:text-brand transition-colors">
                        <ExternalLink size={12} />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground">National Vulnerability Database</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Database size={11} />{sources.nvd.total_cves.toLocaleString('fr-FR')} CVE
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Zap size={11} />{sources.nvd.rate_limit}
                      </span>
                      <span className={cn('flex items-center gap-1 text-xs', sources.nvd.has_api_key ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400')}>
                        {sources.nvd.has_api_key
                          ? <><CheckCircle2 size={11} /> Clé API active</>
                          : <><XCircle size={11} /> Sans clé API</>}
                      </span>
                    </div>
                  </div>
                </div>

                {/* CISA KEV */}
                <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-100 dark:bg-red-900/30">
                    <Flame size={15} className="text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">CISA KEV</p>
                      <span className="text-xs text-muted-foreground">CISA</span>
                      <a href={sources.cisa_kev.url} target="_blank" rel="noopener noreferrer"
                        className="ml-auto text-muted-foreground hover:text-brand transition-colors">
                        <ExternalLink size={12} />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground">Known Exploited Vulnerabilities Catalog</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Flame size={11} />{sources.cisa_kev.total_kev.toLocaleString('fr-FR')} vulnérabilités exploitées
                      </span>
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 size={11} /> Flux JSON public
                      </span>
                    </div>
                  </div>
                </div>

                {/* OSV */}
                <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/30">
                    <Zap size={15} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">OSV</p>
                      <span className="text-xs text-muted-foreground">Google</span>
                      <a href={sources.osv.url} target="_blank" rel="noopener noreferrer"
                        className="ml-auto text-muted-foreground hover:text-brand transition-colors">
                        <ExternalLink size={12} />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground">Open Source Vulnerabilities — réactif (GHSA)</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 size={11} /> Indexation en quelques heures
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Database size={11} /> Activé par CI via ecosystem
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Dernière sync */}
              {sources.last_sync.finished_at && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <KeyRound size={11} />
                  Dernière synchronisation le{' '}
                  {new Date(sources.last_sync.finished_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  {' à '}
                  {new Date(sources.last_sync.finished_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  {sources.last_sync.matched_cves != null && (
                    <> — {sources.last_sync.matched_cves.toLocaleString('fr-FR')} CVE traités, {sources.last_sync.new_links ?? 0} nouveau{(sources.last_sync.new_links ?? 0) > 1 ? 'x' : ''} lien{(sources.last_sync.new_links ?? 0) > 1 ? 's' : ''}</>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <select
          value={severity}
          onChange={e => setFilter('severity', e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
        >
          <option value="">Toutes sévérités</option>
          <option value="CRITICAL">Critique</option>
          <option value="HIGH">Élevée</option>
          <option value="MEDIUM">Moyenne</option>
          <option value="LOW">Faible</option>
        </select>

        <select
          value={isKev === undefined ? '' : String(isKev)}
          onChange={e => setFilter('is_kev', e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
        >
          <option value="">KEV : toutes</option>
          <option value="true">KEV uniquement</option>
          <option value="false">Hors KEV</option>
        </select>

        <input
          value={search}
          onChange={e => setFilter('search', e.target.value)}
          placeholder="Rechercher (CVE-ID ou texte)…"
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-w-52"
        />

        {(severity || isKev !== undefined || search) && (
          <button
            onClick={() => setParams({})}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Tableau */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (data?.total ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <ShieldCheck size={36} className="mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-medium text-foreground">Aucune CVE enregistrée</p>
          <p className="text-sm text-muted-foreground mt-1">
            Renseignez les champs CPE ou éditeur/produit sur vos logiciels,<br />
            puis lancez l'ingestion (bouton en haut à droite).
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">
              {data!.total} CVE{data!.total > 1 ? 's' : ''}
              {data!.total > 100 ? ' (100 premières affichées)' : ''}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">CVE</th>
                <th className="px-4 py-2 text-center font-medium">Score</th>
                <th className="px-4 py-2 text-center font-medium">Sévérité</th>
                <th className="px-4 py-2 text-center font-medium">CIs affectés</th>
                <th className="px-4 py-2 text-left font-medium">Publié</th>
              </tr>
            </thead>
            <tbody>
              {data!.items.map(cve => <CveRow key={cve.id} cve={cve} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
