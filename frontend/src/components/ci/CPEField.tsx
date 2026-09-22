import { useRef, useState } from 'react'
import { Wand2, Loader2, CheckCircle2, ExternalLink, X } from 'lucide-react'
import { suggestCPE, type CPESuggestion } from '@/api/ci'
import { cn } from '@/lib/utils'

interface Props {
  vendor?: string
  product?: string
  version?: string
  value: string
  onChange: (v: string) => void
  inputCls: (err?: string) => string
}

export default function CPEField({ vendor, product, version, value, onChange, inputCls }: Props) {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<CPESuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  async function detect() {
    if (!vendor && !product) {
      setError('Renseignez au moins l\'éditeur ou le produit pour détecter le CPE.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await suggestCPE(vendor, product, version)
      setSuggestions(res)
      setOpen(res.length > 0)
      if (res.length === 0) setError('Aucun CPE trouvé — vous pouvez le saisir manuellement.')
    } catch {
      setError('Erreur lors de la recherche CPE.')
    } finally {
      setLoading(false)
    }
  }

  function pick(cpe: string) {
    onChange(cpe)
    setOpen(false)
    setSuggestions([])
  }

  return (
    <div ref={containerRef} className="space-y-1.5">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="cpe:2.3:a:vendor:product:version:*:*:*:*:*:*:*"
          className={cn(inputCls(), 'flex-1 font-mono text-xs')}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="Effacer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card hover:bg-muted transition-colors text-muted-foreground"
          >
            <X size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={detect}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-brand bg-brand/10 px-3 py-2 text-xs font-medium text-brand hover:bg-brand/20 transition-colors disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
          Détecter
        </button>
      </div>

      {error && (
        <p className="text-xs text-amber-600">{error}</p>
      )}

      {open && suggestions.length > 0 && (
        <div className="relative z-50">
          <div className="absolute top-0 left-0 right-0 rounded-md border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
              <span className="text-xs text-muted-foreground">{suggestions.length} suggestion{suggestions.length > 1 ? 's' : ''}</span>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            </div>
            <ul className="max-h-52 overflow-y-auto divide-y divide-border">
              {suggestions.map((s) => (
                <li key={s.cpe_name}>
                  <button
                    type="button"
                    onClick={() => pick(s.cpe_name)}
                    className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted transition-colors"
                  >
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-foreground">{s.cpe_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.title}</p>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                      s.source === 'nvd'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700',
                    )}>
                      {s.source === 'nvd' ? 'NVD' : 'auto'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-3 py-1.5">
              <a
                href="https://nvd.nist.gov/products/cpe/search"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink size={10} />
                Rechercher sur NVD
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
