import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Server, Package, Siren, ClipboardList, ShieldAlert, Loader2, X } from 'lucide-react'
import { globalSearch, type SearchResult } from '@/api/search'
import { cn } from '@/lib/utils'

// ── Icônes & labels par type ──────────────────────────────────────────────────

const TYPE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  ci:       { icon: Server,        label: 'CI',       color: 'text-purple-600 bg-purple-50' },
  incident: { icon: Siren,         label: 'Incident', color: 'text-red-600 bg-red-50' },
  change:   { icon: ClipboardList, label: 'RFC',      color: 'text-blue-600 bg-blue-50' },
  cve:      { icon: ShieldAlert,   label: 'CVE',      color: 'text-orange-600 bg-orange-50' },
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function GlobalSearch() {
  const navigate  = useNavigate()
  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [active,  setActive]  = useState(0)
  const inputRef  = useRef<HTMLInputElement>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ctrl+K / ⌘K global
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus input quand ouvert
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setResults([])
      setActive(0)
    }
  }, [open])

  // Debounce recherche
  const search = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.trim().length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const res = await globalSearch(q.trim())
        setResults(res.results)
        setActive(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    search(v)
  }

  const go = (result: SearchResult) => {
    navigate(result.url)
    setOpen(false)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && results[active]) go(results[active])
    if (e.key === 'Escape') setOpen(false)
  }

  // Groupement par type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = []
    acc[r.type].push(r)
    return acc
  }, {})

  // Index plat pour la navigation clavier
  const flat = results

  return (
    <>
      {/* Bouton déclencheur dans la Topbar */}
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 rounded-lg border border-input bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-48 lg:w-64"
      >
        <Search size={14} className="shrink-0" />
        <span className="flex-1 text-left truncate">Rechercher…</span>
        <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border border-input bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          Ctrl K
        </kbd>
      </button>

      {/* Bouton mobile (icône seule) */}
      <button
        onClick={() => setOpen(true)}
        className="sm:hidden flex items-center justify-center h-8 w-8 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Rechercher"
      >
        <Search size={17} />
      </button>

      {/* Modal command palette */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl bg-card border shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              {loading
                ? <Loader2 size={16} className="shrink-0 text-muted-foreground animate-spin" />
                : <Search size={16} className="shrink-0 text-muted-foreground" />
              }
              <input
                ref={inputRef}
                value={query}
                onChange={handleChange}
                onKeyDown={handleKey}
                placeholder="Rechercher un CI, incident, RFC, CVE…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
              <kbd
                className="shrink-0 rounded border border-input bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground cursor-pointer"
                onClick={() => setOpen(false)}
              >
                Esc
              </kbd>
            </div>

            {/* Résultats */}
            <div className="max-h-[60vh] overflow-y-auto">
              {query.trim().length >= 2 && !loading && results.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Aucun résultat pour « {query} »
                </div>
              )}

              {Object.entries(grouped).map(([type, items]) => {
                const meta = TYPE_META[type] ?? TYPE_META.ci
                return (
                  <div key={type}>
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b">
                      <meta.icon size={12} className={cn('shrink-0', meta.color.split(' ')[0])} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {meta.label}
                      </span>
                    </div>
                    {items.map(item => {
                      const globalIdx = flat.indexOf(item)
                      const isActive  = globalIdx === active
                      return (
                        <button
                          key={item.id}
                          className={cn(
                            'flex items-center gap-3 w-full px-4 py-3 text-left transition-colors border-b last:border-0',
                            isActive ? 'bg-brand/8 text-foreground' : 'hover:bg-muted/40 text-foreground',
                          )}
                          onClick={() => go(item)}
                          onMouseEnter={() => setActive(globalIdx)}
                        >
                          <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs', meta.color)}>
                            <meta.icon size={13} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                          </div>
                          {isActive && (
                            <kbd className="shrink-0 rounded border border-input bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              ↵
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}

              {!query && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Tapez au moins 2 caractères pour rechercher
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
