import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Lock, Unlock, KeyRound,
  UserCheck, UserX, ShieldOff, BookUser, Search, CheckSquare, Square,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { listUsers, createUser, updateUser, deleteUser, resetUserPassword } from '@/api/auth'
import { listConnectors, searchDirectory, importFromDirectory } from '@/api/connectors'
import type { DirectoryUser, ConnectorOut } from '@/api/connectors'
import type { User, UserCreate } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// ── Constantes ────────────────────────────────────────────────────────────────

const ROLES = [
  { slug: 'viewer',         name: 'Lecteur' },
  { slug: 'it-application', name: 'IT Application' },
  { slug: 'it-infra',       name: 'IT Infrastructure' },
  { slug: 'admin',          name: 'Administrateur' },
]

const roleBadgeVariant = (slug: string) =>
  slug === 'admin' ? 'danger'
  : slug === 'it-infra' ? 'warning'
  : slug === 'it-application' ? 'info'
  : 'muted'

const SELECT_CLASS =
  'h-9 w-full rounded border border-[hsl(var(--border))] bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'

// ── Schémas zod ───────────────────────────────────────────────────────────────

const createSchema = z.object({
  email:     z.string().email('Email invalide'),
  full_name: z.string().min(2, 'Nom requis'),
  password:  z.string().min(10, 'Minimum 10 caractères'),
  role_slug: z.string(),
})
type CreateForm = z.infer<typeof createSchema>

const editSchema = z.object({
  full_name: z.string().min(2, 'Nom requis'),
  role_slug: z.string(),
})
type EditForm = z.infer<typeof editSchema>

const resetSchema = z.object({
  new_password:     z.string().min(10, 'Minimum 10 caractères'),
  confirm_password: z.string(),
}).refine(d => d.new_password === d.confirm_password, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirm_password'],
})
type ResetForm = z.infer<typeof resetSchema>

// ── Boîte de dialogue générique ───────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// ── Indicateur de présence ────────────────────────────────────────────────────

function PresenceDot({ lastActiveAt }: { lastActiveAt: string | null }) {
  const isOnline = lastActiveAt
    ? (Date.now() - new Date(lastActiveAt).getTime()) < 5 * 60 * 1000
    : false
  return (
    <span
      title={isOnline ? 'Connecté' : 'Hors ligne'}
      className={[
        'inline-block h-2.5 w-2.5 rounded-full ring-2 ring-background',
        isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/30',
      ].join(' ')}
    />
  )
}

// ── Badge statut ──────────────────────────────────────────────────────────────

