import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { getBranding, type BrandingSettings } from '@/api/branding'

// ── Conversion hex → HSL (format CSS vars Tailwind "H S% L%") ────────────────

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

// ── Luminosité d'une couleur hex (pour choisir fg clair/foncé) ───────────────

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// ── Application des CSS vars ──────────────────────────────────────────────────

function applyBranding(s: BrandingSettings) {
  const root = document.documentElement
  const isDark = root.classList.contains('dark')

  // Couleur primaire brand
  root.style.setProperty('--brand', hexToHsl(s.primary_color))
  root.style.setProperty('--ring',  hexToHsl(s.primary_color))
  // Foreground sur fond brand : blanc si couleur foncée, noir si claire
  root.style.setProperty('--brand-fg', luminance(s.primary_color) > 0.4 ? '0 0% 0%' : '0 0% 100%')

  // Sidebar : en mode sombre le ThemeContext gère la couleur — ne pas écraser
  if (!isDark) {
    root.style.setProperty('--sidebar-bg', hexToHsl(s.sidebar_color))
    root.style.setProperty(
      '--sidebar-fg',
      luminance(s.sidebar_color) > 0.4 ? '222 47% 11%' : '210 40% 98%',
    )
  }

  // Titre de l'onglet
  document.title = s.app_name

  // Favicon dynamique
  if (s.has_logo) {
    _setFavicon(`/api/branding/logo?v=${s.updated_at ?? ''}`)
  }
}

function _setFavicon(url: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = url
}

// ── Context ───────────────────────────────────────────────────────────────────

const DEFAULT: BrandingSettings = {
  app_name:         'CMDB',
  primary_color:    '#6d28d9',
  sidebar_color:    '#0f172a',
  login_bg_enabled: false,
  has_logo:         false,
  updated_at:       null,
}

interface PersonalOverride {
  primary: string | null
  sidebar: string | null
}

interface BrandingCtx {
  branding:             BrandingSettings
  refresh:              () => Promise<BrandingSettings | null>
  applyNow:             (s: BrandingSettings) => void
  applyPersonalColors:  (primary: string | null, sidebar: string | null) => void
}

const Ctx = createContext<BrandingCtx>({
  branding:            DEFAULT,
  refresh:             async () => null,
  applyNow:            () => {},
  applyPersonalColors: () => {},
})

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT)
  // Ref pour éviter les stale closures dans refresh/applyNow
  const brandingRef  = useRef<BrandingSettings>(DEFAULT)
  const personalRef  = useRef<PersonalOverride>({ primary: null, sidebar: null })

  function _applyWithPersonal(s: BrandingSettings, personal: PersonalOverride) {
    applyBranding({
      ...s,
      primary_color: personal.primary ?? s.primary_color,
      sidebar_color: personal.sidebar ?? s.sidebar_color,
    })
  }

  const refresh = useCallback(async (): Promise<BrandingSettings | null> => {
    try {
      const s = await getBranding()
      setBranding(s)
      brandingRef.current = s
      _applyWithPersonal(s, personalRef.current)
      return s
    } catch {
      return null
    }
  }, [])

  const applyNow = useCallback((s: BrandingSettings) => {
    setBranding(s)
    brandingRef.current = s
    _applyWithPersonal(s, personalRef.current)
  }, [])

  const applyPersonalColors = useCallback((primary: string | null, sidebar: string | null) => {
    personalRef.current = { primary, sidebar }
    _applyWithPersonal(brandingRef.current, { primary, sidebar })
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Quand le thème repasse en clair, le ThemeContext retire ses overrides sidebar
  // → on ré-applique le branding pour que les couleurs configurées reprennent la main
  useEffect(() => {
    const handler = () => _applyWithPersonal(brandingRef.current, personalRef.current)
    window.addEventListener('cmdb-theme-light', handler)
    return () => window.removeEventListener('cmdb-theme-light', handler)
  }, []) // refs stables, pas de dépendances nécessaires

  return (
    <Ctx.Provider value={{ branding, refresh, applyNow, applyPersonalColors }}>
      {children}
    </Ctx.Provider>
  )
}

export const useBranding = () => useContext(Ctx)
