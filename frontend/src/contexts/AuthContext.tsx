import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import type { User } from '@/types/api'
import { getMe, sendHeartbeat } from '@/api/auth'
import { useBranding } from '@/contexts/BrandingContext'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (token: string) => Promise<void>
  logout: () => void
  hasRole: (slug: string) => boolean
  canWrite: boolean
  canDelete: boolean
  can: (permKey: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { applyPersonalColors, refresh: refreshBranding } = useBranding()

  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    setUser(null)
    refreshBranding()
  }, [refreshBranding])

  const login = useCallback(async (token: string) => {
    localStorage.setItem('access_token', token)
    const me = await getMe()
    setUser(me)
    applyPersonalColors(me.personal_primary_color ?? null, me.personal_sidebar_color ?? null)
  }, [applyPersonalColors])

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) { setIsLoading(false); return }
    getMe()
      .then(me => {
        setUser(me)
        applyPersonalColors(me.personal_primary_color ?? null, me.personal_sidebar_color ?? null)
      })
      .catch(logout)
      .finally(() => setIsLoading(false))
  }, [logout, applyPersonalColors])

  // Heartbeat toutes les 60 s pour signaler la présence active
  useEffect(() => {
    if (!user) return
    sendHeartbeat().catch(() => {})
    const id = setInterval(() => sendHeartbeat().catch(() => {}), 60_000)
    return () => clearInterval(id)
  }, [user])

  const hasRole = useCallback(
    (slug: string) => user?.roles.some((r) => r.slug === slug) ?? false,
    [user],
  )

  // Ensemble des clés de permission actives sur tous les rôles de l'utilisateur
  const effectivePerms = useMemo<Set<string>>(() => {
    if (!user) return new Set()
    if (user.roles.some(r => r.slug === 'admin')) {
      // admin = toutes les permissions
      return new Set(['*'])
    }
    const keys = new Set<string>()
    for (const role of user.roles) {
      for (const [key, val] of Object.entries(role.permissions ?? {})) {
        if (val) keys.add(key)
      }
    }
    return keys
  }, [user])

  const can = useCallback(
    (permKey: string) => effectivePerms.has('*') || effectivePerms.has(permKey),
    [effectivePerms],
  )

  const canWrite  = can('ci:write')
  const canDelete = can('ci:delete')

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasRole, canWrite, canDelete, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
