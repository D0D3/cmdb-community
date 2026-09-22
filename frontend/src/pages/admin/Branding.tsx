import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Palette, Upload, Trash2, Check, RefreshCw, ImageOff, MonitorPlay } from 'lucide-react'
import { updateBranding, uploadLogo, deleteLogo, logoUrl } from '@/api/branding'
import { useBranding } from '@/contexts/BrandingContext'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

// ── Palette de couleurs prédéfinies ──────────────────────────────────────────

const PALETTE = [
  { hex: '#6d28d9', label: 'Violet (défaut)' },
  { hex: '#2563eb', label: 'Bleu' },
  { hex: '#0891b2', label: 'Cyan' },
  { hex: '#059669', label: 'Vert' },
  { hex: '#d97706', label: 'Ambre' },
  { hex: '#dc2626', label: 'Rouge' },
  { hex: '#db2777', label: 'Rose' },
  { hex: '#4f46e5', label: 'Indigo' },
]

const SIDEBAR_PALETTE = [
  { hex: '#0f172a', label: 'Ardoise (défaut)' },
  { hex: '#1e1b4b', label: 'Indigo foncé' },
  { hex: '#164e63', label: 'Cyan foncé' },
  { hex: '#14532d', label: 'Vert foncé' },
  { hex: '#431407', label: 'Brun foncé' },
  { hex: '#1f2937', label: 'Gris anthracite' },
  { hex: '#111827', label: 'Quasi-noir' },
  { hex: '#ffffff', label: 'Blanc (clair)' },
]

// ── Sous-composant : sélecteur couleur ───────────────────────────────────────

