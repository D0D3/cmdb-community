import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useLocation } from 'react-router-dom'
import { Server, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { login, getOidcConfig, getSamlStatus, verifyTotp } from '@/api/auth'
import { useBranding } from '@/contexts/BrandingContext'
import { logoUrl } from '@/api/branding'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const schema = z.object({
  username: z.string().min(1, 'Identifiant requis'),
  password: z.string().min(1, 'Mot de passe requis'),
})
type FormData = z.infer<typeof schema>

const OIDC_ERROR_LABELS: Record<string, string> = {
  csrf:             'Session expirée ou invalide. Réessayez.',
  callback_failed:  "Échec de l'authentification. Réessayez.",
  access_denied:    'Accès refusé.',
  not_configured:   'SSO SAML non configuré.',
  no_email:         "L'IdP n'a pas fourni d'adresse email.",
  user_error:       'Erreur lors de la création du compte. Contactez un administrateur.',
  account_disabled: 'Compte désactivé ou verrouillé. Contactez un administrateur.',
}

export default function Login() {
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { branding } = useBranding()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [oidcEnabled, setOidcEnabled] = useState(false)
  const [samlEnabled, setSamlEnabled] = useState(false)

  // État 2FA
  const [totpStep, setTotpStep] = useState(false)
  const [partialToken, setPartialToken] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpLoading, setTotpLoading] = useState(false)
  const totpInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    // Récupération du token SSO (OIDC/SAML) via cookie __sso_token (évite l'exposition dans l'URL)
    const ssoMatch = document.cookie.match(/(?:^|;\s*)__sso_token=([^;]+)/)
    if (ssoMatch) {
      const token = decodeURIComponent(ssoMatch[1])
      document.cookie = '__sso_token=; path=/login; max-age=0'
      authLogin(token).then(() => {
        navigate('/dashboard', { replace: true })
      }).catch(() => {
        setError('Token SSO invalide. Réessayez.')
      })
      return
    }

    const params = new URLSearchParams(window.location.search)
    const oidcError = params.get('oidc_error')
    if (oidcError) {
      setError(OIDC_ERROR_LABELS[oidcError] ?? "Erreur d'authentification SSO.")
      window.history.replaceState({}, '', '/login')
    }

    const samlError = params.get('saml_error')
    if (samlError) {
      setError(OIDC_ERROR_LABELS[samlError] ?? "Erreur d'authentification SAML.")
      window.history.replaceState({}, '', '/login')
    }
  }, [authLogin, navigate])

  useEffect(() => {
    getOidcConfig().then((cfg) => setOidcEnabled(cfg.enabled)).catch(() => {})
    getSamlStatus().then((cfg) => setSamlEnabled(cfg.enabled)).catch(() => {})
  }, [])

  useEffect(() => {
    if (totpStep) totpInputRef.current?.focus()
  }, [totpStep])

  const onSubmit = async (data: FormData) => {
    setError(null)
    try {
      const res = await login(data.username, data.password)
      if (res.totp_required && res.partial_token) {
        setPartialToken(res.partial_token)
        setTotpStep(true)
        return
      }
      if (res.access_token) {
        await authLogin(res.access_token)
        navigate('/dashboard')
      }
    } catch {
      setError('Identifiants incorrects. Vérifiez votre email et mot de passe.')
    }
  }

  const onTotpSubmit = async () => {
    if (totpCode.length !== 6) return
    setTotpLoading(true)
    setError(null)
    try {
      const res = await verifyTotp(partialToken, totpCode)
      await authLogin(res.access_token)
      navigate('/dashboard')
    } catch {
      setError('Code incorrect ou expiré. Réessayez.')
      setTotpCode('')
    } finally {
      setTotpLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-start justify-center bg-background px-4 pt-[10vh] pb-8 relative overflow-hidden">
      {branding.login_bg_enabled && <NatureBackground key={location.key} />}
      <div className={`w-full max-w-sm relative z-10 ${branding.login_bg_enabled ? 'drop-shadow-2xl' : ''}`}>
        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-col items-center gap-3 pb-2">
            {!totpStep && branding.has_logo ? (
              <img
                src={logoUrl(branding.updated_at ?? '')}
                alt={branding.app_name}
                className="h-40 w-auto object-contain"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand shadow-lg">
                {totpStep
                  ? <ShieldCheck size={26} className="text-brand-foreground" />
                  : <Server size={26} className="text-brand-foreground" />}
              </div>
            )}
            <div className="text-center">
              <h1 className="text-xl font-bold text-foreground">{branding.app_name}</h1>
              <p className="text-sm text-muted-foreground">
                {totpStep ? 'Vérification en deux étapes' : 'Configuration Management Database'}
              </p>
            </div>
          </div>
          {error && (
            <div className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* ── Étape 1 : identifiants ──────────────────────────── */}
          {!totpStep && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Identifiant / Email</label>
                <Input
                  type="text"
                  autoComplete="username"
                  placeholder="admin@example.com"
                  error={errors.username?.message}
                  {...register('username')}
                />
                {errors.username && <p className="text-xs text-red-600">{errors.username.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Mot de passe</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    error={errors.password?.message}
                    className="pr-10"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
              </div>

              <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
                Se connecter
              </Button>
            </form>
          )}

          {/* ── Étape 2 : code TOTP ─────────────────────────────── */}
          {totpStep && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Entrez le code à 6 chiffres affiché dans votre application d'authentification.
              </p>
              <Input
                ref={totpInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setTotpCode(val)
                  if (val.length === 6) {
                    // Auto-submit quand 6 chiffres saisis
                    setTimeout(() => {
                      setTotpCode(val)
                    }, 0)
                  }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') onTotpSubmit() }}
                className="text-center text-2xl tracking-[0.5em] font-mono"
              />
              <Button
                className="w-full"
                size="lg"
                loading={totpLoading}
                disabled={totpCode.length !== 6}
                onClick={onTotpSubmit}
              >
                Vérifier
              </Button>
              <button
                type="button"
                onClick={() => { setTotpStep(false); setError(null); setTotpCode('') }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Retour à la connexion
              </button>
            </div>
          )}

          {!totpStep && (oidcEnabled || samlEnabled) && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              {oidcEnabled && (
                <a
                  href="/api/auth/oidc/login"
                  className="flex w-full items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
                >
                  <MicrosoftIcon />
                  Se connecter avec Microsoft
                </a>
              )}

              {samlEnabled && (
                <a
                  href="/api/auth/saml/login"
                  className="flex w-full items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
                >
                  <SamlIcon />
                  Se connecter avec SSO (SAML)
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fond nature aléatoire ─────────────────────────────────────────────────────

const NATURE_IMAGES = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1920&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1470071688021-5bbdfd2f9eb4?w=1920&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1518173946087-a9025294f0eb?w=1920&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&q=80&auto=format&fit=crop',
]

function NatureBackground() {
  const [src] = useState(() => NATURE_IMAGES[Math.floor(Math.random() * NATURE_IMAGES.length)])
  const [failed, setFailed] = useState(false)

  if (failed) return null

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <img
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
      <div className="absolute inset-0 bg-black/55" />
    </div>
  )
}

function SamlIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}
