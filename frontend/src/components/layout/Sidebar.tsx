import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Server, Package, Bell, Clock, Users, Webhook,
  Plus, ShieldAlert, Cable, Bot, FileBarChart, History, Network,
  ClipboardList, LogOut, Siren, KeyRound, BellDot, Wrench,
  CalendarClock, Palette, ClipboardCheck,
  X, BookOpen, MonitorDot, FileCheck2, KeySquare, Activity,
  ContactRound, BarChart3, HeartPulse, ChevronDown, Settings2, AlertTriangle, ShieldCheck,
  FingerprintIcon, Share2, ExternalLink,
  Sun, Moon, Monitor,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useBranding } from '@/contexts/BrandingContext'
import { useTheme, type ThemeMode } from '@/contexts/ThemeContext'
import { logoUrl } from '@/api/branding'
import Avatar from '@/components/ui/Avatar'
import axios from 'axios'

// ── Tooltip générique ─────────────────────────────────────────────────────────

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group relative flex items-center">
      {children}
      <span className={cn(
        'pointer-events-none absolute left-full ml-3 z-[70]',
        'whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-lg',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
      )}>
        {label}
      </span>
    </div>
  )
}

// ── Types navigation ──────────────────────────────────────────────────────────

interface NavItem { to: string; label: string; icon: React.ElementType; perm?: string; href?: string; adminOnly?: boolean }

interface NavGroup {
  id:              string
  label:           string
  icon:            React.ElementType
  items:           NavItem[]
  adminOnly?:      boolean
}

// ── Définition des groupes ────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dashboards',
    label: 'Tableaux de bord',
    icon: LayoutDashboard,
    items: [
      { to: '/dashboard', label: 'Vue générale',     icon: LayoutDashboard },
      { to: '/executive', label: 'Rapport exécutif', icon: BarChart3 },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventaire',
    icon: Server,
    items: [
      { to: '/hardware',  label: 'Matériel',     icon: Server,       perm: 'ci:read' },
      { to: '/virtual',   label: 'Parc Virtuel', icon: MonitorDot,   perm: 'ci:read' },
      { to: '/software',  label: 'Logiciels',    icon: Package,      perm: 'ci:read' },
      { to: '/keyusers',  label: 'Référents',    icon: ContactRound, perm: 'keyusers:read' },
      { to: '/graph',     label: 'Cartographie', icon: Network,      perm: 'ci:read' },
    ],
  },
  {
    id: 'operations',
    label: 'Opérations',
    icon: Activity,
    items: [
      { to: '/alerts',      label: 'Alertes',      icon: Bell,          perm: 'incidents:read' },
      { to: '/incidents',   label: 'Incidents',    icon: Siren,         perm: 'incidents:read' },
      { to: '/changes',     label: 'Changements',  icon: ClipboardList, perm: 'changes:read' },
      { to: '/maintenance', label: 'Maintenances', icon: Wrench,        perm: 'changes:read' },
    ],
  },
  {
    id: 'compliance',
    label: 'Conformité & Risques',
    icon: ShieldAlert,
    items: [
      { to: '/vulnerabilities', label: 'Vulnérabilités',      icon: ShieldAlert,    perm: 'cve:read' },
      { to: '/expiring',        label: 'Fin de vie & Échéances', icon: Clock,       perm: 'ci:read' },
      { to: '/sla',             label: 'Contrats SLA',         icon: FileCheck2,     perm: 'contracts:read' },
      { to: '/licenses',        label: 'Licences',             icon: KeySquare,      perm: 'licences:read' },
      { to: '/quality',         label: 'Qualité données',      icon: ClipboardCheck, perm: 'ci:read' },
    ],
  },
  {
    id: 'reports',
    label: 'Rapports',
    icon: FileBarChart,
    items: [
      { to: '/reports',           label: 'Rapports',           icon: FileBarChart, perm: 'reports:read' },
      { to: '/admin/report-jobs', label: 'Rapports planifiés', icon: CalendarClock, adminOnly: true },
      { to: '/ops',               label: 'État système',       icon: HeartPulse },
    ],
  },
  {
    id: 'integrations',
    label: 'Intégrations',
    icon: Cable,
    adminOnly: true,
    items: [
      { to: '/admin/connectors',    label: 'Connecteurs',     icon: Cable },
      { to: '/admin/agents',        label: 'Agents',          icon: Bot },
      { to: '/admin/monitoring',    label: 'Monitoring',      icon: Activity },
      { to: '/admin/webhooks',      label: 'Webhooks',        icon: Webhook },
      { to: '/admin/tokens',        label: 'Tokens API',      icon: KeyRound },
      { to: '/admin/sso',           label: 'SSO / SAML',      icon: FingerprintIcon },
      { to: '/admin/m365-calendar', label: 'Calendrier M365', icon: CalendarClock },
      { to: '/admin/network',       label: 'Segments réseau', icon: Share2 },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: Users,
    adminOnly: true,
    items: [
      { to: '/admin/users',         label: 'Utilisateurs',     icon: Users },
      { to: '/admin/permissions',   label: 'Droits & rôles',   icon: ShieldCheck },
      { to: '/admin/notifications', label: 'Notifications',    icon: BellDot },
      { to: '/admin/branding',      label: 'Personnalisation', icon: Palette },
      { to: '/admin/backup',        label: 'Sauvegardes',      icon: History },
      { to: '/admin/settings',      label: 'Paramètres',       icon: Settings2 },
      { to: '/admin/audit',         label: 'Audit',            icon: History },
      { to: '#api-docs', href: '/api/docs', label: 'Documentation API', icon: ExternalLink },
    ],
  },
]