function ColorPicker({
  label, value, onChange, palette,
}: {
  label:   string
  value:   string
  onChange: (hex: string) => void
  palette: { hex: string; label: string }[]
}) {
  const [custom, setCustom] = useState(
    palette.some(p => p.hex === value) ? '' : value
  )

  const pick = (hex: string) => { setCustom(''); onChange(hex) }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {palette.map(p => (
          <button
            key={p.hex}
            title={p.label}
            onClick={() => pick(p.hex)}
            style={{ background: p.hex }}
            className={cn(
              'h-8 w-8 rounded-lg border-2 transition-all',
              value === p.hex ? 'border-foreground scale-110 shadow-md' : 'border-transparent hover:scale-105',
            )}
          />
        ))}
        {/* Saisie hex libre */}
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={value}
            onChange={e => { setCustom(e.target.value); onChange(e.target.value) }}
            className="h-8 w-8 rounded-lg border border-input cursor-pointer p-0.5 bg-background"
            title="Couleur personnalisée"
          />
          <input
            value={custom || value}
            onChange={e => {
              const v = e.target.value
              setCustom(v)
              if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
            }}
            placeholder="#000000"
            className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function Branding() {
  const { branding, applyNow, refresh } = useBranding()

  const [appName,         setAppName]         = useState(branding.app_name)
  const [primaryColor,    setPrimaryColor]    = useState(branding.primary_color)
  const [sidebarColor,    setSidebarColor]    = useState(branding.sidebar_color)
  const [loginBgEnabled,  setLoginBgEnabled]  = useState(branding.login_bg_enabled)
  const [saved,           setSaved]           = useState(false)
  const [logoPreview,     setLogoPreview]     = useState<string | null>(null)
  const [dragOver,        setDragOver]        = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // État réellement sauvegardé sur le serveur
  const [committed, setCommitted] = useState({
    app_name:         branding.app_name,
    primary_color:    branding.primary_color,
    sidebar_color:    branding.sidebar_color,
    login_bg_enabled: branding.login_bg_enabled,
  })

  // Au montage : récupère les valeurs réelles depuis le serveur (évite les valeurs
  // périmées du contexte si l'utilisateur avait changé des couleurs sans sauvegarder)
  useEffect(() => {
    refresh().then(s => {
      if (!s) return
      setAppName(s.app_name)
      setPrimaryColor(s.primary_color)
      setSidebarColor(s.sidebar_color)
      setLoginBgEnabled(s.login_bg_enabled)
      setCommitted({
        app_name:         s.app_name,
        primary_color:    s.primary_color,
        sidebar_color:    s.sidebar_color,
        login_bg_enabled: s.login_bg_enabled,
      })
    })
  }, [refresh])

  // Preview live : met à jour le contexte (sidebar, titre) ET les CSS vars
  const livePreview = (name: string, pc: string, sc: string) => {
    applyNow({ ...branding, app_name: name, primary_color: pc, sidebar_color: sc })
  }

  const saveMut = useMutation({
    mutationFn: () => updateBranding({
      app_name: appName, primary_color: primaryColor,
      sidebar_color: sidebarColor, login_bg_enabled: loginBgEnabled,
    }),
    onSuccess: (data) => {
      setCommitted({
        app_name: data.app_name, primary_color: data.primary_color,
        sidebar_color: data.sidebar_color, login_bg_enabled: data.login_bg_enabled,
      })
      applyNow(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const logoMut = useMutation({
    mutationFn: (file: File) => uploadLogo(file),
    onSuccess: (data) => { applyNow(data); setLogoPreview(null) },
  })

  const delLogoMut = useMutation({
    mutationFn: deleteLogo,
    onSuccess: (data) => { applyNow(data); setLogoPreview(null) },
  })

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => setLogoPreview(e.target?.result as string)
    reader.readAsDataURL(file)
    logoMut.mutate(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const hasChanges =
    appName         !== committed.app_name         ||
    primaryColor    !== committed.primary_color    ||
    sidebarColor    !== committed.sidebar_color    ||
    loginBgEnabled  !== committed.login_bg_enabled

  return (
    <div className="max-w-2xl space-y-8">

      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Palette size={20} className="text-brand" />
          Personnalisation
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Logo, couleurs et nom de l'application — appliqués immédiatement pour tous les utilisateurs.
        </p>
      </div>

      {/* ── Nom de l'application ──────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Nom de l'application</h2>
        <Input
          value={appName}
          onChange={e => { setAppName(e.target.value); livePreview(e.target.value, primaryColor, sidebarColor) }}
          placeholder="CMDB"
          className="max-w-xs"
        />
        <p className="text-xs text-muted-foreground">
          Affiché dans la barre latérale et l'onglet du navigateur.
        </p>
      </section>

      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Logo</h2>

        <div className="flex items-start gap-5">
          {/* Aperçu */}
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-input bg-muted overflow-hidden">
            {logoPreview || branding.has_logo ? (
              <img
                src={logoPreview ?? logoUrl(branding.updated_at ?? '')}
                alt="Logo"
                className="h-full w-full object-contain"
              />
            ) : (
              <ImageOff size={28} className="text-muted-foreground/40" />
            )}
          </div>

          {/* Zone dépôt */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors',
              dragOver
                ? 'border-brand bg-brand/5'
                : 'border-input hover:border-brand/50 hover:bg-muted/40',
            )}
          >
            {logoMut.isPending
              ? <Spinner />
              : <Upload size={20} className="text-muted-foreground" />
            }
            <p className="text-sm text-muted-foreground text-center">
              <span className="font-medium text-foreground">Cliquer ou glisser</span> pour uploader<br />
              <span className="text-xs">PNG, JPEG, WebP — max 2 Mo</span>
              <span className="text-xs text-muted-foreground/70 mt-0.5">
                En-têtes PDF : 400 × 200 px minimum, fond transparent recommandé (PNG/WebP).<br />
                SVG accepté pour l'interface, mais non rendu dans les rapports PDF.
              </span>
            </p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {branding.has_logo && (
          <Button
            variant="danger"
            onClick={() => delLogoMut.mutate()}
            disabled={delLogoMut.isPending}
          >
            <Trash2 size={14} />
            Réinitialiser le logo (Capybara)
          </Button>
        )}

        {logoMut.isError && (
          <p className="text-xs text-destructive">
            {(logoMut.error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Erreur upload'}
          </p>
        )}
      </section>

      {/* ── Couleurs ─────────────────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card p-5 space-y-5">
        <h2 className="text-sm font-semibold text-foreground">Couleurs</h2>

        <ColorPicker
          label="Couleur principale (boutons, liens, accents)"
          value={primaryColor}
          palette={PALETTE}
          onChange={v => { setPrimaryColor(v); livePreview(appName, v, sidebarColor) }}
        />

        <ColorPicker
          label="Couleur de la barre latérale"
          value={sidebarColor}
          palette={SIDEBAR_PALETTE}
          onChange={v => { setSidebarColor(v); livePreview(appName, primaryColor, v) }}
        />
      </section>

      {/* ── Fond page de connexion ───────────────────────────────────────── */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MonitorPlay size={15} className="text-brand" />
          Fond de la page de connexion
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Aperçu de l'interface en arrière-plan</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Affiche une photo de nature aléatoire en arrière-plan du formulaire de connexion.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={loginBgEnabled}
            onClick={() => setLoginBgEnabled(v => !v)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2',
              loginBgEnabled ? 'bg-brand' : 'bg-muted-foreground/30',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform',
                loginBgEnabled ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </div>
      </section>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => saveMut.mutate()}
          disabled={(!hasChanges && !saved) || saveMut.isPending || !appName.trim()}
        >
          {saveMut.isPending ? <Spinner size="sm" /> : saved ? <Check size={15} /> : null}
          {saved ? 'Enregistré !' : 'Enregistrer'}
        </Button>

        <Button
          variant="secondary"
          onClick={() => {
            setAppName(committed.app_name)
            setPrimaryColor(committed.primary_color)
            setSidebarColor(committed.sidebar_color)
            setLoginBgEnabled(committed.login_bg_enabled)
            livePreview(committed.app_name, committed.primary_color, committed.sidebar_color)
          }}
          disabled={!hasChanges}
        >
          <RefreshCw size={14} />
          Annuler
        </Button>

        {saveMut.isError && (
          <p className="text-sm text-destructive">Erreur lors de la sauvegarde</p>
        )}
      </div>
    </div>
  )
}
