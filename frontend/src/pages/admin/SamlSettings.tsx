import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ShieldCheck, Copy, Check, Trash2, Download, ExternalLink, Plus, Link2 } from 'lucide-react'
import {
  getSamlConfig, saveSamlConfig, deleteSamlConfig, getSamlMetadataXml,
  listGroupMappings, createGroupMapping, deleteGroupMapping, getOidcStatus,
} from '@/api/saml'
import type { SamlConfigIn } from '@/api/saml'
import { client } from '@/api/client'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'

// ── Schéma ────────────────────────────────────────────────────────────────────

const schema = z.object({
  idp_entity_id: z.string().min(1, 'Requis'),
  idp_sso_url:   z.string().url('URL invalide'),
  idp_cert:      z.string().min(20, 'Certificat requis'),
  attr_email:    z.string().min(1, 'Requis'),
  attr_name:     z.string().min(1, 'Requis'),
  attr_groups:   z.string(),
  sp_entity_id:  z.string().optional(),
  sp_cert:       z.string().optional(),
  sp_key:        z.string().optional(),
  enabled:       z.boolean(),
})
type FormData = z.infer<typeof schema>

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
      title="Copier"
    >
      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
    </button>
  )
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all text-foreground">
          {value}
        </code>
        <CopyButton text={value} />
      </div>
    </div>
  )
}

const SOURCE_LABELS: Record<string, string> = {
  saml: 'SAML',
  oidc: 'OIDC',
  ldap: 'LDAP',
}
const SOURCE_COLORS: Record<string, string> = {
  saml: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  oidc: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  ldap: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
}

// ── Section : mappings groupe → rôle ─────────────────────────────────────────

interface RoleOpt { id: string; name: string; slug: string }

function GroupMappingsSection() {
  const qc = useQueryClient()
  const [source, setSource] = useState('saml')
  const [groupName, setGroupName] = useState('')
  const [roleId, setRoleId] = useState('')
  const [addError, setAddError] = useState('')

  const { data: mappings, isLoading } = useQuery({
    queryKey: ['group-mappings'],
    queryFn: listGroupMappings,
  })

  const { data: roles } = useQuery<RoleOpt[]>({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const res = await client.get<RoleOpt[]>('/admin/permissions/roles')
      return res.data
    },
  })

  const createMut = useMutation({
    mutationFn: createGroupMapping,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-mappings'] })
      setGroupName('')
      setAddError('')
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.detail ?? 'Erreur lors de la création')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteGroupMapping,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-mappings'] }),
  })

  const handleAdd = () => {
    if (!groupName.trim()) { setAddError('Le nom du groupe est requis'); return }
    if (!roleId)            { setAddError('Sélectionnez un rôle'); return }
    setAddError('')
    createMut.mutate({ source, group_name: groupName.trim(), role_id: roleId })
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-brand" />
        <h2 className="font-medium text-foreground">Mappings groupe IdP → rôle CMDB</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Quand un utilisateur se connecte via SSO, ses groupes sont comparés à ces règles.
        Le premier rôle correspondant lui est attribué automatiquement.
      </p>

      {/* Tableau */}
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : mappings && mappings.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="pb-2 pr-3 font-medium">Source</th>
              <th className="pb-2 pr-3 font-medium">Nom du groupe</th>
              <th className="pb-2 pr-3 font-medium">Rôle CMDB</th>
              <th className="pb-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {mappings.map(m => (
              <tr key={m.id} className="group">
                <td className="py-2 pr-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${SOURCE_COLORS[m.source] ?? 'bg-muted text-muted-foreground'}`}>
                    {SOURCE_LABELS[m.source] ?? m.source}
                  </span>
                </td>
                <td className="py-2 pr-3 font-mono text-xs text-foreground">{m.group_name}</td>
                <td className="py-2 pr-3 text-foreground">{m.role_name}</td>
                <td className="py-2">
                  <button
                    onClick={() => deleteMut.mutate(m.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all"
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-muted-foreground py-2">
          Aucun mapping configuré. Les utilisateurs SSO sans mapping n'auront aucun rôle.
        </p>
      )}

      {/* Formulaire d'ajout */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ajouter une règle</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Source</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              className="rounded border border-[hsl(var(--border))] bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            >
              <option value="saml">SAML</option>
              <option value="oidc">OIDC</option>
              <option value="ldap">LDAP</option>
            </select>
          </div>

          <div className="space-y-1 flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground">Nom du groupe IdP</label>
            <Input
              placeholder="ex: IT-Admins, sg-cmdb-users…"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Rôle CMDB</label>
            <select
              value={roleId}
              onChange={e => setRoleId(e.target.value)}
              className="rounded border border-[hsl(var(--border))] bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            >
              <option value="">— Choisir —</option>
              {roles?.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleAdd}
            loading={createMut.isPending}
          >
            <Plus size={14} className="mr-1" /> Ajouter
          </Button>
        </div>

        {addError && (
          <p className="text-xs text-red-600">{addError}</p>
        )}
      </div>
    </div>
  )
}

// ── Section : état OIDC ───────────────────────────────────────────────────────

function OidcStatusSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['oidc-status'],
    queryFn: getOidcStatus,
  })

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-foreground">OIDC / OpenID Connect</h2>
        {isLoading ? (
          <Spinner />
        ) : data?.enabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Configuré
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Non configuré
          </span>
        )}
      </div>

      {data?.enabled ? (
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Fournisseur</p>
            <p className="font-medium text-foreground">{data.provider}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Client ID</p>
            <p className="font-mono text-xs text-foreground">{data.client_id}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Issuer</p>
            <p className="font-mono text-xs text-foreground break-all">{data.issuer}</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Configurez OIDC via les variables d'environnement <code className="bg-muted px-1 rounded">OIDC_ISSUER</code>,{' '}
          <code className="bg-muted px-1 rounded">OIDC_CLIENT_ID</code> et{' '}
          <code className="bg-muted px-1 rounded">OIDC_CLIENT_SECRET</code> dans votre fichier <code className="bg-muted px-1 rounded">.env</code>.
        </p>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function SamlSettings() {
  const qc = useQueryClient()
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [metadataXml, setMetadataXml] = useState<string | null>(null)
  const [showXml, setShowXml] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-saml'],
    queryFn: getSamlConfig,
  })

  const { register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      attr_email:  'email',
      attr_name:   'displayName',
      attr_groups: 'groups',
      enabled:     true,
    },
  })

  useEffect(() => {
    if (!data?.config) return
    reset({
      idp_entity_id: data.config.idp_entity_id ?? '',
      idp_sso_url:   data.config.idp_sso_url ?? '',
      idp_cert:      data.config.idp_cert ?? '',
      attr_email:    data.config.attr_email ?? 'email',
      attr_name:     data.config.attr_name ?? 'displayName',
      attr_groups:   data.config.attr_groups ?? 'groups',
      sp_entity_id:  data.config.sp_entity_id ?? '',
      sp_cert:       data.config.sp_cert ?? '',
      sp_key:        '',
      enabled:       data.enabled,
    })
  }, [data, reset])

  const saveMut = useMutation({
    mutationFn: (d: SamlConfigIn) => saveSamlConfig(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-saml'] })
      toast.success('Configuration SAML sauvegardée avec succès.')
    },
    onError: () => toast.error('Erreur lors de la sauvegarde. Vérifiez les champs.'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteSamlConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-saml'] })
      reset()
      setDeleteConfirm(false)
      toast.success('Configuration SAML supprimée.')
    },
    onError: () => toast.error('Impossible de supprimer la configuration.'),
  })

  const onSubmit = (d: FormData) => {
    const payload: SamlConfigIn = {
      idp_entity_id: d.idp_entity_id,
      idp_sso_url:   d.idp_sso_url,
      idp_cert:      d.idp_cert,
      attr_email:    d.attr_email,
      attr_name:     d.attr_name,
      attr_groups:   d.attr_groups,
      enabled:       d.enabled,
    }
    if (d.sp_entity_id) payload.sp_entity_id = d.sp_entity_id
    if (d.sp_cert)      payload.sp_cert      = d.sp_cert
    if (d.sp_key)       payload.sp_key       = d.sp_key
    saveMut.mutate(payload)
  }

  const loadMetadata = async () => {
    try {
      const xml = await getSamlMetadataXml()
      setMetadataXml(xml)
      setShowXml(true)
    } catch {
      toast.error('Impossible de générer les métadonnées. Vérifiez la configuration.')
    }
  }

  const downloadMetadata = () => {
    if (!metadataXml) return
    const blob = new Blob([metadataXml], { type: 'application/xml' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'sp-metadata.xml'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="max-w-3xl space-y-8">

      {/* En-tête */}
      <div className="flex items-center gap-3">
        <ShieldCheck size={22} className="text-brand" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">SSO / SAML 2.0</h1>
          <p className="text-sm text-muted-foreground">
            Authentification unique via un Identity Provider SAML ou OIDC — mappings groupe → rôle inclus.
          </p>
        </div>
      </div>

      {/* ── OIDC status ─────────────────────────────────────────────────────── */}
      <OidcStatusSection />

      {/* ── Section SP (lecture seule) ──────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-foreground">Informations Service Provider (SP)</h2>
          <span className="text-xs text-muted-foreground">À fournir à votre IdP</span>
        </div>

        <ReadonlyField
          label="ACS URL (Assertion Consumer Service)"
          value={data?.sp_acs_url ?? ''}
        />
        <ReadonlyField
          label="Entity ID du SP"
          value={data?.sp_entity_id ?? ''}
        />

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={loadMetadata}>
            Afficher les métadonnées XML
          </Button>
          {metadataXml && (
            <Button type="button" variant="secondary" size="sm" onClick={downloadMetadata}>
              <Download size={13} className="mr-1" /> Télécharger
            </Button>
          )}
        </div>

        {showXml && metadataXml && (
          <div className="relative">
            <pre className="rounded bg-muted p-3 text-[11px] font-mono overflow-x-auto max-h-48 text-muted-foreground">
              {metadataXml}
            </pre>
            <button
              onClick={() => setShowXml(false)}
              className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Masquer
            </button>
          </div>
        )}
      </div>

      {/* ── Formulaire config IdP ────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="rounded-xl border bg-card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-foreground">Configuration Identity Provider SAML (IdP)</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-muted-foreground">Activer</span>
              <input type="checkbox" className="h-4 w-4 accent-brand" {...register('enabled')} />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Entity ID de l'IdP <span className="text-red-500">*</span></label>
              <Input placeholder="https://your-idp.example.com/saml" {...register('idp_entity_id')} />
              {errors.idp_entity_id && <p className="text-xs text-red-600">{errors.idp_entity_id.message}</p>}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">URL SSO de l'IdP <span className="text-red-500">*</span></label>
              <Input placeholder="https://your-idp.example.com/sso/saml" {...register('idp_sso_url')} />
              {errors.idp_sso_url && <p className="text-xs text-red-600">{errors.idp_sso_url.message}</p>}
              <p className="text-[11px] text-muted-foreground">SingleSignOnService URL (HTTP-Redirect binding)</p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Certificat X.509 de l'IdP <span className="text-red-500">*</span></label>
              <textarea
                rows={5}
                placeholder={"-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----"}
                className="w-full rounded border border-[hsl(var(--border))] bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-y"
                {...register('idp_cert')}
              />
              {errors.idp_cert && <p className="text-xs text-red-600">{errors.idp_cert.message}</p>}
              <p className="text-[11px] text-muted-foreground">Collez le certificat complet (PEM ou base64 brut, sans les lignes -----)</p>
            </div>
          </div>

          {/* Mapping attributs */}
          <div className="border-t pt-4 space-y-3">
            <h3 className="text-sm font-medium text-foreground">Mapping des attributs SAML</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
                <Input placeholder="email" {...register('attr_email')} />
                {errors.attr_email && <p className="text-xs text-red-600">{errors.attr_email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nom complet</label>
                <Input placeholder="displayName" {...register('attr_name')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Groupes (optionnel)</label>
                <Input placeholder="groups" {...register('attr_groups')} />
                <p className="text-[11px] text-muted-foreground">Utilisé pour la synchronisation des rôles</p>
              </div>
            </div>
          </div>

          {/* SP avancé (optionnel) */}
          <details className="border-t pt-4">
            <summary className="text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none">
              Paramètres SP avancés (optionnel)
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Entity ID du SP (personnalisé)</label>
                <Input placeholder={data?.sp_entity_id} {...register('sp_entity_id')} />
                <p className="text-[11px] text-muted-foreground">Laissez vide pour utiliser la valeur par défaut</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Certificat SP (pour requêtes signées)</label>
                <textarea
                  rows={3}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  className="w-full rounded border border-[hsl(var(--border))] bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-y"
                  {...register('sp_cert')}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Clé privée SP</label>
                <textarea
                  rows={3}
                  placeholder="-----BEGIN PRIVATE KEY-----"
                  className="w-full rounded border border-[hsl(var(--border))] bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-y"
                  {...register('sp_key')}
                />
                <p className="text-[11px] text-muted-foreground">Stockée chiffrée — ne jamais partager</p>
              </div>
            </div>
          </details>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              {data?.configured && (
                deleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">Confirmer la suppression ?</span>
                    <Button type="button" variant="danger" size="sm" loading={deleteMut.isPending}
                      onClick={() => deleteMut.mutate()}>
                      Supprimer
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteConfirm(false)}>
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteConfirm(true)}>
                    <Trash2 size={13} className="mr-1 text-red-400" /> Supprimer la config
                  </Button>
                )
              )}
            </div>
            <Button type="submit" loading={saveMut.isPending} disabled={!isDirty && data?.configured}>
              {data?.configured ? 'Mettre à jour' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </form>

      {/* ── Mappings groupe → rôle ────────────────────────────────────────────── */}
      <GroupMappingsSection />

      {/* Aide rapide */}
      <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Guides de configuration IdP</p>
        <ul className="space-y-1 list-disc list-inside text-xs">
          <li>
            <a href="https://help.okta.com/en-us/content/topics/apps/apps_app_integration_wizard_saml.htm"
              target="_blank" rel="noopener noreferrer"
              className="hover:text-foreground inline-flex items-center gap-0.5">
              Okta — SAML App Wizard <ExternalLink size={10} />
            </a>
          </li>
          <li>
            <a href="https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/add-application-portal-setup-saml-sso"
              target="_blank" rel="noopener noreferrer"
              className="hover:text-foreground inline-flex items-center gap-0.5">
              Microsoft Entra ID (Azure AD) — SAML SSO <ExternalLink size={10} />
            </a>
          </li>
          <li>
            <a href="https://docs.microsoft.com/en-us/windows-server/identity/ad-fs/operations/create-a-relying-party-trust"
              target="_blank" rel="noopener noreferrer"
              className="hover:text-foreground inline-flex items-center gap-0.5">
              ADFS — Relying Party Trust <ExternalLink size={10} />
            </a>
          </li>
        </ul>
      </div>
    </div>
  )
}