// ── Groupe accordéon ──────────────────────────────────────────────────────────

function NavGroupItem({
  group, openGroups, onToggle, onItemClick,
}: {
  group:      NavGroup
  openGroups: Set<string>
  onToggle:   (id: string) => void
  onItemClick: () => void
}) {
  const location  = useLocation()
  const isOpen    = openGroups.has(group.id)
  const hasActive = group.items.some(it =>
    !it.href && (
      it.to.includes('?')
        ? location.pathname + location.search === it.to
        : location.pathname === it.to
    ),
  )
  const Icon = group.icon

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => onToggle(group.id)}
        className={cn(
          'flex items-center gap-2.5 w-full px-3 py-2 rounded text-sm transition-colors',
          hasActive
            ? 'text-brand font-medium'
            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10',
        )}
      >
        <Icon size={15} className="shrink-0" />
        <span className="flex-1 text-left font-medium truncate">{group.label}</span>
        <ChevronDown
          size={13}
          className={cn('shrink-0 transition-transform duration-200', isOpen ? 'rotate-180' : '')}
        />
      </button>

      {isOpen && (
        <div className="ml-2 pl-3 border-l border-white/10 mt-0.5 mb-1 space-y-0.5">
          {group.items.map(item => {
            const ItemIcon = item.icon

            if (item.href) {
              return (
                <a
                  key={item.to}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onItemClick}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded text-sm transition-colors text-sidebar-foreground/65 hover:bg-white/10 hover:text-sidebar-foreground"
                >
                  <ItemIcon size={14} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </a>
              )
            }

            const isActive = item.to.includes('?')
              ? location.pathname + location.search === item.to
              : location.pathname === item.to

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onItemClick}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded text-sm transition-colors',
                  isActive
                    ? 'bg-brand text-brand-foreground font-medium'
                    : 'text-sidebar-foreground/65 hover:bg-white/10 hover:text-sidebar-foreground',
                )}
              >
                <ItemIcon size={14} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SidebarProps {
  drawerOpen:   boolean
  onDrawerClose: () => void
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Sidebar({ drawerOpen, onDrawerClose }: SidebarProps) {
  const { hasRole, canWrite, can, user, logout } = useAuth()
  const { branding } = useBranding()
  const { theme, setTheme } = useTheme()
  const navigate  = useNavigate()
  const location  = useLocation()
  const isAdmin   = hasRole('admin')

  const primaryRole = user?.roles[0]?.name ?? ''

  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    axios.get<{ version: string }>('/api/version')
      .then(r => setVersion(r.data.version))
      .catch(() => {})
  }, [])

  const visibleGroups = NAV_GROUPS
    .filter(g => {
      if (g.adminOnly) return isAdmin
      return true
    })
    .map(g => ({
      ...g,
      items: g.items.filter(it =>
        (!it.adminOnly || isAdmin) && (!it.perm || can(it.perm))
      ),
    }))
    .filter(g => g.items.length > 0)

  const activeGroupId = visibleGroups.find(g =>
    g.items.some(it =>
      it.to.includes('?')
        ? location.pathname + location.search === it.to
        : location.pathname === it.to,
    )
  )?.id ?? ''

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const saved = sessionStorage.getItem('sidebar-groups')
    if (saved) {
      try { return new Set(JSON.parse(saved)) } catch { /* skip */ }
    }
    return new Set([activeGroupId].filter(Boolean))
  })

  useEffect(() => {
    if (activeGroupId && !openGroups.has(activeGroupId)) {
      setOpenGroups(prev => new Set([...prev, activeGroupId]))
    }
  }, [activeGroupId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleGroup(id: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      sessionStorage.setItem('sidebar-groups', JSON.stringify([...next]))
      return next
    })
  }

  const go = () => onDrawerClose()

  return (
    <>
      {/* Backdrop drawer mobile */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onDrawerClose}
          aria-hidden="true"
        />
      )}

      <aside className={cn(
        'w-56 flex h-full flex-col bg-sidebar text-sidebar-foreground shrink-0',
        'fixed inset-y-0 left-0 z-50 lg:static lg:z-auto',
        'transition-transform duration-300 ease-in-out',
        drawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>

        {/* ── En-tête ────────────────────────────────────────────────── */}
        <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            {branding.has_logo ? (
              <img src={logoUrl(branding.updated_at ?? '')} alt="Logo" className="h-7 w-7 rounded object-contain bg-white/10 shrink-0" />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand">
                <Server size={14} className="text-brand-foreground" />
              </div>
            )}
            <span className="font-semibold tracking-tight truncate">{branding.app_name}</span>
          </div>
          <button
            onClick={onDrawerClose}
            className="lg:hidden h-7 w-7 flex items-center justify-center rounded text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-white/10 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Navigation ─────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0">

          {/* Bouton Nouveau CI */}
          {canWrite && (
            <div className="px-1 pb-3">
              <Link
                to="/ci/new"
                onClick={go}
                className="flex items-center justify-center gap-2 w-full rounded-md bg-brand/90 hover:bg-brand px-3 py-2 text-sm font-medium text-brand-foreground transition-colors"
              >
                <Plus size={15} />
                Nouveau CI
              </Link>
            </div>
          )}

          {/* Groupes de navigation */}
          {visibleGroups.map(group => (
            <NavGroupItem
              key={group.id}
              group={group}
              openGroups={openGroups}
              onToggle={toggleGroup}
              onItemClick={go}
            />
          ))}

          {/* Documentation — item racine */}
          <NavLink
            to="/docs"
            onClick={go}
            className={({ isActive }) => cn(
              'flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors',
              isActive
                ? 'bg-brand text-brand-foreground font-medium'
                : 'text-sidebar-foreground/60 hover:bg-white/10 hover:text-sidebar-foreground',
            )}
          >
            <BookOpen size={15} className="shrink-0" />
            <span className="font-medium truncate">Documentation</span>
          </NavLink>
        </nav>

        {/* ── Toggle thème ────────────────────────────────────────────── */}
        <div className="px-3 pb-2 flex items-center justify-center gap-4">
          {([
            { value: 'light',  Icon: Sun,     label: 'Clair'   },
            { value: 'system', Icon: Monitor, label: 'Système' },
            { value: 'dark',   Icon: Moon,    label: 'Sombre'  },
          ] as { value: ThemeMode; Icon: React.ElementType; label: string }[]).map(({ value, Icon, label }) => (
            <Tip key={value} label={label}>
              <button
                onClick={() => setTheme(value)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded transition-colors',
                  theme === value
                    ? 'bg-white/15 text-sidebar-foreground'
                    : 'text-sidebar-foreground/35 hover:text-sidebar-foreground hover:bg-white/10',
                )}
              >
                <Icon size={14} />
              </button>
            </Tip>
          ))}
        </div>

        {/* ── Pied de page ────────────────────────────────────────────── */}
        <div className="border-t border-white/10 py-3 px-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => { navigate('/profile'); go() }}
              className="flex items-center gap-2.5 flex-1 min-w-0 rounded px-1 py-1 hover:bg-white/10 transition-colors text-left"
            >
              {user && (
                <Avatar userId={user.id} fullName={user.full_name}
                  hasAvatar={user.has_avatar} updatedAt={user.updated_at} size="sm" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.full_name ?? '…'}</p>
                <p className="text-[10px] text-sidebar-foreground/50 truncate">{primaryRole}</p>
              </div>
            </button>
            <button
              onClick={logout}
              title="Déconnexion"
              className="shrink-0 rounded p-1 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-white/10 transition-colors"
            >
              <LogOut size={14} />
            </button>
          </div>
          {version && (
            <div className="mt-1.5 px-1 flex items-center gap-1.5">
              <span className="text-[10px] text-sidebar-foreground/25">v{version}</span>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
