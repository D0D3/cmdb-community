import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeCtx {
  theme:         ThemeMode
  resolvedTheme: 'light' | 'dark'
  setTheme:      (t: ThemeMode) => void
}

const Ctx = createContext<ThemeCtx>({
  theme: 'system', resolvedTheme: 'light', setTheme: () => {},
})

function getSystem(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyClass(mode: ThemeMode): 'light' | 'dark' {
  const resolved = mode === 'system' ? getSystem() : mode
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')

  if (resolved === 'dark') {
    // Sidebar suit le fond sombre (overrides l'inline style du branding)
    root.style.setProperty('--sidebar-bg', '220 50% 5%')
    root.style.setProperty('--sidebar-fg', '210 40% 97%')
  } else {
    // Retire l'override dark — le branding reprend la main via l'event ci-dessous
    root.style.removeProperty('--sidebar-bg')
    root.style.removeProperty('--sidebar-fg')
    window.dispatchEvent(new CustomEvent('cmdb-theme-light'))
  }
  return resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(
    () => (localStorage.getItem('cmdb-theme') as ThemeMode | null) ?? 'system',
  )
  const [resolvedTheme, setResolved] = useState<'light' | 'dark'>(
    () => applyClass((localStorage.getItem('cmdb-theme') as ThemeMode | null) ?? 'system'),
  )

  const setTheme = useCallback((t: ThemeMode) => {
    localStorage.setItem('cmdb-theme', t)
    setThemeState(t)
    setResolved(applyClass(t))
  }, [])

  // Suit les changements de préférence système
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setResolved(applyClass('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return (
    <Ctx.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)
