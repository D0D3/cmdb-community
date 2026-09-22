import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { CalendarClock, Trash2, RefreshCw, CheckCircle2, Circle, ExternalLink } from 'lucide-react'
import {
  getM365Config, saveM365Config, deleteM365Config, testM365,
  listM365Maintenances, syncMaintenance, unsyncMaintenance, syncAllMaintenances,
} from '@/api/m365'
import type { M365ConfigIn } from '@/api/m365'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'

const KIND_LABEL: Record<string, string> = {
  maintenance: 'Maintenance',
  update:      'Mise à jour',
  patch:       'Patch',
  audit:       'Audit',
}

// ── Section config ────────────────────────────────────────────────────────────

function ConfigSection() {
  const qc = useQueryClient()
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ['m365-config'], queryFn: getM365Config })

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<M365ConfigIn>({
    defaultValues: { enabled: true },
  })

  const saveMut = useMutation({
    mutationFn: saveM365Config,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-config'] })
      toast.success('Configuration M365 sauvegardée.')
    },
    onError: () => toast.error('Erreur lors de la sauvegarde.'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteM365Config,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-config'] })
      setDeleteConfirm(false)
      toast.success('Configuration supprimée.')
    },
    onError: () => toast.error('Impossible de supprimer la configuration.'),
  })

  const testMut = useMutation({
    mutationFn: testM365,
    onSuccess: (r) => toast.success(`Connexion réussie — ${r.display_name} (${r.mail})`),
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Erreur de connexion M365.'),
  })

  if (isLoading) return <div className="flex justify-center py-10"><Spinner /></div>

  return (
    <form onSubmit={handleSubmit(d => saveMut.mutate(d))}>
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-foreground">Configuration Azure App Registration</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-muted-foreground">Activer</span>
            <input type="checkbox" className="h-4 w-4 accent-brand" {...register('enabled')} defaultChecked />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tenant ID <span className="text-red-500">*</span></label>
            <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              defaultValue={data?.config?.tenant_id ?? ''}
              {...register('tenant_id', { required: 'Requis' })} />
            {errors.tenant_id && <p className="text-xs text-red-600">{errors.tenant_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Client ID (App ID) <span className="text-red-500">*</span></label>
            <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              defaultValue={data?.config?.client_id ?? ''}
              {...register('client_id', { required: 'Requis' })} />
            {errors.client_id && <p className="text-xs text-red-600">{errors.client_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Client Secret <span className="text-red-500">*</span></label>
            <Input type="password" placeholder={data?.config?.client_secret === '***' ? '••••••••• (existant)' : ''}
              {...register('client_secret', { required: !data?.configured })} />
            {errors.client_secret && <p className="text-xs text-red-600">{errors.client_secret.message}</p>}
            <p className="text-[11px] text-muted-foreground">Stocké chiffré</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">UPN du calendrier <span className="text-red-500">*</span></label>
            <Input placeholder="maintenance@corp.com"
              defaultValue={data?.config?.calendar_user ?? ''}
              {...register('calendar_user', { required: 'Requis' })} />
            {errors.calendar_user && <p className="text-xs text-red-600">{errors.calendar_user.message}</p>}
            <p className="text-[11px] text-muted-foreground">Adresse de la boîte partagée qui recevra les événements</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex gap-2">
            {data?.configured && (
              <>
                <Button type="button" variant="secondary" size="sm"
                  loading={testMut.isPending} onClick={() => testMut.mutate()}>
                  Tester la connexion
                </Button>
                {deleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">Supprimer ?</span>
                    <Button type="button" variant="danger" size="sm"
                      loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>Oui</Button>
                    <Button type="button" variant="secondary" size="sm"
                      onClick={() => setDeleteConfirm(false)}>Non</Button>
                  </div>
                ) : (
                  <Button type="button" variant="secondary" size="sm"
                    onClick={() => setDeleteConfirm(true)}>
                    <Trash2 size={13} className="mr-1 text-red-400" /> Supprimer
                  </Button>
                )}
              </>
            )}
          </div>
          <Button type="submit" loading={saveMut.isPending} disabled={!isDirty && data?.configured}>
            {data?.configured ? 'Mettre à jour' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </form>
  )
}

// ── Section sync maintenances ─────────────────────────────────────────────────

function SyncSection() {
  const qc = useQueryClient()

  const { data: maintenances, isLoading } = useQuery({
    queryKey: ['m365-maintenances'],
    queryFn:  listM365Maintenances,
  })

  const syncMut = useMutation({
    mutationFn: (id: string) => syncMaintenance(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-maintenances'] })
      toast.success('Maintenance synchronisée vers Outlook.')
    },
    onError: () => toast.error('Erreur lors de la synchronisation.'),
  })

  const unsyncMut = useMutation({
    mutationFn: (id: string) => unsyncMaintenance(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['m365-maintenances'] })
      toast.success('Événement retiré du calendrier.')
    },
    onError: () => toast.error('Erreur lors de la suppression de l\'événement.'),
  })

  const syncAllMut = useMutation({
    mutationFn: syncAllMaintenances,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['m365-maintenances'] })
      toast.success(`Sync terminée — ${r.created} créé(s), ${r.updated} mis à jour, ${r.errors} erreur(s)`)
    },
    onError: () => toast.error('Erreur lors de la synchronisation globale.'),
  })

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-foreground">Synchronisation des maintenances</h2>
        <Button type="button" variant="secondary" size="sm"
          loading={syncAllMut.isPending} onClick={() => syncAllMut.mutate()}>
          <RefreshCw size={13} className="mr-1" /> Tout synchroniser
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : !maintenances?.length ? (
        <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
          <CalendarClock size={28} className="opacity-30" />
          <p className="text-sm">Aucune maintenance active à synchroniser.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="pb-2 pr-3 font-medium w-6" />
              <th className="pb-2 pr-3 font-medium">Maintenance</th>
              <th className="pb-2 pr-3 font-medium">CI</th>
              <th className="pb-2 pr-3 font-medium">Type</th>
              <th className="pb-2 pr-3 font-medium">Date prévue</th>
              <th className="pb-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {maintenances.map(m => (
              <tr key={m.id} className="group">
                <td className="py-2 pr-3">
                  {m.synced
                    ? <CheckCircle2 size={14} className="text-green-500" />
                    : <Circle size={14} className="text-muted-foreground/30" />
                  }
                </td>
                <td className="py-2 pr-3 text-foreground font-medium">{m.title}</td>
                <td className="py-2 pr-3 text-muted-foreground">{m.ci_name}</td>
                <td className="py-2 pr-3 text-muted-foreground text-xs">{KIND_LABEL[m.kind] ?? m.kind}</td>
                <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{m.next_due_date}</td>
                <td className="py-2 text-right">
                  {m.synced ? (
                    <Button type="button" variant="secondary" size="sm"
                      loading={unsyncMut.isPending}
                      onClick={() => unsyncMut.mutate(m.id)}>
                      <Trash2 size={12} className="mr-1 text-red-400" /> Retirer
                    </Button>
                  ) : (
                    <Button type="button" variant="secondary" size="sm"
                      loading={syncMut.isPending}
                      onClick={() => syncMut.mutate(m.id)}>
                      <CalendarClock size={12} className="mr-1" /> Sync
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function M365CalendarAdmin() {
  return (
    <div className="max-w-3xl space-y-8">

      <div className="flex items-center gap-3">
        <CalendarClock size={22} className="text-brand" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Calendrier M365 / Outlook</h1>
          <p className="text-sm text-muted-foreground">
            Synchronise les maintenances CMDB vers un calendrier Outlook via Microsoft Graph API.
          </p>
        </div>
      </div>

      <ConfigSection />

      <SyncSection />

      {/* Guide */}
      <div className="rounded-xl border bg-muted/30 p-4 space-y-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Configuration dans Azure / Entra ID</p>
        <ol className="list-decimal list-inside space-y-1.5 text-xs">
          <li>Dans <strong>Azure Portal → Entra ID → App registrations</strong>, créez une nouvelle application.</li>
          <li>Dans <strong>API permissions</strong>, ajoutez <code className="bg-muted rounded px-1">Calendars.ReadWrite</code> (Application, pas Delegated).</li>
          <li>Accordez le consentement administrateur (<em>Grant admin consent</em>).</li>
          <li>Dans <strong>Certificates &amp; secrets</strong>, créez un secret client et copiez-le ici.</li>
          <li>Renseignez le <strong>Tenant ID</strong> (visible dans l'overview du tenant) et l'<strong>Application (client) ID</strong>.</li>
          <li>Créez ou utilisez une boîte partagée Exchange — entrez son UPN dans <em>UPN du calendrier</em>.</li>
        </ol>
        <a
          href="https://learn.microsoft.com/en-us/graph/api/user-post-events"
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs hover:text-foreground"
        >
          Documentation Graph API — Create event <ExternalLink size={10} />
        </a>
      </div>
    </div>
  )
}
