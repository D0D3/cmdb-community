import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Send, Plus, X, CheckCircle2, AlertTriangle, Users, Search } from 'lucide-react'
import { listNotificationRules, updateNotificationRule, testNotification } from '@/api/notifications'
import { listConnectors } from '@/api/connectors'
import { listUsers } from '@/api/auth'
import type { NotificationRule, User } from '@/types/api'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'

// ── Badge source annuaire ──────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ldap:  { label: 'LDAP',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
    entra: { label: 'EntraID',  cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
    oidc:  { label: 'OIDC',     cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300' },
    local: { label: 'Local',    cls: 'bg-muted text-muted-foreground' },
  }
  const s = map[source] ?? map.local
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${s.cls}`}>{s.label}</span>
  )
}

// ── Composant ligne règle ──────────────────────────────────────────────────────

function RuleRow({ rule, allUsers }: { rule: NotificationRule; allUsers: User[] }) {
  const qc = useQueryClient()
  const [emails, setEmails]         = useState<string[]>(rule.recipient_emails)
  const [newEmail, setNewEmail]     = useState('')
  const [showDir, setShowDir]       = useState(false)
  const [dirSearch, setDirSearch]   = useState('')
  const [testAddr, setTestAddr]     = useState('')
  const [showTest, setShowTest]     = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const dirRef = useRef<HTMLDivElement>(null)

  // Ferme le dropdown annuaire si clic hors
  useEffect(() => {
    if (!showDir) return
    const handler = (e: MouseEvent) => {
      if (dirRef.current && !dirRef.current.contains(e.target as Node)) {
        setShowDir(false)
        setDirSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDir])

  const updateMut = useMutation({
    mutationFn: (data: { enabled?: boolean; recipient_emails?: string[] }) =>
      updateNotificationRule(rule.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-rules'] }),
  })

  const toggleEnabled = () => updateMut.mutate({ enabled: !rule.enabled })

  const addEmail = (addr?: string) => {
    const e = (addr ?? newEmail).trim().toLowerCase()
    if (!e || emails.includes(e)) return
    const next = [...emails, e]
    setEmails(next)
    if (!addr) setNewEmail('')
    updateMut.mutate({ recipient_emails: next })
  }

  const addFromDir = (user: User) => {
    if (!user.email) return
    addEmail(user.email)
    setDirSearch('')
    setShowDir(false)
  }

  const dirResults = dirSearch.length >= 1
    ? allUsers
        .filter(u =>
          u.email && !emails.includes(u.email.toLowerCase()) &&
          (u.full_name?.toLowerCase().includes(dirSearch.toLowerCase()) ||
           u.email.toLowerCase().includes(dirSearch.toLowerCase()))
        )
        .slice(0, 6)
    : []

  const removeEmail = (email: string) => {
    const next = emails.filter((e) => e !== email)
    setEmails(next)
    updateMut.mutate({ recipient_emails: next })
  }

  const sendTest = async () => {
    if (!testAddr.trim()) return
    setTestStatus('sending')
    try {
      await testNotification(rule.event_type, testAddr.trim())
      setTestStatus('ok')
      setTimeout(() => { setTestStatus('idle'); setShowTest(false) }, 2000)
    } catch {
      setTestStatus('err')
      setTimeout(() => setTestStatus('idle'), 3000)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Bell size={15} className={rule.enabled ? 'text-brand' : 'text-muted-foreground'} />
            <h3 className="text-sm font-semibold text-foreground">{rule.event_label}</h3>
          </div>
          {rule.event_description && (
            <p className="text-xs text-muted-foreground/80 mt-0.5">{rule.event_description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            Dernière modification : {formatDate(rule.updated_at)}
          </p>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={updateMut.isPending}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
            rule.enabled ? 'bg-brand' : 'bg-muted-foreground/30'
          }`}
          role="switch"
          aria-checked={rule.enabled}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            rule.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {/* Destinataires */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Destinataires</p>
        <div className="flex flex-wrap gap-1.5">
          {emails.map((e) => (
            <span key={e} className="flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs">
              {e}
              <button onClick={() => removeEmail(e)} className="text-muted-foreground hover:text-red-600 ml-0.5">
                <X size={11} />
              </button>
            </span>
          ))}
          {emails.length === 0 && (
            <span className="text-xs text-muted-foreground/60 italic">Aucun destinataire — notifications désactivées même si activé</span>
          )}
        </div>

        {/* Saisie libre (groupe/liste de diffusion) */}
        <div className="flex gap-2">
          <Input
            className="flex-1 h-8 text-xs"
            placeholder="groupe@entreprise.com ou liste de diffusion"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addEmail()}
          />
          <button
            onClick={() => addEmail()}
            disabled={!newEmail.trim()}
            className="flex items-center gap-1 rounded border border-[hsl(var(--border))] px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 transition-colors"
          >
            <Plus size={12} /> Ajouter
          </button>
        </div>

        {/* Sélecteur annuaire LDAP/EntraID */}
        <div className="relative" ref={dirRef}>
          <button
            onClick={() => { setShowDir(v => !v); setDirSearch('') }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Users size={12} />
            Choisir depuis l'annuaire
          </button>

          {showDir && (
            <div className="absolute left-0 top-6 z-20 w-80 rounded-xl border bg-card shadow-lg p-2 space-y-1.5">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={dirSearch}
                  onChange={e => setDirSearch(e.target.value)}
                  placeholder="Rechercher nom ou email…"
                  className="w-full rounded-md border bg-muted/30 pl-7 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-brand/50"
                />
              </div>
              {dirSearch.length === 0 && (
                <p className="px-1 py-2 text-center text-xs text-muted-foreground">Tapez pour rechercher dans l'annuaire</p>
              )}
              {dirSearch.length >= 1 && dirResults.length === 0 && (
                <p className="px-1 py-2 text-center text-xs text-muted-foreground">Aucun résultat</p>
              )}
              {dirResults.map(u => (
                <button
                  key={u.id}
                  onClick={() => addFromDir(u)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{u.full_name || u.email}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>
                  </div>
                  <SourceBadge source={u.auth_source} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Test */}
      <div className="pt-2 border-t border-[hsl(var(--border))]">
        {showTest ? (
          <div className="flex gap-2 items-center">
            <Input
              className="flex-1 h-8 text-xs"
              placeholder="email@test.com"
              type="email"
              value={testAddr}
              onChange={(e) => setTestAddr(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendTest()}
              autoFocus
            />
            <Button
              variant="secondary"
              className="h-8 text-xs px-3"
              disabled={!testAddr.trim() || testStatus === 'sending'}
              onClick={sendTest}
            >
              {testStatus === 'sending' ? 'Envoi…'
               : testStatus === 'ok'   ? '✓ Envoyé'
               : testStatus === 'err'  ? '✗ Échec'
               : <><Send size={11} /> Envoyer</>}
            </Button>
            <button
              onClick={() => { setShowTest(false); setTestAddr('') }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Annuler
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowTest(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Send size={11} /> Envoyer un email de test
          </button>
        )}
      </div>
    </div>
  )
}

// ── Catégories ────────────────────────────────────────────────────────────────

const CATEGORIES: { label: string; types: string[] }[] = [
  {
    label: 'Alertes temps réel',
    types: ['alert_critical', 'incident_critical', 'incident_open'],
  },
  {
    label: 'Changements (RFC)',
    types: ['rfc_submitted', 'rfc_decision', 'rfc_completed'],
  },
  {
    label: 'Expiration & conformité',
    types: ['sla_expiring', 'license_expiring', 'cve_critical_new', 'connector_sync_error'],
  },
  {
    label: 'Résumé périodique',
    types: ['digest_weekly'],
  },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function NotificationsAdmin() {
  const { data: rules, isLoading } = useQuery({
    queryKey: ['notif-rules'],
    queryFn: listNotificationRules,
    staleTime: 60_000,
  })

  const { data: connectors = [] } = useQuery({
    queryKey: ['connectors'],
    queryFn: listConnectors,
    staleTime: 60_000,
  })

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    staleTime: 300_000,
  })

  const smtpConnector = connectors.find(c => c.connector_type === 'smtp')
  const smtpReady     = !!smtpConnector?.enabled

  const active = rules?.filter((r) => r.enabled).length ?? 0
  const ruleMap = new Map(rules?.map((r) => [r.event_type, r]))

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Notifications email</h1>
        <p className="text-sm text-muted-foreground">
          {isLoading ? '…' : `${active} règle${active > 1 ? 's' : ''} active${active > 1 ? 's' : ''} · SMTP configuré via Connecteurs`}
        </p>
      </div>

      {smtpReady ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-4 text-sm text-green-800 dark:text-green-300">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>
            Connecteur SMTP <strong>{smtpConnector?.name}</strong> actif
            {smtpConnector?.last_test_ok === true && ' — dernière connexion réussie'}
            {smtpConnector?.last_test_ok === false && ' — ⚠ dernier test échoué'}
            . Les emails sont opérationnels.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            <strong>Prérequis :</strong> Configurez un connecteur SMTP dans{' '}
            <a href="/admin/connectors" className="underline">Administration → Connecteurs</a> pour activer l'envoi d'emails.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.map((cat) => {
            const catRules = cat.types.map((t) => ruleMap.get(t)).filter(Boolean) as NotificationRule[]
            if (catRules.length === 0) return null
            return (
              <div key={cat.label}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {cat.label}
                </h2>
                <div className="space-y-3">
                  {catRules.map((rule) => <RuleRow key={rule.id} rule={rule} allUsers={allUsers} />)}
                </div>
              </div>
            )
          })}
          {/* Règles non catégorisées */}
          {(() => {
            const categorized = new Set(CATEGORIES.flatMap((c) => c.types))
            const extras = rules?.filter((r) => !categorized.has(r.event_type)) ?? []
            if (!extras.length) return null
            return (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Autres</h2>
                <div className="space-y-3">
                  {extras.map((rule) => <RuleRow key={rule.id} rule={rule} allUsers={allUsers} />)}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
