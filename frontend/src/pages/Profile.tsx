import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { User, Lock, Bell, ShieldCheck, ShieldOff, Copy, Camera, Trash2, CheckCircle2, AlertTriangle, Palette, RotateCcw } from 'lucide-react'
import QRCode from 'react-qr-code'
import { updateMyProfile, changeMyPassword, setupTotp, enableTotp, disableTotp, uploadAvatar, deleteAvatar, type TotpSetup } from '@/api/auth'
import { useAuth } from '@/contexts/AuthContext'
import { useBranding } from '@/contexts/BrandingContext'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import AvatarImg from '@/components/ui/Avatar'
import { formatDate } from '@/lib/utils'

const AUTH_SOURCE_LABEL: Record<string, string> = {
  local: 'Compte local',
  ldap: 'LDAP / Active Directory',
  oidc: 'SSO / EntraID',
}

function Alert({ type, message }: { type: 'success' | 'error'; message: string }) {
  const Icon = type === 'success' ? CheckCircle2 : AlertTriangle
  return (
    <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
      type === 'success'
        ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
        : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
    }`}>
      <Icon size={15} className="shrink-0" />
      {message}
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[hsl(var(--border))] bg-muted/30">
        <Icon size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}


// ── Modal 2FA ──────────────────────────────────────────────────────────────────

type TotpModalStep = 'qr' | 'verify' | 'disable'

function TotpModal({
  mode,
  setup,
  onClose,
  onSuccess,
}: {
  mode: 'enable' | 'disable'
  setup: TotpSetup | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [step, setStep] = useState<TotpModalStep>(mode === 'enable' ? 'qr' : 'disable')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const enableMut = useMutation({
    mutationFn: () => enableTotp(code),
    onSuccess,
    onError: () => setError("Code incorrect — vérifiez l'heure de votre appareil."),
  })

  const disableMut = useMutation({
    mutationFn: () => disableTotp(code),
    onSuccess,
    onError: () => setError('Code incorrect.'),
  })

  const copySecret = () => {
    if (setup?.secret) {
      navigator.clipboard.writeText(setup.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-card rounded-xl shadow-2xl border border-[hsl(var(--border))]">
        <div className="px-6 py-4 border-b border-[hsl(var(--border))]">
          <h3 className="text-base font-semibold text-foreground">
            {mode === 'enable' ? 'Activer l\'authentification à deux facteurs' : 'Désactiver le 2FA'}
          </h3>
        </div>

        <div className="p-6 space-y-5">
          {/* QR code step */}
          {step === 'qr' && setup && (
            <>
              <p className="text-sm text-muted-foreground">
                Scannez ce QR code avec <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> ou toute autre app TOTP.
              </p>
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <QRCode value={setup.uri} size={180} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Ou entrez la clé manuellement</p>
                <div className="flex items-center gap-2 rounded border border-[hsl(var(--border))] bg-muted/30 px-3 py-2">
                  <code className="flex-1 text-xs font-mono tracking-widest text-foreground break-all">
                    {setup.secret}
                  </code>
                  <button onClick={copySecret} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <Copy size={14} />
                  </button>
                </div>
                {copied && <p className="text-xs text-green-600 mt-1">Copié !</p>}
              </div>
              <Button className="w-full" onClick={() => setStep('verify')}>
                Continuer →
              </Button>
            </>
          )}

          {/* Verify step */}
          {step === 'verify' && (
            <>
              <p className="text-sm text-muted-foreground">
                Entrez le code à 6 chiffres affiché dans votre application pour confirmer la configuration.
              </p>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) enableMut.mutate() }}
                className="text-center text-xl tracking-[0.4em] font-mono"
                autoFocus
              />
              {error && <Alert type="error" message={error} />}
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => { setStep('qr'); setCode(''); setError(null) }}>
                  ← Retour
                </Button>
                <Button
                  className="flex-1"
                  disabled={code.length !== 6 || enableMut.isPending}
                  onClick={() => enableMut.mutate()}
                >
                  {enableMut.isPending ? 'Vérification…' : 'Activer le 2FA'}
                </Button>
              </div>
            </>
          )}

          {/* Disable step */}
          {step === 'disable' && (
            <>
              <p className="text-sm text-muted-foreground">
                Entrez votre code d'authentification actuel pour confirmer la désactivation du 2FA.
              </p>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) disableMut.mutate() }}
                className="text-center text-xl tracking-[0.4em] font-mono"
                autoFocus
              />
              {error && <Alert type="error" message={error} />}
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={onClose}>
                  Annuler
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={code.length !== 6 || disableMut.isPending}
                  onClick={() => disableMut.mutate()}
                >
                  {disableMut.isPending ? 'Désactivation…' : 'Désactiver le 2FA'}
                </Button>
              </div>
            </>
          )}
        </div>

        {step !== 'verify' && step !== 'disable' && (
          <div className="px-6 pb-4">
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
              Annuler
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function Profile() {
  const { user, login } = useAuth()
  const { applyPersonalColors, branding } = useBranding()
  const qc = useQueryClient()

  const [avatarError, setAvatarError] = useState<string | null>(null)

  const avatarUploadMut = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: async () => {
      setAvatarError(null)
      const token = localStorage.getItem('access_token')
      if (token) await login(token)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAvatarError(detail ?? 'Format non supporté. Utilisez JPEG, PNG, WebP ou GIF (max 2 Mo).')
    },
  })

  const avatarDeleteMut = useMutation({
    mutationFn: deleteAvatar,
    onSuccess: async () => {
      setAvatarError(null)
      const token = localStorage.getItem('access_token')
      if (token) await login(token)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) avatarUploadMut.mutate(file)
    e.target.value = ''
  }

  // --- Infos ---
  const [fullName, setFullName] = useState(user?.full_name ?? '')

  // --- Thème personnel ---
  const [personalPrimary, setPersonalPrimary] = useState<string>(user?.personal_primary_color ?? branding.primary_color)
  const [personalSidebar, setPersonalSidebar] = useState<string>(user?.personal_sidebar_color ?? branding.sidebar_color)

  const colorMut = useMutation({
    mutationFn: (data: { personal_primary_color: string | null; personal_sidebar_color: string | null }) =>
      updateMyProfile(data),
    onSuccess: async (_, vars) => {
      const token = localStorage.getItem('access_token')
      if (token) await login(token)
      qc.invalidateQueries({ queryKey: ['me'] })
      applyPersonalColors(vars.personal_primary_color, vars.personal_sidebar_color)
      toast.success(vars.personal_primary_color ? 'Thème personnel enregistré.' : 'Thème réinitialisé.')
    },
    onError: () => toast.error('Erreur lors de la sauvegarde du thème.'),
  })

  const handleSaveColors = () => {
    colorMut.mutate({ personal_primary_color: personalPrimary, personal_sidebar_color: personalSidebar })
  }

  const handleResetColors = () => {
    const p = branding.primary_color
    const s = branding.sidebar_color
    setPersonalPrimary(p)
    setPersonalSidebar(s)
    applyPersonalColors(null, null)
    colorMut.mutate({ personal_primary_color: null, personal_sidebar_color: null })
  }

  const handlePrimaryChange = (val: string) => {
    setPersonalPrimary(val)
    applyPersonalColors(val, personalSidebar)
  }

  const handleSidebarChange = (val: string) => {
    setPersonalSidebar(val)
    applyPersonalColors(personalPrimary, val)
  }

  // --- 2FA ---
  const [totpModal, setTotpModal] = useState<{ mode: 'enable' | 'disable'; setup: TotpSetup | null } | null>(null)

  const setupMut = useMutation({
    mutationFn: setupTotp,
    onSuccess: (data) => setTotpModal({ mode: 'enable', setup: data }),
  })

  const profileMut = useMutation({
    mutationFn: (data: { full_name?: string; notify_critical_alerts?: boolean }) =>
      updateMyProfile(data),
    onSuccess: async () => {
      const token = localStorage.getItem('access_token')
      if (token) await login(token)
      qc.invalidateQueries({ queryKey: ['me'] })
      toast.success('Profil mis à jour.')
    },
    onError: () => toast.error('Erreur lors de la mise à jour du profil.'),
  })

  // --- Mot de passe ---
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd]         = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const pwdMut = useMutation({
    mutationFn: () => changeMyPassword(currentPwd, newPwd),
    onSuccess: () => {
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      toast.success('Mot de passe modifié avec succès.')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Erreur lors du changement de mot de passe.')
    },
  })

  const handlePwdSubmit = () => {
    if (newPwd !== confirmPwd) {
      toast.error('Les nouveaux mots de passe ne correspondent pas.')
      return
    }
    if (newPwd.length < 10) {
      toast.error('Le mot de passe doit contenir au moins 10 caractères.')
      return
    }
    pwdMut.mutate()
  }

  if (!user) return null

  const handleTotpSuccess = async () => {
    setTotpModal(null)
    const token = localStorage.getItem('access_token')
    if (token) await login(token)
    qc.invalidateQueries({ queryKey: ['me'] })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {totpModal && (
        <TotpModal
          mode={totpModal.mode}
          setup={totpModal.setup}
          onClose={() => setTotpModal(null)}
          onSuccess={handleTotpSuccess}
        />
      )}
      <div className="flex items-start gap-4">
        {/* Avatar avec upload */}
        <div className="space-y-1.5">
          <div className="relative group">
            <AvatarImg
              userId={user.id}
              fullName={user.full_name}
              hasAvatar={user.has_avatar}
              updatedAt={user.updated_at}
              size="lg"
            />
            {/* Label associé au file input — évite le clic programmatique (incompatible Safari/iOS) */}
            {!avatarUploadMut.isPending && (
              <label
                htmlFor="avatar-file-input"
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Changer l'avatar"
              >
                <Camera size={18} className="text-white" />
              </label>
            )}
            {avatarUploadMut.isPending && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <input
              id="avatar-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          {user.has_avatar && (
            <button
              type="button"
              onClick={() => avatarDeleteMut.mutate()}
              disabled={avatarDeleteMut.isPending}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 transition-colors"
            >
              <Trash2 size={11} /> Supprimer
            </button>
          )}
          {avatarError && (
            <p className="text-xs text-destructive max-w-[7rem] leading-tight">{avatarError}</p>
          )}
        </div>

        <div className="space-y-1 pt-1">
          <h1 className="text-xl font-semibold text-foreground">{user.full_name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {/* Informations du compte */}
      <Section title="Informations du compte" icon={User}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Email</p>
              <p className="font-medium text-foreground">{user.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Source d'authentification</p>
              <p className="font-medium text-foreground">{AUTH_SOURCE_LABEL[user.auth_source] ?? user.auth_source}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Rôles</p>
              <div className="flex flex-wrap gap-1">
                {user.roles.map((r) => (
                  <Badge key={r.id} variant="info">{r.name}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Dernière connexion</p>
              <p className="font-medium text-foreground">
                {user.last_login_at ? formatDate(user.last_login_at) : '—'}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-[hsl(var(--border))]">
            <label className="block text-sm text-muted-foreground mb-1">Nom complet</label>
            <div className="flex gap-2">
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="flex-1"
                placeholder="Votre nom"
              />
              <Button
                size="sm"
                disabled={profileMut.isPending || fullName === user.full_name || !fullName.trim()}
                onClick={() => profileMut.mutate({ full_name: fullName.trim() })}
              >
                Enregistrer
              </Button>
            </div>
          </div>

        </div>
      </Section>

      {/* Notifications */}
      <Section title="Notifications par email" icon={Bell}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Alertes critiques</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recevoir un email lors d'une nouvelle alerte critique
            </p>
          </div>
          <button
            onClick={() => profileMut.mutate({ notify_critical_alerts: !user.notify_critical_alerts })}
            disabled={profileMut.isPending}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              user.notify_critical_alerts ? 'bg-brand' : 'bg-muted'
            }`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform ${
              user.notify_critical_alerts ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </Section>

      {/* Thème personnel */}
      <Section title="Thème personnel" icon={Palette}>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Personnalisez les couleurs de l'interface. L'aperçu est immédiat ; enregistrez pour conserver vos préférences.
          </p>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Couleur principale</label>
              <div className="flex items-center gap-2.5">
                <input
                  type="color"
                  value={personalPrimary}
                  onChange={(e) => handlePrimaryChange(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border border-[hsl(var(--border))] bg-transparent p-0.5"
                />
                <span className="text-xs font-mono text-muted-foreground">{personalPrimary}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Couleur sidebar</label>
              <div className="flex items-center gap-2.5">
                <input
                  type="color"
                  value={personalSidebar}
                  onChange={(e) => handleSidebarChange(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border border-[hsl(var(--border))] bg-transparent p-0.5"
                />
                <span className="text-xs font-mono text-muted-foreground">{personalSidebar}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={colorMut.isPending} onClick={handleSaveColors}>
              {colorMut.isPending ? 'Enregistrement…' : 'Enregistrer le thème'}
            </Button>
            <Button size="sm" variant="secondary" disabled={colorMut.isPending} onClick={handleResetColors}>
              <RotateCcw size={13} className="mr-1.5" />
              Réinitialiser
            </Button>
          </div>
        </div>
      </Section>

      {/* 2FA — uniquement pour les comptes locaux */}
      {user.auth_source === 'local' && (
        <Section title="Authentification à deux facteurs" icon={ShieldCheck}>
          <div className="flex items-start justify-between gap-4">
            <div>
              {user.totp_enabled ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck size={16} className="text-green-600" />
                    <span className="text-sm font-medium text-green-700">2FA activé</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Votre compte est protégé par une application TOTP (Google/Microsoft Authenticator…).
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldOff size={16} className="text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">2FA désactivé</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Activez le 2FA pour renforcer la sécurité de votre compte.
                  </p>
                </>
              )}
            </div>
            {user.totp_enabled ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setTotpModal({ mode: 'disable', setup: null })}
              >
                Désactiver
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={setupMut.isPending}
                onClick={() => setupMut.mutate()}
              >
                {setupMut.isPending ? 'Génération…' : 'Activer le 2FA'}
              </Button>
            )}
          </div>
        </Section>
      )}

      {/* Changement de mot de passe — uniquement pour les comptes locaux */}
      {user.auth_source === 'local' && (
        <Section title="Changer le mot de passe" icon={Lock}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Mot de passe actuel</label>
              <Input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="••••••••••"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Nouveau mot de passe</label>
              <Input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Min. 10 caractères"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Confirmer le nouveau mot de passe</label>
              <Input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="••••••••••"
              />
            </div>

            <Button
              onClick={handlePwdSubmit}
              disabled={pwdMut.isPending || !currentPwd || !newPwd || !confirmPwd}
            >
              {pwdMut.isPending ? 'Modification…' : 'Modifier le mot de passe'}
            </Button>
          </div>
        </Section>
      )}
    </div>
  )
}
