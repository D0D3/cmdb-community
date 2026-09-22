import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Copy, Trash2, Check, Key, ShieldCheck } from 'lucide-react'
import { listMyTokens, listAllTokens, createToken, revokeToken } from '@/api/tokens'
import type { ApiToken } from '@/types/api'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// ── Scopes disponibles ─────────────────────────────────────────────────────────

const SCOPES: { value: string; label: string; desc: string }[] = [
  { value: 'read:ci',        label: 'Lecture CIs',      desc: 'Consulter les CIs, relations, SLAs' },
  { value: 'write:ci',       label: 'Écriture CIs',     desc: 'Créer / modifier / supprimer des CIs' },
  { value: 'read:alerts',    label: 'Lecture alertes',  desc: 'Consulter les alertes et échéances' },
  { value: 'write:alerts',   label: 'Gestion alertes',  desc: 'Résoudre et gérer les alertes' },
  { value: 'read:incidents', label: 'Lecture incidents', desc: 'Consulter les incidents' },
  { value: 'write:incidents',label: 'Gestion incidents',desc: 'Créer et gérer les incidents' },
  { value: 'read:changes',   label: 'Lecture RFC',       desc: 'Consulter les demandes de changement' },
  { value: 'write:changes',  label: 'Gestion RFC',       desc: 'Créer et gérer les RFC' },
  { value: 'read:reports',   label: 'Rapports',          desc: 'Accéder aux exports et rapports' },
  { value: 'admin',          label: 'Admin complet',     desc: 'Accès complet à toutes les ressources' },
]

