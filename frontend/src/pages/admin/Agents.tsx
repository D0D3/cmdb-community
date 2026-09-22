import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, Plus, Trash2, Copy, Check, Download, Server, Monitor, Cloud, Network, Terminal } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  listAgentTokens, createAgentToken, revokeAgentToken,
  downloadInstaller, downloadNativeInstaller,
  downloadScript, downloadNativeRaw,
  type AgentTokenOut, type AgentTokenCreated,
} from '@/api/agents'
import { cn } from '@/lib/utils'

const HW_SUBTYPES = [
  { value: 'workstation', label: 'Poste de travail', icon: Monitor },
  { value: 'server',      label: 'Serveur',          icon: Server },
  { value: 'vm',          label: 'Machine virtuelle', icon: Cloud },
  { value: 'terminal_server', label: 'Terminal Server', icon: Terminal },
  { value: 'network_device',  label: 'Équipement réseau', icon: Network },
]

type OsVal = 'linux' | 'windows' | 'macos'
type AgentKind = 'python' | 'native'

const OS_OPTIONS: { value: OsVal; label: string; ext: string; nativeExt: string }[] = [
  { value: 'linux',   label: 'Linux',   ext: '.sh',  nativeExt: '.sh'   },
  { value: 'windows', label: 'Windows', ext: '.ps1', nativeExt: '.ps1'  },
  { value: 'macos',   label: 'macOS',   ext: '.sh',  nativeExt: '.sh'   },
]

const NATIVE_INFO: Record<OsVal, { prereq: string; conf: string; exec: string }> = {
  linux: {
    prereq: 'bash, curl',
    conf: 'sudo tee /etc/cmdb-agent.conf <<\'EOF\'\nCMDB_URL=https://cmdb.example.com\nCMDB_TOKEN=cagt_xxxx\nEOF\nsudo chmod 600 /etc/cmdb-agent.conf',
    exec: 'chmod +x cmdb-agent-linux.sh && sudo ./cmdb-agent-linux.sh',
  },
  windows: {
    prereq: 'PowerShell 5.1+',
    conf: '$env:CMDB_URL="https://cmdb.example.com"\n$env:CMDB_TOKEN="cagt_xxxx"',
    exec: 'Set-ExecutionPolicy RemoteSigned -Scope CurrentUser\n.\\cmdb-agent-windows.ps1 -CmdbUrl "https://..." -CmdbToken "cagt_xxxx"',
  },
  macos: {
    prereq: 'bash, curl (inclus dans macOS)',
    conf: 'sudo tee /etc/cmdb-agent.conf <<\'EOF\'\nCMDB_URL=https://cmdb.example.com\nCMDB_TOKEN=cagt_xxxx\nEOF\nsudo chmod 600 /etc/cmdb-agent.conf',
    exec: 'chmod +x cmdb-agent-macos.sh && sudo ./cmdb-agent-macos.sh',
  },
}

function CopyButton({ text, label = 'Copier' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
      {copied ? 'Copié !' : label}
    </button>
  )
}

