import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, Search, Server, Package, Trash2, ShieldAlert, Upload, Download, Users, X } from 'lucide-react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { listCIs, deleteCI, exportCIs, bulkDeleteCIs, bulkMoveTeam, bulkExportCIs, type CIFilters } from '@/api/ci'
import type { CI, CIStatus, CICriticality } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { formatDate, cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import ImportCSVModal from '@/components/ci/ImportCSVModal'

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

const col = createColumnHelper<CI>()
const LIMIT = 50

const SELECT_CLASS =
  'h-9 rounded border border-[hsl(var(--border))] bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'

const HW_SUBTYPES: { value: string; label: string }[] = [
  { value: 'server',          label: 'Serveur' },
  { value: 'vm',              label: 'Machine virtuelle' },
  { value: 'workstation',     label: 'Poste de travail' },
  { value: 'terminal_server', label: 'Serveur de terminaux' },
  { value: 'network_device',  label: 'Équipement réseau' },
]
const HW_SUBTYPE_LABEL: Record<string, string> = Object.fromEntries(
  HW_SUBTYPES.map(s => [s.value, s.label])
)

function CveBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
      count >= 5 ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700',
    )}>
      <ShieldAlert size={9} />
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function CIList() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { hasRole, canWrite, canDelete } = useAuth()
  const qc = useQueryClient()

  // ci_type peut venir de l'URL (?ci_type=hardware) ou du select local
  const urlCiType = searchParams.get('ci_type') ?? ''
  const [ciType, setCiType]       = useState(urlCiType)
  const [search, setSearch]       = useState('')
  const [status, setStatus]       = useState('')
  const [criticality, setCrit]    = useState('')
  const [hasCves, setHasCves]         = useState('')   // '' | 'true' | 'false'
  const [hasKeyUsers, setHasKeyUsers] = useState('')   // '' | 'true' | 'false'
  const [hwSubtype, setHwSubtype]     = useState('')
  const [page, setPage]               = useState(0)
  const [showImport, setShowImport]   = useState(false)
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [showMoveTeam, setShowMoveTeam] = useState(false)
  const [newTeam, setNewTeam]           = useState('')

  // Sync si l'URL change (liens sidebar)
  useEffect(() => {
    setCiType(urlCiType)
    setPage(0)
    setSearch('')
    setStatus('')
    setCrit('')
    setHasCves('')
    setHasKeyUsers('')
    setHwSubtype('')
    setSelected(new Set())
  }, [urlCiType])

  const filters: CIFilters = {
    ...(ciType      && { ci_type: ciType }),
    ...(hwSubtype   && { hw_subtype: hwSubtype }),
    ...(search      && { search }),
    ...(status      && { status }),
    ...(criticality && { criticality }),
    ...(hasCves === 'true'        && { has_cves: true }),
    ...(hasCves === 'false'       && { has_cves: false }),
    ...(hasKeyUsers === 'true'    && { has_key_users: true }),
    ...(hasKeyUsers === 'false'   && { has_key_users: false }),
    skip: page * LIMIT,
    limit: LIMIT,
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['ci', filters],
    queryFn: () => listCIs(filters),
  })

  const deleteMut = useMutation({
    mutationFn: deleteCI,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ci'] }),
  })

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteCIs(ids),
    onSuccess: () => {
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['ci'] })
    },
  })

  const bulkMoveMut = useMutation({
    mutationFn: ({ ids, team }: { ids: string[]; team: string | null }) => bulkMoveTeam(ids, team),
    onSuccess: () => {
      setSelected(new Set())
      setShowMoveTeam(false)
      setNewTeam('')
      qc.invalidateQueries({ queryKey: ['ci'] })
    },
  })

  const pageIds = data?.items.map(ci => ci.id) ?? []
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id))

  function toggleAll() {
    if (allPageSelected) {
      setSelected(prev => { const s = new Set(prev); pageIds.forEach(id => s.delete(id)); return s })
    } else {
      setSelected(prev => { const s = new Set(prev); pageIds.forEach(id => s.add(id)); return s })
    }
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const columns = [
    col.display({
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={allPageSelected}
          onChange={toggleAll}
          className="h-3.5 w-3.5 rounded border-border accent-brand cursor-pointer"
        />
      ),
      cell: (info) => (
        <input
          type="checkbox"
          checked={selected.has(info.row.original.id)}
          onChange={() => toggleRow(info.row.original.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 rounded border-border accent-brand cursor-pointer"
        />
      ),
    }),
    col.accessor('name', {
      header: 'Nom',
      cell: (info) => {
        const ci = info.row.original
        return (
          <div className="flex items-center gap-2">
            {ci.ci_type === 'hardware'
              ? <Server size={14} className="shrink-0 text-muted-foreground" />
              : <Package size={14} className="shrink-0 text-muted-foreground" />}
            <span className="font-medium">{info.getValue()}</span>
            {ci.ci_type === 'software' && <CveBadge count={ci.cve_count} />}
          </div>
        )
      },
    }),
    col.accessor('ci_type', {
      header: 'Type',
      cell: (info) => {
        const ci = info.row.original
        const sub = ci.hardware_details?.hw_subtype
        return (
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="muted">{info.getValue() === 'hardware' ? 'Matériel' : 'Logiciel'}</Badge>
            {sub && (
              <Badge variant={sub === 'vm' ? 'info' : 'muted'} className="text-[10px] py-0">
                {HW_SUBTYPE_LABEL[sub] ?? sub}
              </Badge>
            )}
          </div>
        )
      },
    }),
    col.accessor('status', {
      header: 'Statut',
      cell: (info) => {
        const s = info.getValue() as CIStatus
        return <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABELS[s] ?? s}</Badge>
      },
    }),
    col.accessor('criticality', {
      header: 'Criticité',
      cell: (info) => {
        const c = info.getValue() as CICriticality
        return <Badge variant={CRIT_VARIANT[c]}>{CRIT_LABELS[c] ?? c}</Badge>
      },
    }),
    col.accessor('team', {
      header: 'Équipe',
      cell: (info) => info.getValue() ?? <span className="text-muted-foreground">—</span>,
    }),
    col.accessor('location', {
      header: 'Emplacement',
      cell: (info) => info.getValue() ?? <span className="text-muted-foreground">—</span>,
    }),
    col.accessor('updated_at', {
      header: 'Modifié',
      cell: (info) => <span className="text-muted-foreground">{formatDate(info.getValue())}</span>,
    }),
    col.display({
      id: 'actions',
      cell: (info) => canWrite ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm(`Supprimer « ${info.row.original.name} » ?`)) {
              deleteMut.mutate(info.row.original.id)
            }
          }}
          className="text-muted-foreground hover:text-red-600 transition-colors p-1 rounded"
        >
          <Trash2 size={14} />
        </button>
      ) : null,
    }),
  ]

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: data?.total ?? 0,
  })

  const title =
    ciType === 'hardware' ? 'Matériel' :
    ciType === 'software' ? 'Logiciels' :
    'Inventaire CI'
  const total = data?.total ?? 0

  function resetFilters() {
    setSearch(''); setStatus(''); setCrit(''); setHasCves(''); setHasKeyUsers(''); setHwSubtype(''); setPage(0); setSelected(new Set())
  }

  const hasActiveFilters = !!(search || status || criticality || hasCves || hasKeyUsers || hwSubtype)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? '…' : `${total} élément${total > 1 ? 's' : ''}`}
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => exportCIs({
              ci_type: ciType || undefined, status: status || undefined,
              criticality: criticality || undefined, hw_subtype: hwSubtype || undefined,
              search: search || undefined,
            })}>
              <Download size={14} className="mr-1" /> Exporter CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
              <Upload size={14} className="mr-1" /> Importer CSV
            </Button>
            <Button onClick={() => navigate('/ci/new')}>
              <Plus size={16} /> Nouveau CI
            </Button>
          </div>
        )}
      </div>

      <ImportCSVModal open={showImport} onClose={() => setShowImport(false)} />

      {/* Modal déplacement équipe */}
      {showMoveTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Déplacer vers une équipe</h3>
              <button onClick={() => setShowMoveTeam(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {selected.size} CI{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
            </p>
            <Input
              placeholder="Nom de l'équipe (vide pour retirer)"
              value={newTeam}
              onChange={(e) => setNewTeam(e.target.value)}
              className="mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowMoveTeam(false)}>
                Annuler
              </Button>
              <Button
                size="sm"
                disabled={bulkMoveMut.isPending}
                onClick={() => bulkMoveMut.mutate({ ids: [...selected], team: newTeam.trim() || null })}
              >
                {bulkMoveMut.isPending ? 'En cours…' : 'Déplacer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Barre d'actions de masse */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-md">
          <span className="text-sm font-medium text-foreground">
            {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
          </span>
          <div className="flex gap-2 ml-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => bulkExportCIs([...selected])}
            >
              <Download size={13} className="mr-1" /> Exporter
            </Button>
            {canWrite && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setNewTeam(''); setShowMoveTeam(true) }}
              >
                <Users size={13} className="mr-1" /> Déplacer équipe
              </Button>
            )}
            {canDelete && (
              <Button
                variant="danger"
                size="sm"
                disabled={bulkDeleteMut.isPending}
                onClick={() => {
                  if (confirm(`Supprimer ${selected.size} CI${selected.size > 1 ? 's' : ''} ?`)) {
                    bulkDeleteMut.mutate([...selected])
                  }
                }}
              >
                <Trash2 size={13} className="mr-1" />
                {bulkDeleteMut.isPending ? '…' : 'Supprimer'}
              </Button>
            )}
            <button
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          />
        </div>

        {/* Type (si pas fixé par l'URL) */}
        {!urlCiType && (
          <select
            className={SELECT_CLASS}
            value={ciType}
            onChange={(e) => { setCiType(e.target.value); setHwSubtype(''); setPage(0) }}
          >
            <option value="">Tous les types</option>
            <option value="hardware">Matériel</option>
            <option value="software">Logiciels</option>
          </select>
        )}

        {/* Sous-type matériel (visible si hardware ou pas de filtre type) */}
        {(ciType === 'hardware' || (!urlCiType && ciType !== 'software')) && (
          <select
            className={SELECT_CLASS}
            value={hwSubtype}
            onChange={(e) => { setHwSubtype(e.target.value); setPage(0) }}
          >
            <option value="">Tous les sous-types</option>
            {HW_SUBTYPES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        )}

        <select
          className={SELECT_CLASS}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0) }}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        <select
          className={SELECT_CLASS}
          value={criticality}
          onChange={(e) => { setCrit(e.target.value); setPage(0) }}
        >
          <option value="">Toutes criticités</option>
          {Object.entries(CRIT_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        <select
          className={SELECT_CLASS}
          value={hasCves}
          onChange={(e) => { setHasCves(e.target.value); setPage(0) }}
        >
          <option value="">Toute exposition</option>
          <option value="true">Avec CVEs</option>
          <option value="false">Sans CVE</option>
        </select>

        <select
          className={SELECT_CLASS}
          value={hasKeyUsers}
          onChange={(e) => { setHasKeyUsers(e.target.value); setPage(0) }}
        >
          <option value="">Tous référents</option>
          <option value="true">Avec référents</option>
          <option value="false">Sans référent</option>
        </select>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : error ? (
          <div className="p-6 text-center text-sm text-red-600">
            Erreur lors du chargement. Veuillez réessayer.
          </div>
        ) : data?.items.length === 0 ? (
          <div className="py-14 text-center">
            <p className="font-medium text-foreground">Aucun élément trouvé</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasActiveFilters ? 'Modifiez les filtres ou ' : ''}
              Ajoutez un nouveau CI.
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b bg-muted/50">
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => navigate(`/ci/${row.original.id}`)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {total > LIMIT && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} sur {total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={(page + 1) * LIMIT >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
