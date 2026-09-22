import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Play, ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { listWebhooks, createWebhook, deleteWebhook, testWebhook, listDeliveries } from '@/api/alerts'
import type { Webhook, WebhookCreate, WebhookDelivery } from '@/types/api'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/utils'

const schema = z.object({
  name:         z.string().min(1, 'Nom requis'),
  url:          z.string().url('URL invalide'),
  secret:       z.string().optional(),
  event_filter: z.string().default('*'),
})
type FormData = z.infer<typeof schema>

const EVENT_OPTIONS = [
  { value: '*',               label: 'Tous les événements' },
  { value: 'warranty_expiry', label: 'Garantie' },
  { value: 'license_expiry',  label: 'Licence' },
  { value: 'eol',             label: 'EOL éditeur' },
  { value: 'sla_expiry',      label: 'Contrat SLA' },
  { value: 'maintenance_due', label: 'Maintenance' },
]

function DeliveriesPanel({ endpointId }: { endpointId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', endpointId],
    queryFn: () => listDeliveries(endpointId),
  })
  if (isLoading) return <div className="px-4 py-3"><Spinner size="sm" /></div>
  if (!data?.length) return <p className="px-4 py-3 text-sm text-muted-foreground">Aucune livraison.</p>
  return (
    <div className="border-t divide-y">
      {data.map((d) => (
        <div key={d.id} className="flex items-center gap-3 px-4 py-2 text-xs">
          {d.success
            ? <CheckCircle size={13} className="text-green-500 shrink-0" />
            : <XCircle size={13} className="text-red-500 shrink-0" />}
          <span className="text-muted-foreground">{formatDateTime(d.delivered_at)}</span>
          <Badge variant={d.success ? 'success' : 'danger'}>{d.status_code ?? 'erreur'}</Badge>
        </div>
      ))}
    </div>
  )
}

function WebhookRow({ wh }: { wh: Webhook }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const deleteMut = useMutation({
    mutationFn: () => deleteWebhook(wh.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  })

  const testMut = useMutation({
    mutationFn: () => testWebhook(wh.id),
    onSuccess: (res) => setTestResult(res.success ? `OK (${res.status_code})` : `Erreur (${res.status_code ?? 'timeout'})`),
  })

  return (
    <div className="border-b last:border-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setExpanded((v) => !v)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{wh.name}</span>
            <Badge variant={wh.is_active ? 'success' : 'muted'}>{wh.is_active ? 'Actif' : 'Inactif'}</Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{wh.url}</p>
        </div>
        <Badge variant="muted">{wh.event_filter === '*' ? 'Tous' : wh.event_filter}</Badge>
        {testResult && <span className="text-xs text-muted-foreground">{testResult}</span>}
        <Button variant="ghost" size="sm" loading={testMut.isPending} onClick={() => testMut.mutate()}>
          <Play size={13} /> Test
        </Button>
        <button
          onClick={() => { if (confirm(`Supprimer « ${wh.name} » ?`)) deleteMut.mutate() }}
          className="text-muted-foreground hover:text-red-600 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {expanded && <DeliveriesPanel endpointId={wh.id} />}
    </div>
  )
}

export default function Webhooks() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: webhooks, isLoading } = useQuery({ queryKey: ['webhooks'], queryFn: listWebhooks })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { event_filter: '*' },
  })

  const createMut = useMutation({
    mutationFn: (data: WebhookCreate) => createWebhook(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); setShowCreate(false); reset() },
  })

  const onSubmit = (data: FormData) => {
    createMut.mutate({ ...data, secret: data.secret ?? '' })
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Webhooks sortants</h1>
          <p className="text-sm text-muted-foreground">{webhooks?.length ?? 0} endpoint(s)</p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus size={16} /> Nouveau webhook
        </Button>
      </div>

      {showCreate && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-medium">Créer un endpoint</h2>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nom</label>
                <Input placeholder="Slack #alertes" error={errors.name?.message} {...register('name')} />
                {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">URL</label>
                <Input type="url" placeholder="https://hooks.slack.com/..." error={errors.url?.message} {...register('url')} />
                {errors.url && <p className="text-xs text-red-600">{errors.url.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Secret HMAC (optionnel)</label>
                <Input type="password" placeholder="Laissez vide pour désactiver" {...register('secret')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Événements</label>
                <select
                  className="h-9 w-full rounded border border-[hsl(var(--border))] bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  {...register('event_filter')}
                >
                  {EVENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); reset() }}>Annuler</Button>
                <Button type="submit" loading={isSubmitting || createMut.isPending}>Créer</Button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !webhooks?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Aucun webhook configuré. Ajoutez un endpoint pour recevoir les alertes.
          </div>
        ) : (
          <div className="divide-y">
            {webhooks.map((wh) => <WebhookRow key={wh.id} wh={wh} />)}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-dashed bg-card/50 p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Signature HMAC-SHA256</p>
        <p>Chaque requête inclut les en-têtes <code className="bg-muted px-1 rounded">X-CMDB-Signature: sha256=…</code> et <code className="bg-muted px-1 rounded">X-CMDB-Timestamp</code> pour vérifier l'authenticité.</p>
        <p className="font-medium text-foreground mt-2">Flux RSS</p>
        <p>Créez un token API (lecture) puis accédez à <code className="bg-muted px-1 rounded">/api/feeds/alerts.xml?token=…</code></p>
      </div>
    </div>
  )
}
