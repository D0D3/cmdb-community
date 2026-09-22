import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Search, Server, Package } from 'lucide-react'
import { listCIs, addRelation } from '@/api/ci'
import type { CI, RelationType } from '@/types/api'
import Spinner from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

const RELATION_TYPES: { value: RelationType; label: string }[] = [
  { value: 'depends_on',   label: 'Dépend de' },
  { value: 'hosted_on',    label: 'Hébergé sur' },
  { value: 'connected_to', label: 'Connecté à' },
  { value: 'assigned_to',  label: 'Assigné à' },
]

const STATUS_DOT: Record<string, string> = {
  in_service:  'bg-green-500',
  maintenance: 'bg-amber-500',
  retired:     'bg-red-400',
  in_stock:    'bg-slate-400',
  ordered:     'bg-blue-400',
}

interface Props {
  ciId: string
  ciName: string
  onClose: () => void
}

export default function AddRelationModal({ ciId, ciName, onClose }: Props) {
  const [search, setSearch]             = useState('')
  const [dropOpen, setDropOpen]         = useState(false)
  const [target, setTarget]             = useState<CI | null>(null)
  const [relType, setRelType]           = useState<RelationType>('depends_on')
  const inputRef                        = useRef<HTMLInputElement>(null)
  const qc                              = useQueryClient()

  const { data: results, isFetching } = useQuery({
    queryKey: ['ci-search-relation', search],
    queryFn: () => listCIs({ search, limit: 8 }),
    enabled: search.trim().length >= 2,
    staleTime: 30_000,
  })

  const mutation = useMutation({
    mutationFn: () => addRelation(ciId, { target_ci_id: target!.id, relation_type: relType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ci', ciId, 'relations'] })
      qc.invalidateQueries({ queryKey: ['ci-graph', ciId] })
      onClose()
    },
  })

  const showDrop = dropOpen && search.trim().length >= 2 && (results?.items?.length ?? 0) > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Ajouter une relation</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Source : <span className="font-medium text-foreground">{ciName}</span></p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Type de relation */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Type de relation</label>
            <div className="grid grid-cols-2 gap-2">
              {RELATION_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  onClick={() => setRelType(rt.value)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    relType === rt.value
                      ? 'border-brand bg-brand/5 text-brand'
                      : 'border-border text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {rt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sélecteur CI cible */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">CI cible</label>
            {target ? (
              <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2">
                {target.ci_type === 'hardware'
                  ? <Server size={14} className="text-purple-600 shrink-0" />
                  : <Package size={14} className="text-blue-600 shrink-0" />
                }
                <span className="flex-1 text-sm font-medium text-foreground truncate">{target.name}</span>
                <button onClick={() => { setTarget(null); setSearch('') }} className="text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setDropOpen(true) }}
                  onFocus={() => setDropOpen(true)}
                  onBlur={() => setTimeout(() => setDropOpen(false), 150)}
                  placeholder="Rechercher un CI…"
                  className="w-full h-9 rounded-md border border-border bg-background pl-8 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {isFetching && (
                  <div className="absolute right-2.5 top-2"><Spinner size="sm" /></div>
                )}
                {showDrop && (
                  <div className="absolute top-full left-0 right-0 z-30 mt-1 rounded-md border bg-card shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                    {results!.items
                      .filter((c) => c.id !== ciId)
                      .map((c) => {
                        const Icon = c.ci_type === 'hardware' ? Server : Package
                        return (
                          <button
                            key={c.id}
                            onMouseDown={() => { setTarget(c); setSearch(''); setDropOpen(false) }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
                          >
                            <div className={cn(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded',
                              c.ci_type === 'hardware' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700',
                            )}>
                              <Icon size={12} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[c.status] ?? 'bg-slate-300')} />
                                {c.status.replace('_', ' ')}
                                {c.team && <><span>·</span><span>{c.team}</span></>}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!target || mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending && <Spinner size="sm" />}
            Ajouter
          </button>
        </div>

        {mutation.isError && (
          <p className="px-5 pb-3 text-xs text-red-500">
            Erreur : {(mutation.error as Error).message}
          </p>
        )}
      </div>
    </div>
  )
}