// ── Modal création ─────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (tok: ApiToken) => void }) {
  const qc = useQueryClient()
  const [name, setName]         = useState('')
  const [scopes, setScopes]     = useState<string[]>(['read:ci'])
  const [expires, setExpires]   = useState('')

  const mut = useMutation({
    mutationFn: createToken,
    onSuccess: (tok) => {
      qc.invalidateQueries({ queryKey: ['my-tokens'] })
      qc.invalidateQueries({ queryKey: ['all-tokens'] })
      onCreated(tok)
    },
  })

  const toggleScope = (s: string) => {
    if (s === 'admin') { setScopes(['admin']); return }
    setScopes((prev) =>
      prev.includes('admin') ? [s]
      : prev.includes(s) ? prev.filter((x) => x !== s)
      : [...prev, s]
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-card border shadow-xl p-6 space-y-5">
        <h2 className="text-base font-semibold text-foreground">Créer un token API</h2>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Nom *</label>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Monitoring Zabbix" />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Expiration (optionnel)</label>
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Permissions</label>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {SCOPES.map((s) => {
              const checked = scopes.includes(s.value) || scopes.includes('admin')
              return (
                <label key={s.value} className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleScope(s.value)}
                    className="mt-0.5 accent-brand"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground leading-none">{s.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {mut.isError && <p className="text-sm text-red-600">Erreur lors de la création.</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-[hsl(var(--border))]">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button disabled={!name.trim() || scopes.length === 0 || mut.isPending} onClick={() => {
            mut.mutate({
              name: name.trim(),
              scopes,
              expires_at: expires || null,
            })
          }}>
            {mut.isPending ? 'Création…' : 'Créer'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Modal affichage token (affiché une seule fois) ─────────────────────────────

function TokenDisplay({ token, onClose }: { token: ApiToken; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(token.token!)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-card border shadow-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-green-600" />
          <h2 className="text-base font-semibold text-foreground">Token créé</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Copiez ce token maintenant — il ne sera plus affiché après fermeture de cette fenêtre.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono text-foreground break-all select-all">
            {token.token}
          </code>
          <button
            onClick={copy}
            className="shrink-0 rounded p-2 border border-[hsl(var(--border))] bg-card hover:bg-muted transition-colors"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Utilisez l'en-tête HTTP : <code className="bg-muted px-1 rounded">X-API-Token: &lt;token&gt;</code>
        </p>
        <div className="flex justify-end pt-2 border-t border-[hsl(var(--border))]">
          <Button onClick={onClose}>Compris, fermer</Button>
        </div>
      </div>
    </div>
  )
}

// ── Ligne token ────────────────────────────────────────────────────────────────

function TokenRow({ tok, onRevoke, showAuthor }: { tok: ApiToken; onRevoke: () => void; showAuthor?: boolean }) {
  const isExpired = tok.expires_at ? new Date(tok.expires_at) < new Date() : false
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Key size={13} className="text-muted-foreground" />
          <span className="font-medium text-foreground text-sm">{tok.name}</span>
        </div>
        {showAuthor && tok.created_by_name && (
          <p className="text-xs text-muted-foreground mt-0.5 pl-5">{tok.created_by_name}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {tok.scopes.map((s) => (
            <span key={s} className="rounded-full bg-brand/10 text-brand text-[10px] px-2 py-0.5 font-medium">
              {s}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {tok.expires_at
          ? <span className={isExpired ? 'text-red-600 font-medium' : ''}>{formatDate(tok.expires_at)}{isExpired ? ' (expiré)' : ''}</span>
          : <span className="text-muted-foreground/50">—</span>
        }
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {tok.last_used_at ? formatDate(tok.last_used_at) : <span className="text-muted-foreground/50">Jamais</span>}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(tok.created_at)}</td>
      <td className="px-4 py-3">
        <button
          onClick={() => { if (confirm(`Révoquer le token « ${tok.name} » ?`)) onRevoke() }}
          className="text-muted-foreground hover:text-red-600 transition-colors p-1 rounded"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TokensAdmin() {
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const qc = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [newToken, setNewToken]     = useState<ApiToken | null>(null)
  const [tab, setTab]               = useState<'mine' | 'all'>('mine')

  const { data: myTokens, isLoading: lMine } = useQuery({
    queryKey: ['my-tokens'],
    queryFn: listMyTokens,
    staleTime: 30_000,
  })

  const { data: allTokens, isLoading: lAll } = useQuery({
    queryKey: ['all-tokens'],
    queryFn: listAllTokens,
    staleTime: 30_000,
    enabled: isAdmin && tab === 'all',
  })

  const revokeMut = useMutation({
    mutationFn: revokeToken,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tokens'] })
      qc.invalidateQueries({ queryKey: ['all-tokens'] })
    },
  })

  const tokens = tab === 'all' ? allTokens : myTokens
  const isLoading = tab === 'all' ? lAll : lMine

  const TH = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tokens API</h1>
          <p className="text-sm text-muted-foreground">Authentification machine-à-machine via <code className="bg-muted px-1 rounded text-xs">X-API-Token</code></p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={15} /> Nouveau token
        </Button>
      </div>

      {/* Tabs admin */}
      {isAdmin && (
        <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
          {(['mine', 'all'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'mine' ? 'Mes tokens' : 'Tous les tokens'}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !tokens?.length ? (
          <div className="py-14 text-center">
            <Key size={28} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">Aucun token actif</p>
            <p className="text-xs text-muted-foreground mt-1">Créez un token pour connecter des outils externes à la CMDB</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={TH}>Nom {tab === 'all' ? '/ Créé par' : ''}</th>
                <th className={TH}>Permissions</th>
                <th className={TH}>Expiration</th>
                <th className={TH}>Dernière utilisation</th>
                <th className={TH}>Créé le</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((tok) => (
                <TokenRow
                  key={tok.id}
                  tok={tok}
                  showAuthor={tab === 'all'}
                  onRevoke={() => revokeMut.mutate(tok.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Encart documentation */}
      <div className="rounded-xl border bg-muted/20 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Utilisation de l'API</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Ajoutez l'en-tête <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">X-API-Token</code> à toutes vos requêtes :</p>
          <pre className="rounded bg-muted px-4 py-3 text-xs font-mono overflow-x-auto text-foreground">
{`curl ${window.location.origin}/api/ci/ \\
  -H "X-API-Token: cmdb_xxxxxxxxxxxxxxxxxxxx"`}
          </pre>
          <p>La documentation complète est disponible sur <a href="/api/docs" target="_blank" rel="noreferrer" className="text-brand hover:underline">/api/docs</a>.</p>
        </div>
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(tok) => { setShowCreate(false); setNewToken(tok) }}
        />
      )}
      {newToken && (
        <TokenDisplay token={newToken} onClose={() => setNewToken(null)} />
      )}
    </div>
  )
}
