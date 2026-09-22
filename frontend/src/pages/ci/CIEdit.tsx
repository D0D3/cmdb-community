import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Loader2, Server, Package } from 'lucide-react'
import { getCI, updateCI, listSLAs } from '@/api/ci'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import CPEField from '@/components/ci/CPEField'
import { cn } from '@/lib/utils'

// ── Schéma Zod ────────────────────────────────────────────────────────────────

const schema = z
  .object({
    name:        z.string().min(1, 'Le nom est obligatoire').max(300),
    description: z.string().optional(),
    status:      z.enum(['ordered', 'in_stock', 'in_service', 'maintenance', 'retired']),
    criticality: z.enum(['low', 'medium', 'high', 'critical']),
    team:        z.string().optional(),
    location:    z.string().optional(),
    sla_id:      z.string().optional(),
    // Hardware
    hw_subtype:        z.string().optional(),
    manufacturer:      z.string().optional(),
    model:             z.string().optional(),
    serial_number:     z.string().optional(),
    purchase_date:     z.string().optional(),
    warranty_end_date: z.string().optional(),
    supplier:          z.string().optional(),
    purchase_price:    z.string().optional(),
    // Software
    product:          z.string().optional(),
    vendor:           z.string().optional(),
    version:          z.string().optional(),
    cpe_name:         z.string().optional(),
    osv_ecosystem:    z.string().optional(),
    osv_package:      z.string().optional(),
    is_internal:      z.boolean().default(false),
    license_type:     z.string().optional(),
    license_end_date: z.string().optional(),
    eol_date:         z.string().optional(),
    install_count:    z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // product est validé côté parent via ci_type; on ne l'a pas ici
    // La validation sera appliquée au submit selon ci_type
    void data; void ctx
  })

type FormValues = z.infer<typeof schema>

// ── Helpers UI ────────────────────────────────────────────────────────────────