function NewTokenModal({ onClose, onCreate }: { onClose: () => void; onCreate: (t: AgentTokenCreated) => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const mut = useMutation({ mutationFn: createAgentToken })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = await mut.mutateAsync({ name, description: desc || undefined })
    onCreate(token)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <h3 className="mb-4 text-base font-semibold">Nouveau token d'agent</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nom *</label>
            <input
              value={name} onChange={e => setName(e.target.value)} required
              placeholder="ex : Token PC-JOHN / Serveur-PROD-01"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <input
              value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Optionnel — localisation, responsable..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <p className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            Le token brut ne sera affiché qu'une seule fois après la création.
            Conservez-le pour générer l'installeur.
          </p>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={!name || mut.isPending}
              className="flex-1 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50">
              {mut.isPending ? 'Création…' : 'Créer le token'}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TokenRevealModal({
  token, onClose,
}: { token: AgentTokenCreated; onClose: () => void }) {
  const [os, setOs]           = useState<OsVal>('linux')
  const [kind, setKind]       = useState<AgentKind>('native')
  const [hwSubtype, setHwSubtype] = useState('workstation')
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const osOpt = OS_OPTIONS.find(o => o.value === os)!
      let blob: Blob
      let filename: string
      if (kind === 'native') {
        blob = await downloadNativeInstaller(token.id, token.raw_token, os, hwSubtype)
        filename = `cmdb_agent_installer_native_${os}${osOpt.nativeExt}`
      } else {
        blob = await downloadInstaller(token.id, token.raw_token, os, hwSubtype)
        filename = `cmdb_agent_installer_${os}${osOpt.ext}`
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const osOpt = OS_OPTIONS.find(o => o.value === os)!
  const execHint = kind === 'native'
    ? (os === 'windows'
        ? 'Clic droit > Exécuter avec PowerShell (Administrateur)'
        : `chmod +x cmdb_agent_installer_native_${os}.sh && sudo ./cmdb_agent_installer_native_${os}.sh`)
    : (os === 'windows'
        ? 'Clic droit > Exécuter avec PowerShell (Administrateur)'
        : `chmod +x cmdb_agent_installer_${os}.sh && sudo ./cmdb_agent_installer_${os}.sh`)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
        <h3 className="mb-1 text-base font-semibold text-green-600 dark:text-green-400">Token créé — {token.name}</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Copiez ce token maintenant — il ne sera plus affiché.
        </p>

        {/* Token brut */}
        <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <code className="flex-1 break-all font-mono text-xs">{token.raw_token}</code>
          <CopyButton text={token.raw_token} label="Copier" />
        </div>

        {/* Type d'agent */}
        <div className="mb-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Type d'agent</p>
          <div className="mb-3 flex gap-1">
            {([
              { v: 'native' as AgentKind, label: 'Natif (Shell / PowerShell)', desc: 'curl ou CIM — aucune dépendance Python' },
              { v: 'python' as AgentKind, label: 'Python (psutil)',             desc: 'Compatible tous OS — nécessite pip install psutil' },
            ]).map(k => (
              <button key={k.v} onClick={() => setKind(k.v)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors',
                  kind === k.v ? 'border-brand bg-brand text-brand-foreground' : 'border-border hover:bg-accent',
                )}>
                <div>{k.label}</div>
                <div className={cn('text-[10px] mt-0.5', kind === k.v ? 'text-brand-foreground/70' : 'text-muted-foreground')}>{k.desc}</div>
              </button>
            ))}
          </div>

          {/* Sélecteur OS */}
          <p className="mb-1 text-xs font-medium text-muted-foreground">Système cible</p>
          <div className="mb-2 flex gap-1">
            {OS_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setOs(o.value)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  os === o.value ? 'border-brand bg-brand text-brand-foreground' : 'border-border hover:bg-accent',
                )}>
                {o.label}
              </button>
            ))}
          </div>

          {/* Type de machine */}
          <div className="flex flex-wrap gap-1">
            {HW_SUBTYPES.map(s => {
              const Icon = s.icon
              return (
                <button key={s.value} onClick={() => setHwSubtype(s.value)}
                  className={cn(
                    'flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
                    hwSubtype === s.value ? 'border-brand bg-brand/10 text-brand' : 'border-border hover:bg-accent',
                  )}>
                  <Icon size={11} />{s.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Instruction d'exécution */}
        <div className="mb-4 rounded-md bg-muted/50 px-3 py-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Après téléchargement :</p>
          <code className="break-all text-xs whitespace-pre-wrap">{execHint}</code>
        </div>

        <div className="flex gap-2">
          <button onClick={handleDownload} disabled={downloading}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50">
            <Download size={15} />
            {downloading ? 'Génération…' : `Télécharger installeur ${osOpt.label} (${kind === 'native' ? 'Natif' : 'Python'})`}
          </button>
          <button onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

function TokenRow({ token, onRevoke }: { token: AgentTokenOut; onRevoke: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      {/* Status dot */}
      <div className={cn(
        'h-2 w-2 shrink-0 rounded-full',
        token.revoked ? 'bg-destructive' : token.last_seen_at ? 'bg-green-500' : 'bg-yellow-400',
      )} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{token.name}</span>
          {token.revoked && (
            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">révoqué</span>
          )}
        </div>
        {token.description && (
          <p className="text-xs text-muted-foreground truncate">{token.description}</p>
        )}
      </div>

      <div className="shrink-0 text-right text-xs text-muted-foreground">
        {token.last_seen_at ? (
          <>
            <p className="font-medium text-foreground">{token.last_seen_hostname}</p>
            <p>vu {formatDistanceToNow(new Date(token.last_seen_at), { addSuffix: true, locale: fr })}</p>
          </>
        ) : (
          <p>Jamais connecté</p>
        )}
      </div>

      <div className="shrink-0 text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(token.created_at), { addSuffix: true, locale: fr })}
      </div>

      {!token.revoked && (
        confirming ? (
          <div className="flex items-center gap-1">
            <button onClick={() => onRevoke(token.id)}
              className="rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground hover:bg-destructive/90">
              Confirmer
            </button>
            <button onClick={() => setConfirming(false)}
              className="rounded border border-border px-2 py-1 text-xs hover:bg-accent">
              Annuler
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)}
            className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:border-destructive hover:text-destructive transition-colors">
            <Trash2 size={14} />
          </button>
        )
      )}
    </div>
  )
}

export default function AgentsAdmin() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [revealed, setRevealed] = useState<AgentTokenCreated | null>(null)
  const [dlOs, setDlOs]     = useState<OsVal>('linux')
  const [dlKind, setDlKind] = useState<AgentKind>('native')
  const [dlLoading, setDlLoading] = useState(false)

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['agent-tokens'],
    queryFn: listAgentTokens,
  })

  const revokeMut = useMutation({
    mutationFn: revokeAgentToken,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-tokens'] }),
  })

  const handleCreate = (t: AgentTokenCreated) => {
    qc.invalidateQueries({ queryKey: ['agent-tokens'] })
    setShowNew(false)
    setRevealed(t)
  }

  const handleDownloadRaw = async () => {
    setDlLoading(true)
    try {
      let blob: Blob
      let filename: string
      if (dlKind === 'python') {
        blob = await downloadScript()
        filename = 'cmdb_agent.py'
      } else {
        blob = await downloadNativeRaw(dlOs)
        filename = dlOs === 'windows' ? 'cmdb-agent-windows.ps1'
                 : dlOs === 'macos'   ? 'cmdb-agent-macos.sh'
                 : 'cmdb-agent-linux.sh'
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDlLoading(false)
    }
  }

  const active = tokens.filter(t => !t.revoked)
  const revoked = tokens.filter(t => t.revoked)

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {showNew && (
        <NewTokenModal onClose={() => setShowNew(false)} onCreate={handleCreate} />
      )}
      {revealed && (
        <TokenRevealModal token={revealed} onClose={() => setRevealed(null)} />
      )}

      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
            <Bot size={20} className="text-brand" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Agents natifs</h1>
            <p className="text-sm text-muted-foreground">
              Déployez l'agent sur vos machines pour des inventaires automatiques quotidiens.
            </p>
          </div>
        </div>
      </div>

      {/* Téléchargement script brut */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Scripts agents (bruts)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Scripts sans credentials embarqués — pour inspection, déploiement via outils tiers, ou configuration manuelle.
          Les installeurs auto-configurés (avec token) sont disponibles lors de la création d'un token ci-dessous.
        </p>

        {/* Type d'agent */}
        <div className="mb-3 flex gap-1">
          {([
            { v: 'native' as AgentKind, label: 'Natif', sub: 'Shell (Linux / macOS) ou PowerShell' },
            { v: 'python' as AgentKind, label: 'Python',sub: 'Compatible tous OS — nécessite psutil' },
          ]).map(k => (
            <button key={k.v} onClick={() => setDlKind(k.v)}
              className={cn(
                'flex-1 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors',
                dlKind === k.v ? 'border-brand bg-brand text-brand-foreground' : 'border-border hover:bg-accent',
              )}>
              <div>{k.label}</div>
              <div className={cn('text-[10px] mt-0.5', dlKind === k.v ? 'text-brand-foreground/70' : 'text-muted-foreground')}>{k.sub}</div>
            </button>
          ))}
        </div>

        {/* Sélecteur OS (affiché seulement pour natif) */}
        {dlKind === 'native' && (
          <div className="mb-3 flex gap-1">
            {OS_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setDlOs(o.value)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  dlOs === o.value ? 'border-brand bg-brand text-brand-foreground' : 'border-border hover:bg-accent',
                )}>
                {o.label}
              </button>
            ))}
          </div>
        )}

        {/* Instructions */}
        <div className="mb-3 rounded-md bg-muted/50 px-3 py-2 space-y-1">
          {dlKind === 'python' ? (
            <>
              <p className="text-xs font-medium text-muted-foreground">Exécution :</p>
              <code className="block text-xs">pip install psutil</code>
              <code className="block text-xs">python3 cmdb_agent.py  # config dans cmdb_agent.conf</code>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground">
                Prérequis : {NATIVE_INFO[dlOs].prereq}
              </p>
              <p className="text-xs font-medium text-muted-foreground mt-1">Fichier de config ({dlOs === 'windows' ? 'variables d\'env' : '/etc/cmdb-agent.conf'}) :</p>
              <code className="block text-xs whitespace-pre-wrap">{NATIVE_INFO[dlOs].conf}</code>
              <p className="text-xs font-medium text-muted-foreground mt-1">Exécution :</p>
              <code className="block text-xs whitespace-pre-wrap">{NATIVE_INFO[dlOs].exec}</code>
            </>
          )}
        </div>

        <button onClick={handleDownloadRaw} disabled={dlLoading}
          className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50">
          <Download size={14} />
          {dlLoading ? 'Téléchargement…' : (
            dlKind === 'python' ? 'Télécharger cmdb_agent.py'
            : dlOs === 'windows' ? 'Télécharger cmdb-agent-windows.ps1'
            : dlOs === 'macos'   ? 'Télécharger cmdb-agent-macos.sh'
            : 'Télécharger cmdb-agent-linux.sh'
          )}
        </button>
      </section>

      {/* Tokens */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Tokens d'agent</h2>
            <p className="text-xs text-muted-foreground">
              Chaque token génère un installeur auto-configuré avec l'URL et les identifiants.
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground hover:bg-brand/90">
            <Plus size={14} /> Nouveau token
          </button>
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : active.length === 0 && revoked.length === 0 ? (
          <div className="py-8 text-center">
            <Bot size={32} className="mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Aucun token créé</p>
            <p className="text-xs text-muted-foreground">Créez un token pour générer un installeur.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map(t => (
              <TokenRow key={t.id} token={t} onRevoke={id => revokeMut.mutate(id)} />
            ))}
            {revoked.length > 0 && (
              <>
                <p className="pt-2 text-xs font-medium text-muted-foreground">Révoqués</p>
                {revoked.map(t => (
                  <TokenRow key={t.id} token={t} onRevoke={id => revokeMut.mutate(id)} />
                ))}
              </>
            )}
          </div>
        )}
      </section>

      {/* Sécurité & mises à jour */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold">Sécurité & mises à jour</h2>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>• Les tokens sont stockés hashés (SHA-256) — le brut n'est affiché qu'à la création.</li>
          <li>• Le fichier de configuration est restreint aux administrateurs système (<code className="rounded bg-muted px-1 py-0.5">chmod 600</code> sur Linux, ACL SYSTEM sur Windows).</li>
          <li>• Toutes les communications transitent via HTTPS (Traefik) — les certificats sont vérifiés.</li>
          <li>• L'agent détecte les mises à jour disponibles et log un avertissement — <strong>aucune mise à jour automatique</strong>, retéléchargez l'installeur depuis cette page.</li>
          <li>• Révoquez immédiatement un token compromis — l'agent sera rejeté dès le prochain rapport.</li>
        </ul>
      </section>
    </div>
  )
}
