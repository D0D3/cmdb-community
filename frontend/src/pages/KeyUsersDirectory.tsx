import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Search, Server, Package, ChevronLeft, ChevronRight, Download, Upload, RefreshCw, X } from 'lucide-react'
import {
  listAllKeyUsers, exportKeyUsers, importKeyUsers, syncKeyUsers,
  type CIKeyUserGlobalOut, type KeyUsersImportResult,
} from '@/api/keyusers'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

const ROLE_LABELS: Record<string, string> = {
  key_user:    'Key User',
  owner:       'Propriétaire',
  referent:    'Référent',
  local_admin: 'Admin local',
}

const CRIT_VARIANT: Record<string, 'danger' | 'warning' | 'info' | 'muted'> = {
  critical: 'danger', high: 'warning', medium: 'info', low: 'muted',
}
const CRIT_LABELS: Record<string, string> = {
  critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Faible',
}

const SELECT = 'h-9 rounded border border-[hsl(var(--border))] bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'
const LIMIT = 50

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
      {name[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function SourceBadge({ type }: { type: string }) {
  return (
    <span className={cn(
      'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
      type === 'entra' ? 'bg-blue-100 text-blue-700' :
      type === 'ldap'  ? 'bg-violet-100 text-violet-700' :
                         'bg-muted text-muted-foreground',
    )}>
      {type === 'entra' ? 'EntraID' : type === 'ldap' ? 'LDAP' : 'Local'}
    </span>
  )
}

function Row({ ku }: { ku: CIKeyUserGlobalOut }) {
  const Icon = ku.ci_type === 'hardware' ? Server : Package
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={ku.display_name} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{ku.display_name}</p>
            <p className="text-xs text-muted-foreground truncate">{ku.email}</p>
          </div>
          <SourceBadge type={ku.user_type} />
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant="info">{ROLE_LABELS[ku.role] ?? ku.role}</Badge>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {[ku.job_title, ku.department].filter(Boolean).join(' · ') || '—'}
      </td>
      <td className="px-4 py-3">
        <Link to={`/ci/${ku.ci_id}`} className="flex items-center gap-2 group">
          <div className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded',
            ku.ci_type === 'hardware' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700',
          )}>
            <Icon size={12} />
          </div>
          <span className="text-sm font-medium text-foreground group-hover:text-brand transition-colors truncate max-w-[200px]">
            {ku.ci_name}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <Badge variant={CRIT_VARIANT[ku.ci_criticality] ?? 'muted'}>
          {CRIT_LABELS[ku.ci_criticality] ?? ku.ci_criticality}
        </Badge>
      </td>
    </tr>
  )
}

// ── Modal résultat import ──────────────────────────────────────────────────────

function ImportResultModal({ result, onClose }: { result: KeyUsersImportResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Import terminé</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">CIs traités</span>
            <span className="font-medium">{result.processed_cis}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">CIs introuvables</span>
            <span className={cn('font-medium', result.skipped_cis > 0 ? 'text-amber-600' : '')}>{result.skipped_cis}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Référents créés</span>
            <span className="font-medium text-green-600">{result.created}</span>
          </div>
        </div>
        <Button className="w-full mt-4" size="sm" onClick={onClose}>Fermer</Button>
      </div>
    </div>
  )
}

export default function KeyUsersDirectory() {
  const qc = useQueryClient()
  const { hasRole, can } = useAuth()
  const canWrite = can('keyusers:write')
  const fileRef = useRef<HTMLInputElement>(null)

  const [q, setQ]           = useState('')
  const [role, setRole]     = useState('')
  const [ciType, setCiType] = useState('')
  const [page, setPage]     = useState(0)
  const [importResult, setImportResult] = useState<KeyUsersImportResult | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const params = {
    ...(q      && { q }),
    ...(role   && { role }),
    ...(ciType && { ci_type: ciType }),
    skip: page * LIMIT,
    limit: LIMIT,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['keyusers-directory', params],
    queryFn: () => listAllKeyUsers(params),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const importMut = useMutation({
    mutationFn: (file: File) => importKeyUsers(file),
    onSuccess: (result) => {
      setImportResult(result)
      qc.invalidateQueries({ queryKey: ['keyusers-directory'] })
    },
  })

  const syncMut = useMutation({
    mutationFn: syncKeyUsers,
    onSuccess: (res) => {
      setSyncMsg(`${res.updated} référent${res.updated > 1 ? 's' : ''} mis à jour${res.errors > 0 ? ` (${res.errors} erreur${res.errors > 1 ? 's' : ''})` : ''}.`)
      qc.invalidateQueries({ queryKey: ['keyusers-directory'] })
      setTimeout(() => setSyncMsg(null), 4000)
    },
  })

  const total     = data?.total ?? 0
  const items     = data?.items ?? []
  const pageCount = Math.ceil(total / LIMIT)

  function reset() { setQ(''); setRole(''); setCiType(''); setPage(0) }
  const hasFilters = !!(q || role || ciType)

  return (
    <div className="space-y-5">
      {importResult && (
        <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Users size={20} className="text-brand" />
            Référents & Key Users
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vue transversale — qui est référent de quel CI dans toute la CMDB.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {total > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {total} entrée{total > 1 ? 's' : ''}
            </span>
          )}
          {canWrite && (
            <>
              <Button
                variant="secondary" size="sm"
                disabled={syncMut.isPending}
                onClick={() => syncMut.mutate()}
                title="Rafraîchit les infos EntraID/LDAP depuis la source de vérité"
              >
                <RefreshCw size={13} className={cn('mr-1', syncMut.isPending && 'animate-spin')} />
                Synchroniser
              </Button>
              <Button
                variant="secondary" size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={importMut.isPending}
              >
                <Upload size={13} className="mr-1" />
                {importMut.isPending ? 'Import…' : 'Importer CSV'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) { importMut.mutate(f); e.target.value = '' }
                }}
              />
            </>
          )}
          <Button variant="secondary" size="sm" onClick={() => exportKeyUsers()}>
            <Download size={13} className="mr-1" /> Exporter CSV
          </Button>
        </div>
      </div>

      {syncMsg && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 px-4 py-2.5 text-sm text-green-700 dark:text-green-300">
          {syncMsg}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setPage(0) }}
            placeholder="Nom, email, CI…"
            className="h-9 rounded border border-[hsl(var(--border))] bg-card pl-8 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] w-52"
          />
        </div>
        <select value={role} onChange={e => { setRole(e.target.value); setPage(0) }} className={SELECT}>
          <option value="">Tous les rôles</option>
          {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={ciType} onChange={e => { setCiType(e.target.value); setPage(0) }} className={SELECT}>
          <option value="">Matériel & Logiciel</option>
          <option value="hardware">Matériel uniquement</option>
          <option value="software">Logiciel uniquement</option>
        </select>
        {hasFilters && (
          <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
            Réinitialiser
          </button>
        )}
      </div>

      {/* Tableau */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Users size={32} className="mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {hasFilters ? 'Aucun référent ne correspond aux filtres.' : 'Aucun référent défini dans la CMDB.'}
            </p>
            <p className="text-xs text-muted-foreground/60">
              Ouvrez la fiche d'un CI → onglet Référents pour en ajouter un.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {['Utilisateur', 'Rôle', 'Service / Poste', 'CI', 'Criticité'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(ku => <Row key={ku.id} ku={ku} />)}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} sur {total}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="rounded p-1.5 hover:bg-muted disabled:opacity-40 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="px-2">Page {page + 1} / {pageCount}</span>
            <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
              className="rounded p-1.5 hover:bg-muted disabled:opacity-40 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
