import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Network, Search, Server, Package, X } from 'lucide-react'
import { listCIs, getCIGraph, getCI } from '@/api/ci'
import type { CI } from '@/types/api'
import CIGraph from '@/components/ci/CIGraph'
import Spinner from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

const STATUS_DOT: Record<string, string> = {
  in_service:  'bg-green-500',
  maintenance: 'bg-amber-500',
  retired:     'bg-red-400',
  in_stock:    'bg-slate-400',
  ordered:     'bg-blue-400',
}
const CRIT_LABEL: Record<string, string> = {
  critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Faible',
}

function CIPickerResult({ ci, onSelect }: { ci: CI; onSelect: (ci: CI) => void }) {
  const Icon = ci.ci_type === 'hardware' ? Server : Package
  return (
    <button
      onMouseDown={() => onSelect(ci)}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
    >
      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
        ci.ci_type === 'hardware' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700',
      )}>
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{ci.name}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[ci.status] ?? 'bg-slate-300')} />
          <span>{ci.status.replace('_', ' ')}</span>
          {ci.team && <><span>·</span><span>{ci.team}</span></>}
        </div>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {CRIT_LABEL[ci.criticality] ?? ci.criticality}
      </span>
    </button>
  )
}

export default function GraphExplorer() {
  const [searchParams] = useSearchParams()
  const ciParam = searchParams.get('ci')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedCI, setSelectedCI] = useState<CI | null>(null)
  const [depth, setDepth] = useState<1 | 2 | 3 | 4 | 5>(2)
  const inputRef = useRef<HTMLInputElement>(null)

  // Pré-sélection depuis ?ci=<id> (lien depuis Parc Virtuel)
  useEffect(() => {
    if (!ciParam || selectedCI?.id === ciParam) return
    getCI(ciParam).then(ci => setSelectedCI(ci)).catch(() => {})
  }, [ciParam])

  const { data: results, isFetching } = useQuery({
    queryKey: ['ci-search', search],
    queryFn: () => listCIs({ search, limit: 8 }),
    enabled: search.trim().length >= 2,
    staleTime: 30_000,
  })

  const { data: graphData, isLoading: graphLoading } = useQuery({
    queryKey: ['ci-graph-explorer', selectedCI?.id, depth],
    queryFn: () => getCIGraph(selectedCI!.id, depth),
    enabled: !!selectedCI,
    staleTime: 60_000,
  })

  function handleSelect(ci: CI) {
    setSelectedCI(ci)
    setSearch('')
    setOpen(false)
    inputRef.current?.blur()
  }

  function handleClear() {
    setSelectedCI(null)
    setSearch('')
    setOpen(false)
  }

  const showDropdown = open && search.trim().length >= 2 && (results?.items?.length ?? 0) > 0

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Network size={20} className="text-brand" />
            Cartographie CMDB
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Explorez les dépendances entre CIs jusqu'à 5 niveaux de profondeur.
          </p>
        </div>
      </div>

      {/* Sélecteur CI */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-72">
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Rechercher un CI…"
            className="w-full h-9 rounded-md border border-[hsl(var(--border))] bg-card pl-8 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
          {isFetching && (
            <div className="absolute right-2.5 top-2">
              <Spinner size="sm" />
            </div>
          )}
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 z-30 mt-1 rounded-md border bg-card shadow-lg overflow-hidden">
              {results!.items.map((ci) => (
                <CIPickerResult key={ci.id} ci={ci} onSelect={handleSelect} />
              ))}
            </div>
          )}
        </div>

        {selectedCI && (
          <div className="flex items-center gap-2 rounded-md border bg-brand/5 border-brand/20 px-3 py-1.5 text-sm">
            <span className="font-medium text-brand">{selectedCI.name}</span>
            <button onClick={handleClear} className="text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          </div>
        )}

        {!selectedCI && (
          <p className="text-sm text-muted-foreground">
            Sélectionnez un CI pour visualiser ses dépendances.
          </p>
        )}
      </div>

      {/* Graph */}
      {selectedCI ? (
        graphLoading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : graphData ? (
          <CIGraph
            data={graphData}
            rootId={selectedCI.id}
            depth={depth}
            onDepthChange={setDepth}
          />
        ) : null
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 min-h-[400px] rounded-xl border border-dashed gap-4 text-center">
          <Network size={40} className="text-muted-foreground/25" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Aucun CI sélectionné
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Recherchez un CI ci-dessus pour démarrer l'exploration.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
