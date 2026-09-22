import { useState, useMemo, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BookOpen, Search, ChevronRight, X, Shield } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { filterDocsForRoles, searchDocs, type DocSection, type DocArticle } from '@/data/docs'
import { cn } from '@/lib/utils'

// ── Composants Markdown personnalisés ─────────────────────────────────────────

const mdComponents: Partial<Components> = {
  h1: ({ children }) => (
    <h1 className="text-xl font-bold text-foreground mb-4 mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-foreground mt-8 mb-3 pb-1.5 border-b">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-foreground mt-5 mb-2">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-foreground/90 leading-relaxed mb-3">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-foreground/80">{children}</em>
  ),
  code: ({ children, className }) => {
    const isBlock = !!className
    if (isBlock) {
      return <code className="text-sm font-mono">{children}</code>
    }
    return (
      <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-brand">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="bg-muted rounded-lg p-4 my-4 overflow-x-auto text-sm font-mono leading-relaxed">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-brand/40 pl-4 italic text-muted-foreground my-4">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="my-3 space-y-1 pl-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 space-y-1 pl-1 list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-foreground/90 flex gap-2 items-baseline">
      <span className="text-brand shrink-0">•</span>
      <span className="flex-1">{children}</span>
    </li>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-5 rounded-lg border shadow-sm">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/60">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-sm text-foreground align-top">{children}</td>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-brand underline hover:opacity-80" target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  hr: () => <hr className="my-6 border-border" />,
}

// ── Article viewer ────────────────────────────────────────────────────────────

function ArticleView({ article }: { article: DocArticle }) {
  return (
    <div className="max-w-3xl">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {article.body.trim()}
      </ReactMarkdown>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function Documentation() {
  const { user, hasRole } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isAdmin = hasRole('admin')

  const userRoles = useMemo(
    () => (user?.roles ?? []).map(r => r.slug),
    [user],
  )

  // Mode : 'all' (doc complète admin) ou 'user' (doc utilisateur uniquement)
  const [docMode, setDocMode] = useState<'all' | 'user'>('all')

  const filteredByMode = useMemo(() => {
    if (!isAdmin || docMode === 'user') {
      // Vue utilisateur : exclure les sections/articles admin-only
      return filterDocsForRoles(['viewer'])
    }
    return filterDocsForRoles(userRoles)
  }, [isAdmin, docMode, userRoles])

  const [search, setSearch]   = useState('')
  const [activeSectionId, setActiveSectionId] = useState<string>(filteredByMode[0]?.id ?? '')
  const [activeArticleId, setActiveArticleId] = useState<string>(filteredByMode[0]?.articles[0]?.id ?? '')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Lire la cible depuis le hash (#section/article)
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    if (hash) {
      const [sId, aId] = hash.split('/')
      if (sId) setActiveSectionId(sId)
      if (aId) setActiveArticleId(aId)
    }
  }, [location.hash])

  const visibleSections = useMemo(
    () => searchDocs(filteredByMode, search),
    [filteredByMode, search],
  )

  const allSections = useMemo(() => filterDocsForRoles(userRoles), [userRoles])

  const activeSection = visibleSections.find(s => s.id === activeSectionId) ?? visibleSections[0]
  const activeArticle = activeSection?.articles.find(a => a.id === activeArticleId)
    ?? activeSection?.articles[0]

  // Article visible pour l'admin uniquement dans la vue complète ?
  const articleIsAdminOnly = useMemo(() => {
    if (!isAdmin) return false
    const sec = allSections.find(s => s.id === activeSection?.id)
    const art = sec?.articles.find(a => a.id === activeArticle?.id)
    const artRoles = art?.roles ?? []
    const secRoles = sec?.roles ?? []
    return artRoles.includes('admin') || secRoles.includes('admin')
  }, [isAdmin, allSections, activeSection, activeArticle])

  function selectArticle(sId: string, aId: string) {
    setActiveSectionId(sId)
    setActiveArticleId(aId)
    setMobileNavOpen(false)
    navigate(`#${sId}/${aId}`, { replace: true })
  }

  return (
    <div className="flex h-full gap-0 -m-4 lg:-m-6 overflow-hidden" style={{ height: 'calc(100vh - 3.5rem)' }}>

      {/* ── Sidebar docs (desktop) ──────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 border-r bg-card shrink-0 overflow-hidden">
        <DocsNav
          sections={visibleSections}
          allSections={allSections}
          search={search}
          onSearch={setSearch}
          searchRef={searchRef}
          activeSectionId={activeSectionId}
          activeArticleId={activeArticleId}
          onSelect={selectArticle}
          isAdmin={isAdmin}
          docMode={docMode}
          onModeChange={setDocMode}
        />
      </aside>

      {/* ── Drawer mobile ───────────────────────────────────────────────── */}
      {mobileNavOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-card border-r shadow-xl lg:hidden overflow-hidden">
            <div className="flex items-center justify-between h-12 px-4 border-b shrink-0">
              <span className="font-semibold text-sm">Documentation</span>
              <button onClick={() => setMobileNavOpen(false)}>
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>
            <DocsNav
              sections={visibleSections}
              allSections={allSections}
              search={search}
              onSearch={setSearch}
              searchRef={searchRef}
              activeSectionId={activeSectionId}
              activeArticleId={activeArticleId}
              onSelect={selectArticle}
              isAdmin={isAdmin}
              docMode={docMode}
              onModeChange={setDocMode}
            />
          </aside>
        </>
      )}

      {/* ── Zone contenu ────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">

        {/* Fil d'ariane + bouton menu mobile */}
        <div className="flex h-10 shrink-0 items-center gap-2 px-4 lg:px-8 border-b bg-card text-sm text-muted-foreground">
          <button
            className="lg:hidden mr-1 flex items-center gap-1 text-foreground font-medium"
            onClick={() => setMobileNavOpen(true)}
          >
            <BookOpen size={14} />
            <span>Menu</span>
          </button>
          {activeSection && (
            <>
              <span className="hidden lg:inline">{activeSection.icon} {activeSection.title}</span>
              {activeArticle && (
                <>
                  <ChevronRight size={13} className="hidden lg:inline shrink-0" />
                  <span className="truncate hidden lg:inline">{activeArticle.title}</span>
                </>
              )}
            </>
          )}
          {/* Badge admin visible uniquement en mode 'all' */}
          {articleIsAdminOnly && docMode === 'all' && (
            <span className="ml-auto hidden lg:flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
              <Shield size={11} />
              Admin uniquement
            </span>
          )}
        </div>

        {/* Corps de l'article */}
        <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-12 lg:py-10">
          {activeArticle ? (
            <ArticleView article={activeArticle} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-20">
              <BookOpen size={40} className="text-muted-foreground/30" />
              <div>
                <p className="font-medium text-muted-foreground">Aucun article trouvé</p>
                {search && (
                  <button
                    className="text-sm text-brand hover:underline mt-1"
                    onClick={() => setSearch('')}
                  >
                    Effacer la recherche
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── DocsNav (réutilisée desktop + mobile) ─────────────────────────────────────

function DocsNav({
  sections, allSections, search, onSearch, searchRef,
  activeSectionId, activeArticleId, onSelect,
  isAdmin, docMode, onModeChange,
}: {
  sections: DocSection[]
  allSections: DocSection[]
  search: string
  onSearch: (v: string) => void
  searchRef: React.RefObject<HTMLInputElement>
  activeSectionId: string
  activeArticleId: string
  onSelect: (sId: string, aId: string) => void
  isAdmin: boolean
  docMode: 'all' | 'user'
  onModeChange: (m: 'all' | 'user') => void
}) {
  // Sections admin-only (badge 🛡️)
  const adminSectionIds = useMemo(
    () => new Set(allSections.filter(s => s.roles.includes('admin')).map(s => s.id)),
    [allSections],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* En-tête */}
      <div className="p-4 border-b shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={16} className="text-brand shrink-0" />
          <span className="font-semibold text-sm">Documentation</span>
        </div>

        {/* Toggle utilisateur / technique (admin seulement) */}
        {isAdmin && (
          <div className="flex rounded-lg border bg-muted/50 p-0.5 mb-3 text-xs">
            <button
              onClick={() => onModeChange('user')}
              className={cn(
                'flex-1 py-1 rounded-md font-medium transition-colors',
                docMode === 'user'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Utilisateur
            </button>
            <button
              onClick={() => onModeChange('all')}
              className={cn(
                'flex-1 py-1 rounded-md font-medium transition-colors flex items-center justify-center gap-1',
                docMode === 'all'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Shield size={11} />
              Technique
            </button>
          </div>
        )}

        {/* Recherche */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full pl-7 pr-3 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => onSearch('')}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Sections + articles */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {sections.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">Aucun résultat</p>
        ) : sections.map(section => (
          <div key={section.id} className="mb-1">
            <div className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>{section.icon}</span>
              <span className="flex-1">{section.title}</span>
              {adminSectionIds.has(section.id) && (
                <Shield size={10} className="text-amber-500 shrink-0" aria-label="Admins uniquement" />
              )}
            </div>
            {section.articles.map(article => (
              <button
                key={article.id}
                onClick={() => onSelect(section.id, article.id)}
                className={cn(
                  'flex items-center w-full text-left px-4 py-1.5 text-sm rounded mx-1 transition-colors',
                  activeSectionId === section.id && activeArticleId === article.id
                    ? 'bg-brand/10 text-brand font-medium'
                    : 'text-foreground/70 hover:bg-muted hover:text-foreground',
                )}
              >
                <ChevronRight
                  size={12}
                  className={cn(
                    'shrink-0 mr-1.5 transition-transform',
                    activeSectionId === section.id && activeArticleId === article.id
                      ? 'rotate-90 text-brand'
                      : 'text-muted-foreground/50',
                  )}
                />
                <span className="truncate flex-1">{article.title}</span>
                {article.roles.includes('admin') && !adminSectionIds.has(section.id) && (
                  <Shield size={10} className="text-amber-500 shrink-0 ml-1" aria-label="Admin uniquement" />
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </div>
  )
}