function Field({ label, error, children, required }: {
  label: string; error?: string; children: React.ReactNode; required?: boolean
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-foreground">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

const inputCls = (error?: string) =>
  cn(
    'w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
    'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors',
    error ? 'border-red-500' : 'border-border',
  )

const selectCls = () => inputCls() + ' cursor-pointer'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
      <div className="flex-1 border-t border-border" />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CIEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { data: ci, isLoading: ciLoading } = useQuery({
    queryKey: ['ci', id],
    queryFn: () => getCI(id!),
    enabled: !!id,
  })

  const { data: slas = [] } = useQuery({
    queryKey: ['slas'],
    queryFn: listSLAs,
    staleTime: 120_000,
  })

  const { register, handleSubmit, reset, watch, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!ci) return
    const hw = ci.hardware_details
    const sw = ci.software_details
    reset({
      name:        ci.name,
      description: ci.description ?? '',
      status:      ci.status as FormValues['status'],
      criticality: ci.criticality as FormValues['criticality'],
      team:        ci.team ?? '',
      location:    ci.location ?? '',
      sla_id:      ci.sla_id ?? '',
      // Hardware
      hw_subtype:        hw?.hw_subtype ?? '',
      manufacturer:      hw?.manufacturer ?? '',
      model:             hw?.model ?? '',
      serial_number:     hw?.serial_number ?? '',
      purchase_date:     hw?.purchase_date ?? '',
      warranty_end_date: hw?.warranty_end_date ?? '',
      supplier:          hw?.supplier ?? '',
      purchase_price:    hw?.purchase_price != null ? String(hw.purchase_price) : '',
      // Software
      product:          sw?.product ?? '',
      vendor:           sw?.vendor ?? '',
      version:          sw?.version ?? '',
      cpe_name:         sw?.cpe_name ?? '',
      osv_ecosystem:    sw?.osv_ecosystem ?? '',
      osv_package:      sw?.osv_package ?? '',
      is_internal:      sw?.is_internal ?? false,
      license_type:     sw?.license_type ?? '',
      license_end_date: sw?.license_end_date ?? '',
      eol_date:         sw?.eol_date ?? '',
      install_count:    sw?.install_count != null ? String(sw.install_count) : '',
    })
  }, [ci, reset])

  const mutation = useMutation({
    mutationFn: (payload: unknown) => updateCI(id!, payload),
    onSuccess: (updated) => {
      qc.setQueryData(['ci', id], updated)
      qc.invalidateQueries({ queryKey: ['ci'] })
      navigate(`/ci/${id}`, { replace: true })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setServerError(msg ?? 'Une erreur est survenue.')
    },
  })

  const vendor  = watch('vendor')
  const product = watch('product')
  const version = watch('version')

  function onSubmit(data: FormValues) {
    if (!ci) return
    setServerError(null)
    const empty = (v?: string) => (v?.trim() ? v.trim() : null)

    const payload: Record<string, unknown> = {
      name:        data.name.trim(),
      description: empty(data.description),
      status:      data.status,
      criticality: data.criticality,
      team:        empty(data.team),
      location:    empty(data.location),
      sla_id:      data.sla_id || null,
    }

    if (ci.ci_type === 'hardware') {
      payload.hardware = {
        hw_subtype:        empty(data.hw_subtype),
        manufacturer:      empty(data.manufacturer),
        model:             empty(data.model),
        serial_number:     empty(data.serial_number),
        purchase_date:     data.purchase_date || null,
        warranty_end_date: data.warranty_end_date || null,
        supplier:          empty(data.supplier),
        purchase_price:    data.purchase_price ? parseFloat(data.purchase_price) : null,
      }
    } else {
      if (!data.product?.trim()) {
        setServerError('Le produit est obligatoire pour un logiciel.')
        return
      }
      payload.software = {
        product:          data.product.trim(),
        vendor:           empty(data.vendor),
        version:          empty(data.version),
        cpe_name:         empty(data.cpe_name),
        osv_ecosystem:    empty(data.osv_ecosystem),
        osv_package:      empty(data.osv_package),
        is_internal:      data.is_internal,
        license_type:     empty(data.license_type),
        license_end_date: data.license_end_date || null,
        eol_date:         data.eol_date || null,
        install_count:    data.install_count ? parseInt(data.install_count, 10) : null,
      }
    }

    mutation.mutate(payload)
  }

  if (ciLoading) return <div className="flex justify-center py-16"><Spinner /></div>
  if (!ci) return <div className="py-12 text-center text-muted-foreground">CI introuvable.</div>

  const isHardware = ci.ci_type === 'hardware'
  const TypeIcon = isHardware ? Server : Package

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* En-tête */}
      <div>
        <Link
          to={`/ci/${id}`}
          replace
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ChevronLeft size={15} />
          Retour à la fiche
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <TypeIcon size={18} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Modifier le CI</h1>
            <p className="text-sm text-muted-foreground">{ci.name}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* Informations générales */}
        <Card>
          <CardHeader><CardTitle>Informations générales</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            <Field label="Nom" required error={errors.name?.message}>
              <input {...register('name')} className={inputCls(errors.name?.message)} />
            </Field>

            <Field label="Description">
              <textarea {...register('description')} rows={2} className={inputCls() + ' resize-none'} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Statut">
                <select {...register('status')} className={selectCls()}>
                  <option value="ordered">Commandé</option>
                  <option value="in_stock">En stock</option>
                  <option value="in_service">En service</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="retired">Retraité</option>
                </select>
              </Field>
              <Field label="Criticité">
                <select {...register('criticality')} className={selectCls()}>
                  <option value="low">Faible</option>
                  <option value="medium">Moyenne</option>
                  <option value="high">Haute</option>
                  <option value="critical">Critique</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Équipe">
                <input {...register('team')} placeholder="ex. Infra" className={inputCls()} />
              </Field>
              <Field label="Emplacement">
                <input {...register('location')} placeholder="ex. DC-Paris / Baie 3" className={inputCls()} />
              </Field>
            </div>

            <Field label="SLA">
              <select {...register('sla_id')} className={selectCls()}>
                <option value="">Aucun</option>
                {slas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.level ? ` — ${s.level}` : ''}
                  </option>
                ))}
              </select>
            </Field>

          </CardContent>
        </Card>

        {/* Détails matériel */}
        {isHardware && (
          <Card>
            <CardHeader><CardTitle>Détails matériel</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Sous-type matériel">
                <select {...register('hw_subtype')} className={selectCls()}>
                  <option value="">— Sélectionner —</option>
                  <option value="server">Serveur</option>
                  <option value="vm">Machine virtuelle</option>
                  <option value="workstation">Poste de travail</option>
                  <option value="terminal_server">Serveur de terminaux</option>
                  <option value="network_device">Équipement réseau</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Fabricant">
                  <input {...register('manufacturer')} className={inputCls()} />
                </Field>
                <Field label="Modèle">
                  <input {...register('model')} className={inputCls()} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Numéro de série">
                  <input {...register('serial_number')} className={inputCls()} />
                </Field>
                <Field label="Fournisseur">
                  <input {...register('supplier')} className={inputCls()} />
                </Field>
              </div>
              <SectionTitle>Dates & prix</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Date d'achat">
                  <input type="date" {...register('purchase_date')} className={inputCls()} />
                </Field>
                <Field label="Fin de garantie">
                  <input type="date" {...register('warranty_end_date')} className={inputCls()} />
                </Field>
              </div>
              <Field label="Prix d'achat (€)">
                <input type="number" min="0" step="0.01" {...register('purchase_price')} className={inputCls()} />
              </Field>
            </CardContent>
          </Card>
        )}

        {/* Détails logiciel */}
        {!isHardware && (
          <Card>
            <CardHeader><CardTitle>Détails logiciel</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Produit" required error={errors.product?.message}>
                  <input {...register('product')} className={inputCls(errors.product?.message)} />
                </Field>
                <Field label="Éditeur">
                  <input {...register('vendor')} className={inputCls()} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Version">
                  <input {...register('version')} className={inputCls()} />
                </Field>
                <Field label="Type de licence">
                  <input {...register('license_type')} className={inputCls()} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="OSV Ecosystem">
                  <input {...register('osv_ecosystem')} placeholder="ex. Go, npm, PyPI…" className={inputCls()} />
                </Field>
                <Field label="OSV Package">
                  <input {...register('osv_package')} placeholder="ex. github.com/traefik/traefik/v3" className={inputCls()} />
                </Field>
              </div>

              <Field label="CPE (identifiant de vulnérabilité)">
                <Controller
                  control={control}
                  name="cpe_name"
                  render={({ field }) => (
                    <CPEField
                      vendor={vendor}
                      product={product}
                      version={version}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      inputCls={inputCls}
                    />
                  )}
                />
              </Field>

              <SectionTitle>Dates</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Fin de licence">
                  <input type="date" {...register('license_end_date')} className={inputCls()} />
                </Field>
                <Field label="EOL éditeur">
                  <input type="date" {...register('eol_date')} className={inputCls()} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nb d'installations">
                  <input type="number" min="0" {...register('install_count')} className={inputCls()} />
                </Field>
                <Field label="&nbsp;">
                  <label className="flex items-center gap-2.5 h-9 cursor-pointer">
                    <input type="checkbox" {...register('is_internal')}
                      className="h-4 w-4 rounded border-border text-brand focus:ring-ring" />
                    <span className="text-sm text-foreground">Développement interne</span>
                  </label>
                </Field>
              </div>
            </CardContent>
          </Card>
        )}

        {serverError && (
          <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {serverError}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pb-8">
          <Link
            to={`/ci/${id}`}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex items-center gap-2 rounded-md bg-brand px-5 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Enregistrer
          </button>
        </div>

      </form>
    </div>
  )
}
