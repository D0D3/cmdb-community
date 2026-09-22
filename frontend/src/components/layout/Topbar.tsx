import { useNavigate } from 'react-router-dom'
import { LogOut, Bell, Menu, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { getAlertStats } from '@/api/alerts'
import Avatar from '@/components/ui/Avatar'
import GlobalSearch from './GlobalSearch'
import { useIngest } from '@/contexts/IngestContext'

interface TopbarProps {
  onOpenSidebar?: () => void
  showHamburger?: boolean
}

export default function Topbar({ onOpenSidebar, showHamburger = true }: TopbarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { status: ingest, finishedVisible } = useIngest()

  const { data: stats } = useQuery({
    queryKey: ['alert-stats'],
    queryFn: getAlertStats,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const openCount = stats?.open ?? 0

  return (
    <div>
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card px-4 lg:px-6">
      {/* Hamburger mobile */}
      {showHamburger && (
        <button
          onClick={onOpenSidebar}
          className="lg:hidden flex items-center justify-center h-8 w-8 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Ouvrir le menu"
        >
          <Menu size={18} />
        </button>
      )}

      {/* Recherche globale */}
      <div className="flex-1 flex justify-center px-4">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1.5">
        {/* Indicateur ingestion CVE en cours */}
        {ingest.running && (
          <div
            className="flex items-center justify-center h-8 w-8 rounded text-brand"
            title="Ingestion CVE en cours…"
          >
            <RefreshCw size={15} className="animate-spin" />
          </div>
        )}

        {/* Cloche alertes */}
        <button
          onClick={() => navigate('/alerts')}
          className="relative flex items-center justify-center h-8 w-8 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={`${openCount} alerte${openCount !== 1 ? 's' : ''} ouverte${openCount !== 1 ? 's' : ''}`}
        >
          <Bell size={17} />
          {openCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-0.5">
              {openCount > 99 ? '99+' : openCount}
            </span>
          )}
        </button>

        {/* Avatar → profil */}
        {user && (
          <button
            onClick={() => navigate('/profile')}
            title={`${user.full_name} — Mon profil`}
            className="rounded-full hover:ring-2 hover:ring-brand transition-all"
          >
            <Avatar
              userId={user.id}
              fullName={user.full_name}
              hasAvatar={user.has_avatar}
              updatedAt={user.updated_at}
              size="sm"
            />
          </button>
        )}

        {/* Déconnexion */}
        <button
          onClick={() => { logout(); navigate('/login') }}
          title="Déconnexion"
          className="flex items-center justify-center h-8 w-8 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>

    {/* Bannière "Ingestion terminée" — visible 2 min 30 s après un sync manuel */}
    {finishedVisible && (
      <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-4 py-1.5 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
        <CheckCircle2 size={14} className="shrink-0" />
        <span>
          Ingestion terminée
          {ingest.matched_cves !== null && (
            <> — <strong>{ingest.matched_cves}</strong> CVE analysées</>
          )}
          {ingest.new_links !== null && (
            <>, <strong>{ingest.new_links}</strong> nouvelle{ingest.new_links !== 1 ? 's' : ''} liaison{ingest.new_links !== 1 ? 's' : ''}</>
          )}
        </span>
      </div>
    )}
    </div>
  )
}
