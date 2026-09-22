import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Lock, Save, Check, Plus, Trash2, RotateCcw } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  getPermissions, updateRolePermissions, resetRolePermissions,
  createRole, deleteRole,
} from '@/api/permissions'
import type { RolePerms } from '@/api/permissions'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

// ── Constantes ────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  read:   'Lect.',
  write:  'Écr.',
  delete: 'Supp.',
}

const ROLE_COLORS: Record<string, string> = {
  admin:            'text-red-500',
  'it-infra':       'text-amber-500',
  'it-application': 'text-blue-500',
  viewer:           'text-slate-400',
}

const BUILTIN_SLUGS = new Set(['admin', 'it-infra', 'it-application', 'viewer'])

// ── Schéma création rôle ──────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(2, 'Nom requis (min. 2 caractères)'),
  slug: z.string().regex(/^[a-z0-9-]{2,50}$/, 'Minuscules, chiffres, tirets uniquement'),
})
type CreateForm = z.infer<typeof createSchema>

// ── Modal générique ───────────────────────────────────────────────────────────

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
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function Permissions() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-permissions'],
    queryFn: getPermissions,
  })

  const [localPerms, setLocalPerms] = useState<Record<string, Record<string, boolean>>>({})
  const [dirty, setDirty]           = useState<Set<string>>(new Set())
  const [saved, setSaved]           = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RolePerms | null>(null)

  useEffect(() => {
    if (!data) return
    const init: Record<string, Record<string, boolean>> = {}
    for (const role of data.roles) init[role.slug] = { ...role.permissions }
    setLocalPerms(init)
    setDirty(new Set())
  }, [data])

  // ── Sauvegarde permissions ─────────────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: ({ slug, perms }: { slug: string; perms: Record<string, boolean> }) =>
      updateRolePermissions(slug, perms),
    onSuccess: (_, { slug }) => {
      setDirty(prev => { const s = new Set(prev); s.delete(slug); return s })
      setSaved(prev => { const s = new Set(prev); s.add(slug); return s })
      setTimeout(() => setSaved(prev => { const s = new Set(prev); s.delete(slug); return s }), 2000)
      qc.invalidateQueries({ queryKey: ['admin-permissions'] })
    },
  })

  // ── Reset aux valeurs par défaut ───────────────────────────────────────────

  const resetMut = useMutation({
    mutationFn: (slug: string) => resetRolePermissions(slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-permissions'] }),
  })

  // ── Création de rôle ───────────────────────────────────────────────────────

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) })

  const createMut = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-permissions'] })
      setShowCreate(false)
      createForm.reset()
    },
  })

  // ── Suppression de rôle ────────────────────────────────────────────────────

  const deleteMut = useMutation({
    mutationFn: (slug: string) => deleteRole(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-permissions'] })
      setDeleteTarget(null)
    },
  })

  // ── Interactions matrice ───────────────────────────────────────────────────

  function toggle(roleSlug: string, permKey: string) {
    setLocalPerms(prev => ({
      ...prev,
      [roleSlug]: { ...prev[roleSlug], [permKey]: !prev[roleSlug]?.[permKey] },
    }))
    setDirty(prev => new Set(prev).add(roleSlug))
  }

  function toggleModule(roleSlug: string, modKey: string, actions: string[], value: boolean) {
    setLocalPerms(prev => {
      const next = { ...prev[roleSlug] }
      for (const action of actions) next[`${modKey}:${action}`] = value
      return { ...prev, [roleSlug]: next }
    })
    setDirty(prev => new Set(prev).add(roleSlug))
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  if (isLoading || !data) return <div className="flex justify-center py-20"><Spinner /></div>

  const { modules, roles } = data

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className="text-brand" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Matrice des droits</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Définissez les permissions par rôle pour chaque module de la CMDB.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(v => !v)}>
          <Plus size={15} /> Nouveau rôle
        </Button>
      </div>

      {/* Matrice */}
      <div className="rounded-xl border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            {/* Ligne 1 : modules */}
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card/95 backdrop-blur w-44 min-w-[11rem] px-4 py-3 text-left font-medium text-muted-foreground border-r border-border">
                Rôle
              </th>
              {modules.map(mod => (
                <th
                  key={mod.key}
                  colSpan={mod.actions.length}
                  className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground border-r border-border last:border-r-0"
                >
                  {mod.label}
                </th>
              ))}
              <th className="w-36 px-3 py-3" />
            </tr>

            {/* Ligne 2 : actions */}
            <tr className="border-b border-border bg-muted/30">
              <th className="sticky left-0 z-10 bg-muted/30 px-4 py-2 border-r border-border" />
              {modules.map(mod =>
                mod.actions.map((action, i) => (
                  <th
                    key={`${mod.key}:${action}`}
                    className={`px-2 py-2 text-center text-[11px] font-medium text-muted-foreground whitespace-nowrap ${
                      i === mod.actions.length - 1 ? 'border-r border-border' : ''
                    }`}
                  >
                    {ACTION_LABELS[action] ?? action}
                  </th>
                ))
              )}
              <th className="w-36 px-3 py-2" />
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {roles.map(role => {
              const perms    = localPerms[role.slug] ?? role.permissions
              const isDirty  = dirty.has(role.slug)
              const isSaved  = saved.has(role.slug)
              const colorCls = ROLE_COLORS[role.slug] ?? 'text-foreground'
              const isBuiltin = BUILTIN_SLUGS.has(role.slug)

              return (
                <tr
                  key={role.slug}
                  className={`transition-colors ${isDirty ? 'bg-amber-500/5' : 'hover:bg-muted/20'}`}
                >
                  {/* Nom du rôle */}
                  <td className="sticky left-0 z-10 bg-card px-4 py-3 border-r border-border">
                    <div className="flex items-center gap-2">
                      {role.is_admin && <Lock size={13} className="text-muted-foreground shrink-0" />}
                      <span className={`font-medium ${colorCls}`}>{role.name}</span>
                      {!isBuiltin && (
                        <button
                          onClick={() => setDeleteTarget(role)}
                          className="ml-auto text-muted-foreground hover:text-red-500 transition-colors"
                          title="Supprimer ce rôle"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono">{role.slug}</span>
                  </td>

                  {/* Cellules permissions */}
                  {modules.map(mod => {
                    const allChecked = mod.actions.every(a => !!perms[`${mod.key}:${a}`])
                    const noneChecked = mod.actions.every(a => !perms[`${mod.key}:${a}`])

                    return mod.actions.map((action, i) => {
                      const key     = `${mod.key}:${action}`
                      const checked = !!perms[key]
                      const isLast  = i === mod.actions.length - 1

                      return (
                        <td
                          key={key}
                          className={`px-2 py-3 text-center group/cell ${isLast ? 'border-r border-border' : ''}`}
                          onClick={() => !role.is_admin && toggle(role.slug, key)}
                        >
                          {role.is_admin ? (
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                              checked ? 'bg-green-500/15 text-green-500' : 'bg-muted text-muted-foreground/30'
                            }`}>
                              {checked ? '✓' : '–'}
                            </span>
                          ) : (
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded cursor-pointer transition-colors text-[10px] font-semibold ${
                              checked
                                ? 'bg-green-500/20 text-green-600 hover:bg-green-500/30'
                                : 'bg-muted text-muted-foreground/40 hover:bg-muted/80'
                            }`}>
                              {checked ? '✓' : '–'}
                            </span>
                          )}

                          {/* Toggle colonne entière au clic sur la dernière cellule du module */}
                          {isLast && !role.is_admin && (
                            <button
                              title={allChecked ? 'Décocher tout' : 'Cocher tout'}
                              onClick={e => {
                                e.stopPropagation()
                                toggleModule(role.slug, mod.key, mod.actions, !allChecked)
                              }}
                              className="ml-1 opacity-0 group-hover/cell:opacity-100 transition-opacity text-[9px] text-muted-foreground hover:text-foreground"
                            >
                              {allChecked ? '✕' : noneChecked ? '✓' : '±'}
                            </button>
                          )}
                        </td>
                      )
                    })
                  })}

                  {/* Actions par ligne */}
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {role.is_admin ? (
                      <span className="text-[11px] text-muted-foreground italic">Protégé</span>
                    ) : isSaved ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-500 font-medium">
                        <Check size={13} /> Enregistré
                      </span>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        {isBuiltin && isDirty && (
                          <button
                            title="Réinitialiser aux valeurs par défaut"
                            onClick={() => resetMut.mutate(role.slug)}
                            disabled={resetMut.isPending}
                            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                        <Button
                          size="sm"
                          disabled={!isDirty || saveMut.isPending}
                          onClick={() => saveMut.mutate({ slug: role.slug, perms })}
                          variant={isDirty ? 'primary' : 'secondary'}
                        >
                          <Save size={13} className="mr-1" />
                          {saveMut.isPending && saveMut.variables?.slug === role.slug ? '…' : 'Sauvegarder'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Les permissions modifient l'accès aux modules pour les nouveaux tokens et sessions.
        Le rôle <span className="font-mono text-red-500">admin</span> dispose toujours de tous les droits.
        Cliquez sur une cellule pour basculer la permission ; survolez la dernière cellule d'un module pour tout cocher/décocher.
      </p>

      {/* ── Modal création rôle ───────────────────────────────────────────── */}
      {showCreate && (
        <Modal title="Créer un rôle personnalisé" onClose={() => { setShowCreate(false); createForm.reset() }}>
          <p className="mb-4 text-sm text-muted-foreground">
            Le nouveau rôle démarre sans aucune permission. Ajustez la matrice après création.
          </p>
          {createMut.isError && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {(createMut.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Une erreur est survenue.'}
            </p>
          )}
          <form onSubmit={createForm.handleSubmit(d => createMut.mutate(d))} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nom affiché</label>
              <Input placeholder="Ex : Technicien terrain" {...createForm.register('name')} />
              {createForm.formState.errors.name && (
                <p className="text-xs text-red-600">{createForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Identifiant (slug)</label>
              <Input placeholder="Ex : tech-terrain" {...createForm.register('slug')} />
              {createForm.formState.errors.slug && (
                <p className="text-xs text-red-600">{createForm.formState.errors.slug.message}</p>
              )}
              <p className="text-[11px] text-muted-foreground">Minuscules, chiffres et tirets uniquement. Non modifiable après création.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); createForm.reset() }}>Annuler</Button>
              <Button type="submit" loading={createMut.isPending}>Créer</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal confirmation suppression rôle ──────────────────────────── */}
      {deleteTarget && (
        <Modal title="Supprimer le rôle" onClose={() => setDeleteTarget(null)}>
          <p className="mb-1 text-sm text-foreground">
            Voulez-vous vraiment supprimer le rôle <strong>{deleteTarget.name}</strong> ?
          </p>
          <p className="mb-5 text-xs text-muted-foreground">
            Les utilisateurs ayant uniquement ce rôle n'auront plus aucune permission. Cette action est irréversible.
          </p>
          {deleteMut.isError && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Une erreur est survenue.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Annuler</Button>
            <Button variant="danger" loading={deleteMut.isPending} onClick={() => deleteMut.mutate(deleteTarget.slug)}>
              Supprimer
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
