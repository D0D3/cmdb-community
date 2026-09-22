import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ShieldCheck, ChevronDown, ChevronRight,
  Server, Package, AlertTriangle, AlertCircle, Info,
  ArrowRight, ClipboardCheck,
} from 'lucide-react'
import { getQualitySummary, type QualityIssue, type CiRef } from '@/api/quality'
import Spinner from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

// ── Constantes ─────────────────────────────────────────────────────────────────

const SEV_META = {
  high:   { icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-950/20',    border: 'border-red-200 dark:border-red-800',   badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',    label: 'Critique' },
  medium: { icon: AlertCircle,   color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-950/20',  border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', label: 'Moyen' },
  low:    { icon: Info,          color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/20',   border: 'border-blue-200 dark:border-blue-800',  badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',   label: 'Faible' },
}

const HEALTH_CLS = (score: number) =>
  score >= 80 ? { ring: 'stroke-green-500', text: 'text-green-700 dark:text-green-400', badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', label: 'Bon' }
  : score >= 50 ? { ring: 'stroke-amber-500', text: 'text-amber-700 dark:text-amber-400', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', label: 'Attention' }
  : { ring: 'stroke-red-500', text: 'text-red-700 dark:text-red-400', badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', label: 'Critique' }

// ── Score jauge ────────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const cls = HEALTH_CLS(score)
  const R = 52, C = 2 * Math.PI * R
  const dash = (score / 100) * C

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
          <circle
            cx="60" cy="60" r={R} fill="none"
            className={cls.ring}
            strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`}
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-4xl font-bold leading-none', cls.text)}>{score}</span>
          <span className="text-xs text-muted-foreground mt-1">/100</span>
        </div>
      </div>
      <span className={cn('text-sm font-semibold px-3 py-1 rounded-full', cls.badge)}>
        {cls.label}
      </span>
    </div>
  )
}

// ── Carte d'un problème ────────────────────────────────────────────────────────

function IssueCard({ issue }: { issue: QualityIssue }) {
  const navigate  = useNavigate()
  const [open, setOpen] = useState(false)
  const meta = SEV_META[issue.severity]
  const Icon = meta.icon
  const ok   = issue.count === 0

  return (
    <div className={cn(
      'rounded-xl border bg-card overflow-hidden',
      ok ? 'opacity-60' : meta.border,
    )}>
      {/* En-tête cliquable */}
      <button
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => !ok && setOpen(o => !o)}
        disabled={ok}
      >
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.bg)}>
          {ok
            ? <ShieldCheck size={16} className="text-green-600" />
            : <Icon size={16} className={meta.color} />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground">{issue.label}</p>
            <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', meta.badge)}>
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{issue.detail}</p>
        </div>

        {/* Compteur + barre + chevron */}
        <div className="flex items-center gap-4 shrink-0">
          {issue.total > 0 && (
            <div className="hidden sm:flex flex-col items-end gap-1 w-28">
              <span className={cn('text-xs font-semibold', ok ? 'text-green-600' : meta.color)}>
                {ok ? '✓ Aucun problème' : `${issue.count} / ${issue.total}`}
              </span>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', ok ? 'bg-green-500' : meta.color.replace('text-', 'bg-'))}
                  style={{ width: `${ok ? 100 : issue.pct}%` }}
                />
              </div>
            </div>
          )}
          {!ok && (
            open
              ? <ChevronDown size={16} className="text-muted-foreground" />
              : <ChevronRight size={16} className="text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Liste des CIs affectés */}
      {open && issue.cis.length > 0 && (
        <div className={cn('border-t', meta.border)}>
          {issue.cis.map((ci: CiRef) => (
            <button
              key={ci.id}
              className="flex w-full items-center gap-3 px-5 py-2.5 hover:bg-muted/30 transition-colors border-b last:border-0 text-left"
              onClick={() => navigate(`/ci/${ci.id}`)}
            >
              <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded', meta.bg)}>
                {ci.ci_type === 'hardware'
                  ? <Server size={12} className={meta.color} />
                  : <Package size={12} className={meta.color} />
                }
              </div>
              <span className="text-sm text-foreground flex-1 truncate">{ci.name}</span>
              <ArrowRight size={13} className="text-muted-foreground shrink-0" />
            </button>
          ))}
          {issue.count > issue.cis.length && (
            <div className="px-5 py-2 text-xs text-muted-foreground text-center">
              + {issue.count - issue.cis.length} autres CI affectés
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function Quality() {
  const { data, isLoading } = useQuery({
    queryKey: ['quality-summary'],
    queryFn: getQualitySummary,
    staleTime: 120_000,
  })

  const issueCount  = data?.issues.filter(i => i.count > 0).length ?? 0
  const critCount   = data?.issues.filter(i => i.count > 0 && i.severity === 'high').length ?? 0

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <ClipboardCheck size={20} className="text-brand" />
          Qualité des données
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Données manquantes ou incohérentes détectées automatiquement — cliquez sur un problème pour voir les CIs concernés.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !data ? null : (
        <>
          {/* Résumé */}
          <div className="rounded-xl border bg-card p-6">
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <ScoreGauge score={data.score} />

              <div className="flex-1 grid grid-cols-3 gap-4 text-center">
                <div className="rounded-lg bg-muted/40 p-4">
                  <p className="text-3xl font-bold text-foreground">{data.total_ci}</p>
                  <p className="text-xs text-muted-foreground mt-1">CIs actifs</p>
                </div>
                <div className={cn('rounded-lg p-4', issueCount > 0 ? 'bg-red-50 dark:bg-red-950/20' : 'bg-green-50 dark:bg-green-950/20')}>
                  <p className={cn('text-3xl font-bold', issueCount > 0 ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400')}>
                    {issueCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {issueCount === 0 ? 'Aucun problème' : `catégorie${issueCount > 1 ? 's' : ''} avec problèmes`}
                  </p>
                </div>
                <div className={cn('rounded-lg p-4', critCount > 0 ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-green-50 dark:bg-green-950/20')}>
                  <p className={cn('text-3xl font-bold', critCount > 0 ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400')}>
                    {critCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {critCount === 0 ? 'Aucun critique' : `critique${critCount > 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Liste des problèmes — triée par sévérité puis count décroissant */}
          <div className="space-y-3">
            {[...data.issues]
              .sort((a, b) => {
                const sev = { high: 0, medium: 1, low: 2 }
                const ds = sev[a.severity] - sev[b.severity]
                return ds !== 0 ? ds : b.count - a.count
              })
              .map(issue => <IssueCard key={issue.key} issue={issue} />)
            }
          </div>

          {issueCount === 0 && (
            <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-10 text-center">
              <ShieldCheck size={36} className="mx-auto text-green-500 mb-3" />
              <p className="font-semibold text-green-800 dark:text-green-300">Données en excellent état</p>
              <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                Aucun problème détecté sur les {data.total_ci} CIs actifs.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