function StatusBadge({ user }: { user: User }) {
  if (user.is_locked)  return <Badge variant="danger">Verrouillé</Badge>
  if (!user.is_active) return <Badge variant="muted">Inactif</Badge>
  return <Badge variant="success">Actif</Badge>
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function Users() {
  const { user: me } = useAuth()
  const qc = useQueryClient()

  const [showCreate, setShowCreate]         = useState(false)
  const [showImport, setShowImport]         = useState(false)
  const [editTarget, setEditTarget]         = useState<User | null>(null)
  const [resetTarget, setResetTarget]       = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget]     = useState<User | null>(null)

  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers })

  // ── Création ────────────────────────────────────────────────────────────────

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role_slug: 'viewer' },
  })

  const createMut = useMutation({
    mutationFn: (data: UserCreate) => createUser(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowCreate(false)
      createForm.reset()
    },
  })

  const onCreateSubmit = (data: CreateForm) => {
    createMut.mutate({
      email: data.email,
      full_name: data.full_name,
      password: data.password,
      role_slugs: [data.role_slug],
    })
  }

  // ── Édition ─────────────────────────────────────────────────────────────────

  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  const openEdit = (u: User) => {
    setEditTarget(u)
    editForm.reset({
      full_name: u.full_name,
      role_slug: u.roles[0]?.slug ?? 'viewer',
    })
  }

  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditForm }) =>
      updateUser(id, { full_name: data.full_name, role_slugs: [data.role_slug] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditTarget(null)
    },
  })

  // ── Verrouillage ────────────────────────────────────────────────────────────

  const lockMut = useMutation({
    mutationFn: ({ id, is_locked }: { id: string; is_locked: boolean }) =>
      updateUser(id, { is_locked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  // ── Activation/désactivation ─────────────────────────────────────────────────

  const activeMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateUser(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  // ── Reset mot de passe ───────────────────────────────────────────────────────

  const resetForm = useForm<ResetForm>({ resolver: zodResolver(resetSchema) })

  const openReset = (u: User) => {
    setResetTarget(u)
    resetForm.reset()
  }

  const resetMut = useMutation({
    mutationFn: ({ id, pw }: { id: string; pw: string }) => resetUserPassword(id, pw),
    onSuccess: () => setResetTarget(null),
  })

  // ── Suppression ──────────────────────────────────────────────────────────────

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setDeleteTarget(null)
    },
  })

  // ── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">{users?.length ?? 0} compte(s)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <BookUser size={16} /> Importer depuis un annuaire
          </Button>
          <Button onClick={() => setShowCreate(v => !v)}>
            <Plus size={16} /> Nouvel utilisateur
          </Button>
        </div>
      </div>

      {/* Formulaire de création */}
      {showCreate && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-medium text-foreground">Créer un utilisateur</h2>
          {createMut.isError && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Erreur lors de la création. L'email est peut-être déjà utilisé.
            </p>
          )}
          <form onSubmit={createForm.handleSubmit(onCreateSubmit)} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" placeholder="user@example.com"
                  error={createForm.formState.errors.email?.message}
                  {...createForm.register('email')} />
                {createForm.formState.errors.email && (
                  <p className="text-xs text-red-600">{createForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nom complet</label>
                <Input placeholder="Prénom Nom"
                  error={createForm.formState.errors.full_name?.message}
                  {...createForm.register('full_name')} />
                {createForm.formState.errors.full_name && (
                  <p className="text-xs text-red-600">{createForm.formState.errors.full_name.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Mot de passe (≥ 10 car.)</label>
                <Input type="password"
                  error={createForm.formState.errors.password?.message}
                  {...createForm.register('password')} />
                {createForm.formState.errors.password && (
                  <p className="text-xs text-red-600">{createForm.formState.errors.password.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Rôle</label>
                <select className={SELECT_CLASS} {...createForm.register('role_slug')}>
                  {ROLES.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="secondary"
                  onClick={() => { setShowCreate(false); createForm.reset() }}>
                  Annuler
                </Button>
                <Button type="submit" loading={createMut.isPending}>Créer</Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {['Utilisateur', 'Rôles', 'Source', 'Dernière connexion', 'Statut', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users?.map(user => (
                <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">

                  {/* Identité */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <PresenceDot lastActiveAt={user.last_active_at} />
                      <div>
                        <div className="font-medium text-foreground">{user.full_name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </td>

                  {/* Rôles */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map(r => (
                        <Badge key={r.id} variant={roleBadgeVariant(r.slug) as 'danger' | 'warning' | 'info' | 'muted'}>
                          {r.name}
                        </Badge>
                      ))}
                      {user.roles.length === 0 && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>

                  {/* Source */}
                  <td className="px-4 py-3 text-muted-foreground capitalize">{user.auth_source}</td>

                  {/* Dernière connexion */}
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(user.last_login_at)}</td>

                  {/* Statut */}
                  <td className="px-4 py-3">
                    <StatusBadge user={user} />
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    {user.id !== me?.id ? (
                      <div className="flex items-center gap-1">

                        {/* Éditer */}
                        <ActionBtn
                          title="Modifier"
                          onClick={() => openEdit(user)}
                          icon={<Pencil size={14} />}
                        />

                        {/* Activer / Désactiver */}
                        <ActionBtn
                          title={user.is_active ? 'Désactiver' : 'Activer'}
                          onClick={() => activeMut.mutate({ id: user.id, is_active: !user.is_active })}
                          icon={user.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                          loading={activeMut.isPending && activeMut.variables?.id === user.id}
                        />

                        {/* Verrouiller / Déverrouiller */}
                        <ActionBtn
                          title={user.is_locked ? 'Déverrouiller' : 'Verrouiller'}
                          onClick={() => lockMut.mutate({ id: user.id, is_locked: !user.is_locked })}
                          icon={user.is_locked ? <Unlock size={14} /> : <Lock size={14} />}
                          loading={lockMut.isPending && lockMut.variables?.id === user.id}
                          danger={!user.is_locked}
                        />

                        {/* Reset mot de passe (local seulement) */}
                        {user.auth_source === 'local' && (
                          <ActionBtn
                            title="Réinitialiser le mot de passe"
                            onClick={() => openReset(user)}
                            icon={<KeyRound size={14} />}
                          />
                        )}
                        {user.auth_source !== 'local' && (
                          <ActionBtn
                            title={`Mot de passe géré par ${user.auth_source.toUpperCase()}`}
                            onClick={() => {}}
                            icon={<ShieldOff size={14} />}
                            disabled
                          />
                        )}

                        {/* Supprimer */}
                        <ActionBtn
                          title="Supprimer"
                          onClick={() => setDeleteTarget(user)}
                          icon={<Trash2 size={14} />}
                          danger
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">vous</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal édition ──────────────────────────────────────────────────── */}
      {editTarget && (
        <Modal title={`Modifier — ${editTarget.full_name}`} onClose={() => setEditTarget(null)}>
          {editMut.isError && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Une erreur est survenue.
            </p>
          )}
          <form onSubmit={editForm.handleSubmit(d => editMut.mutate({ id: editTarget.id, data: d }))} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nom complet</label>
              <Input {...editForm.register('full_name')} error={editForm.formState.errors.full_name?.message} />
              {editForm.formState.errors.full_name && (
                <p className="text-xs text-red-600">{editForm.formState.errors.full_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Rôle</label>
              <select className={SELECT_CLASS} {...editForm.register('role_slug')}>
                {ROLES.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>Annuler</Button>
              <Button type="submit" loading={editMut.isPending}>Enregistrer</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal reset mot de passe ───────────────────────────────────────── */}
      {resetTarget && (
        <Modal title={`Réinitialiser le mot de passe — ${resetTarget.full_name}`} onClose={() => setResetTarget(null)}>
          <p className="mb-4 text-sm text-muted-foreground">
            Définissez un nouveau mot de passe pour ce compte. L'utilisateur devra l'utiliser à sa prochaine connexion.
          </p>
          {resetMut.isError && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Une erreur est survenue.
            </p>
          )}
          {resetMut.isSuccess && (
            <p className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              Mot de passe mis à jour avec succès.
            </p>
          )}
          <form onSubmit={resetForm.handleSubmit(d => resetMut.mutate({ id: resetTarget.id, pw: d.new_password }))} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nouveau mot de passe (≥ 10 car.)</label>
              <Input type="password" {...resetForm.register('new_password')}
                error={resetForm.formState.errors.new_password?.message} />
              {resetForm.formState.errors.new_password && (
                <p className="text-xs text-red-600">{resetForm.formState.errors.new_password.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Confirmer le mot de passe</label>
              <Input type="password" {...resetForm.register('confirm_password')}
                error={resetForm.formState.errors.confirm_password?.message} />
              {resetForm.formState.errors.confirm_password && (
                <p className="text-xs text-red-600">{resetForm.formState.errors.confirm_password.message}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setResetTarget(null)}>Annuler</Button>
              <Button type="submit" loading={resetMut.isPending}>Réinitialiser</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal import depuis annuaire ───────────────────────────────────── */}
      {showImport && (
        <DirectoryImportModal
          onClose={() => { setShowImport(false); qc.invalidateQueries({ queryKey: ['users'] }) }}
        />
      )}

      {/* ── Modal confirmation suppression ─────────────────────────────────── */}
      {deleteTarget && (
        <Modal title="Supprimer l'utilisateur" onClose={() => setDeleteTarget(null)}>
          <p className="mb-1 text-sm text-foreground">
            Voulez-vous vraiment supprimer <strong>{deleteTarget.full_name}</strong> ?
          </p>
          <p className="mb-5 text-xs text-muted-foreground">
            Cette action est irréversible. Les données associées seront conservées mais le compte ne pourra plus se connecter.
          </p>
          {deleteMut.isError && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Une erreur est survenue.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Annuler</Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() => deleteMut.mutate(deleteTarget.id)}
            >
              Supprimer
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Modal import depuis annuaire ──────────────────────────────────────────────

function DirectoryImportModal({ onClose }: { onClose: () => void }) {
  const [connector, setConnector]   = useState<ConnectorOut | null>(null)
  const [roleSlug, setRoleSlug]     = useState('viewer')
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<DirectoryUser[]>([])
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [searching, setSearching]   = useState(false)
  const [searchErr, setSearchErr]   = useState<string | null>(null)
  const [importDone, setImportDone] = useState<{ imported: number; updated: number; errors: number } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: connectors = [], isLoading: loadingConnectors } = useQuery({
    queryKey: ['connectors'],
    queryFn: listConnectors,
  })

  const directoryConnectors = connectors.filter(c => c.connector_type === 'entra' || c.connector_type === 'ldap')

  // Sélection automatique si un seul connecteur disponible
  useEffect(() => {
    if (directoryConnectors.length === 1 && !connector) {
      setConnector(directoryConnectors[0])
    }
  }, [directoryConnectors, connector])

  // Recherche avec debounce 400 ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!connector || query.trim().length < 2) {
      setResults([])
      setSearchErr(null)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchErr(null)
      try {
        const data = await searchDirectory(connector.id, query.trim())
        setResults(data)
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setSearchErr(msg ?? 'Erreur lors de la recherche')
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [connector, query])

  const toggleSelect = (extId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(extId) ? next.delete(extId) : next.add(extId)
      return next
    })
  }

  const importMut = useMutation({
    mutationFn: () => importFromDirectory(connector!.id, [...selected], roleSlug),
    onSuccess: (data) => {
      setImportDone(data)
      setSelected(new Set())
      setResults([])
      setQuery('')
    },
  })

  const connectorLabel = (c: ConnectorOut) =>
    c.connector_type === 'entra' ? `EntraID — ${c.name}` : `LDAP/AD — ${c.name}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-2xl flex flex-col max-h-[90vh]">

        {/* En-tête */}
        <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
          <h2 className="font-semibold text-foreground">Importer depuis un annuaire</h2>
          <button onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">

          {/* Résultat import */}
          {importDone && (
            <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
              Import terminé — <strong>{importDone.imported}</strong> créé(s),{' '}
              <strong>{importDone.updated}</strong> mis à jour
              {importDone.errors > 0 && (
                <span className="text-red-600 ml-1">({importDone.errors} erreur(s))</span>
              )}
            </div>
          )}

          {/* Choix connecteur */}
          {loadingConnectors ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : directoryConnectors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun connecteur EntraID ou LDAP activé. Configurez-en un dans Admin → Connecteurs.
            </p>
          ) : (
            <>
              {directoryConnectors.length > 1 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Source annuaire</label>
                  <select
                    className={SELECT_CLASS}
                    value={connector?.id ?? ''}
                    onChange={e => {
                      const c = directoryConnectors.find(x => x.id === e.target.value) ?? null
                      setConnector(c)
                      setResults([])
                      setQuery('')
                      setSelected(new Set())
                    }}
                  >
                    <option value="">— Choisir un connecteur —</option>
                    {directoryConnectors.map(c => (
                      <option key={c.id} value={c.id}>{connectorLabel(c)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Recherche */}
              {connector && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Rechercher dans {connectorLabel(connector)}
                  </label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      className="h-9 w-full rounded border border-[hsl(var(--border))] bg-card pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                      placeholder="Nom ou email (min. 2 car.)…"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {searchErr && (
                    <p className="text-xs text-red-600">{searchErr}</p>
                  )}
                </div>
              )}

              {/* Résultats */}
              {searching && (
                <div className="flex justify-center py-3"><Spinner /></div>
              )}
              {!searching && results.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{results.length} résultat(s) — cliquez pour sélectionner</p>
                  <div className="max-h-52 overflow-y-auto rounded border divide-y">
                    {results.map(u => {
                      const sel = selected.has(u.external_id)
                      return (
                        <button
                          key={u.external_id}
                          type="button"
                          onClick={() => !u.already_exists && toggleSelect(u.external_id)}
                          className={[
                            'w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors',
                            u.already_exists
                              ? 'opacity-50 cursor-not-allowed bg-muted/30'
                              : sel
                              ? 'bg-brand/10'
                              : 'hover:bg-muted/40',
                          ].join(' ')}
                          title={u.already_exists ? 'Déjà importé dans le CMDB' : ''}
                        >
                          <span className="shrink-0 text-brand">
                            {u.already_exists
                              ? <CheckSquare size={15} className="text-muted-foreground" />
                              : sel
                              ? <CheckSquare size={15} />
                              : <Square size={15} className="text-muted-foreground" />
                            }
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-medium truncate">{u.full_name}</span>
                            <span className="block text-xs text-muted-foreground truncate">{u.email}</span>
                          </span>
                          {u.already_exists && (
                            <Badge variant="muted">Existant</Badge>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && !searchErr && (
                <p className="text-sm text-muted-foreground text-center py-3">Aucun résultat</p>
              )}

              {/* Rôle à assigner */}
              {selected.size > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Rôle à assigner ({selected.size} utilisateur{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''})
                  </label>
                  <select className={SELECT_CLASS} value={roleSlug} onChange={e => setRoleSlug(e.target.value)}>
                    {ROLES.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)}
                  </select>
                </div>
              )}

              {importMut.isError && (
                <p className="text-sm text-red-600">Une erreur est survenue lors de l'import.</p>
              )}
            </>
          )}
        </div>

        {/* Pied */}
        <div className="flex justify-end gap-2 border-t px-5 py-4 shrink-0">
          <Button variant="secondary" onClick={onClose}>
            {importDone ? 'Fermer' : 'Annuler'}
          </Button>
          {selected.size > 0 && (
            <Button
              onClick={() => importMut.mutate()}
              loading={importMut.isPending}
            >
              Importer {selected.size} utilisateur{selected.size > 1 ? 's' : ''}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Bouton d'action icône ─────────────────────────────────────────────────────

function ActionBtn({
  title, onClick, icon, loading, danger, disabled,
}: {
  title: string
  onClick: () => void
  icon: React.ReactNode
  loading?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      title={title}
      className={[
        'flex h-7 w-7 items-center justify-center rounded transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        danger
          ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      ].join(' ')}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : icon}
    </button>
  )
}
