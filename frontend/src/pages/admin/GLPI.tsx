import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  PlugZap, RefreshCw, Loader2, CheckCircle2, XCircle,
  Server, PlusCircle, Edit2, SkipForward, AlertTriangle, Clock,
} from 'lucide-react'
import { getGLPIStatus, pingGLPI, syncGLPI, type SyncResult } from '@/api/glpi'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, colorCls }: {
  label: string; value: number; icon: React.ElementType; colorCls: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', colorCls)}>
        <Icon size={15} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground">{value}</p>
      </div>
    </div>
  )
}

function formatDuration(s: number) {
  return s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${s.toFixed(1)} s`
}

function formatDatetime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GLPIAdmin() {
  const qc = useQueryClient()
  const [pingResult, setPingResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)

  const { data: status, isLoading } = useQuery({
    queryKey: ['glpi-status'],
    queryFn: getGLPIStatus,
    staleTime: 30_000,
  })

  const pingMutation = useMutation({
    mutationFn: pingGLPI,
    onSuccess: (r) => setPingResult({ ok: true, msg: `Connexion réussie à ${r.glpi_url}` }),
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Connexion échouée'
      setPingResult({ ok: false, msg })
    },
  })

  const syncMutation = useMutation({
    mutationFn: syncGLPI,
    onSuccess: (r) => {
      setSyncResult(r)
      qc.invalidateQueries({ queryKey: ['glpi-status'] })
      qc.invalidateQueries({ queryKey: ['ci'] })
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur de synchronisation'
      setPingResult({ ok: false, msg })
    },
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>

  const lastSync: SyncResult | null = syncResult ?? status?.last_sync ?? null

  return (
    <div className="max-w-3xl space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Connecteur GLPI</h1>
        <p className="text-sm text-muted-foreground">
          Importation et synchronisation du parc matériel depuis GLPI.
        </p>
      </div>

      {/* Statut de la config */}
      <Card>
        <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              status?.enabled ? 'bg-green-100' : 'bg-slate-100',
            )}>
              <PlugZap size={15} className={status?.enabled ? 'text-green-600' : 'text-slate-400'} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {status?.enabled ? 'Connecteur activé' : 'Connecteur désactivé'}
              </p>
              <p className="text-xs text-muted-foreground">
                {status?.enabled
                  ? status.glpi_url
                  : 'Renseignez GLPI_URL, GLPI_APP_TOKEN et GLPI_USER_TOKEN dans le .env'}
              </p>
            </div>
          </div>

          {status?.enabled && (
            <div className="flex gap-2">
              <button
                onClick={() => { setPingResult(null); pingMutation.mutate() }}
                disabled={pingMutation.isPending}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                {pingMutation.isPending
                  ? <Loader2 size={13} className="animate-spin" />
                  : <PlugZap size={13} />}
                Tester la connexion
              </button>
            </div>
          )}

          {pingResult && (
            <div className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
              pingResult.ok
                ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300'
                : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300',
            )}>
              {pingResult.ok
                ? <CheckCircle2 size={14} />
                : <XCircle size={14} />}
              {pingResult.msg}
            </div>
          )}

          {!status?.enabled && (
            <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              <p className="font-medium mb-1">Variables à configurer dans <code>.env</code> :</p>
              <pre className="text-xs font-mono leading-relaxed">
{`GLPI_URL=https://glpi.example.com
GLPI_APP_TOKEN=votre_app_token
GLPI_USER_TOKEN=votre_user_token   # ou GLPI_USERNAME + GLPI_PASSWORD`}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats sync */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Synchronisation</CardTitle>
            {status?.enabled && (
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 transition-colors disabled:opacity-60"
              >
                {syncMutation.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> Synchronisation…</>
                  : <><RefreshCw size={13} /> Synchroniser maintenant</>}
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Server size={14} />
            <span><span className="font-semibold text-foreground">{status?.total_synced ?? 0}</span> CI matériels importés depuis GLPI</span>
            {(status?.total_synced ?? 0) > 0 && (
              <Link to="/hardware" className="ml-auto text-xs text-brand hover:underline">
                Voir le parc →
              </Link>
            )}
          </div>

          {syncMutation.isPending && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin text-brand" />
              Connexion à GLPI et import des ordinateurs en cours…
            </div>
          )}

          {/* Résultat dernière sync */}
          {lastSync && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock size={12} />
                Dernière sync : <span className="font-medium text-foreground">{formatDatetime(lastSync.synced_at)}</span>
                <span className="ml-auto">en {formatDuration(lastSync.duration_s)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <KpiCard label="Total GLPI"  value={lastSync.total_glpi} icon={Server}       colorCls="bg-slate-100 text-slate-600" />
                <KpiCard label="Créés"        value={lastSync.created}    icon={PlusCircle}   colorCls="bg-green-100 text-green-700" />
                <KpiCard label="Mis à jour"   value={lastSync.updated}    icon={Edit2}        colorCls="bg-blue-100 text-blue-700" />
                <KpiCard label="Ignorés"      value={lastSync.skipped}    icon={SkipForward}  colorCls="bg-slate-100 text-slate-500" />
              </div>

              {lastSync.errors > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle size={13} />
                  {lastSync.errors} erreur{lastSync.errors > 1 ? 's' : ''} lors de l'import — consultez les logs du worker.
                </div>
              )}
            </div>
          )}

          {!lastSync && !syncMutation.isPending && (
            <p className="text-sm text-muted-foreground">
              Aucune synchronisation effectuée. Cliquez sur <em>Synchroniser maintenant</em> ou attendez la tâche planifiée (toutes les 24 h).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Guide rapide */}
      <Card>
        <CardHeader><CardTitle>Comment configurer</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Dans GLPI : <strong>Configuration → Générale → API</strong> — activez l'API REST et créez un <strong>App Token</strong>.</li>
            <li>Dans votre profil GLPI → section <strong>Accès API</strong> — générez votre <strong>User Token</strong>.</li>
            <li>Ajoutez les variables dans votre fichier <code>.env</code> et redémarrez le service.</li>
            <li>Cliquez sur <em>Tester la connexion</em> pour valider, puis <em>Synchroniser</em>.</li>
          </ol>
          <p className="text-xs pt-1">
            Les ordinateurs GLPI sont importés comme CIs matériels. La synchronisation met à jour les CIs existants identifiés par leur <code>glpi_id</code> ou leur numéro de série.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
