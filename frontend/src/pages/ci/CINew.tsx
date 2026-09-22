import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Server, Package, ChevronLeft, Loader2 } from 'lucide-react'
import { createCI, listSLAs, listCIs } from '@/api/ci'
import { listRefItems, listPacks } from '@/api/settings'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import CPEField from '@/components/ci/CPEField'
import { cn } from '@/lib/utils'

// ── Schéma Zod ────────────────────────────────────────────────────────────────

const schema = z
  .object({
    ci_type:     z.enum(['hardware', 'software']),
    name:        z.string().min(1, 'Le nom est obligatoire').max(300),
    description: z.string().optional(),
    status:      z.enum(['ordered', 'in_stock', 'in_service', 'maintenance', 'retired']),
    criticality: z.enum(['low', 'medium', 'high', 'critical']),
    team:        z.string().optional(),
    location:    z.string().optional(),
    sla_id:      z.string().optional(),
    // Hardware
    hw_subtype:         z.string().optional(),
    manufacturer:       z.string().optional(),
    model:              z.string().optional(),
    serial_number:      z.string().optional(),
    purchase_date:      z.string().optional(),
    warranty_end_date:  z.string().optional(),
    supplier:           z.string().optional(),
    purchase_price:     z.string().optional(),
    // Hardware M41
    ip_address:         z.string().optional(),
    host_ci_id:         z.string().optional(),
    acquisition_type:   z.enum(['purchase', 'leasing', 'rental']).optional(),
    leasing_provider:   z.string().optional(),
    leasing_start_date: z.string().optional(),
    leasing_end_date:   z.string().optional(),
    monthly_cost:       z.string().optional(),
    // Software
    product:          z.string().optional(),
    vendor:           z.string().optional(),
    version:          z.string().optional(),
    cpe_name:         z.string().optional(),
    is_internal:      z.boolean().default(false),
    license_type:     z.string().optional(),
    license_end_date: z.string().optional(),
    eol_date:         z.string().optional(),
    install_count:    z.string().optional(),
    max_seats:        z.string().optional(),
    // Software M40
    license_subtype:  z.enum(['perpetual', 'subscription', 'saas', 'oem', 'academic', 'open_source']).optional(),
    license_key:      z.string().optional(),
    pack_id:          z.string().optional(),
    // Software M41
    integrator_name:    z.string().optional(),
    integrator_contact: z.string().optional(),
    integrator_phone:   z.string().optional(),
    integrator_email:   z.string().optional(),
    // OSV
    osv_ecosystem:      z.string().optional(),
    osv_package:        z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.ci_type === 'software' && !data.product?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le produit est obligatoire pour un logiciel',
        path: ['product'],
      })
    }
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

const selectCls = (error?: string) => inputCls(error) + ' cursor-pointer'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
      <div className="flex-1 border-t border-border" />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CINew() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const initialType = searchParams.get('type') === 'software' ? 'software' : 'hardware'
  const initialHwSubtype = searchParams.get('hw_subtype') ?? undefined

  const { data: slas = [] } = useQuery({
    queryKey: ['slas'],
    queryFn: listSLAs,
    staleTime: 120_000,
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ci_type:     initialType,
      status:      'in_service',
      criticality: 'medium',
      is_internal: false,
      hw_subtype:  initialHwSubtype,
    },
  })

  const ciType          = watch('ci_type')
  const vendor          = watch('vendor')
  const product         = watch('product')
  const version         = watch('version')
  const acquisitionType = watch('acquisition_type')
  const licenseSubtype  = watch('license_subtype')

  const { data: teams       = [] } = useQuery({ queryKey: ['reflists', 'team'],             queryFn: () => listRefItems('team') })
  const { data: locations   = [] } = useQuery({ queryKey: ['reflists', 'location'],         queryFn: () => listRefItems('location') })
  const { data: leaseProv   = [] } = useQuery({ queryKey: ['reflists', 'leasing_provider'], queryFn: () => listRefItems('leasing_provider') })
  const { data: packs       = [] } = useQuery({ queryKey: ['license-packs'],                queryFn: listPacks })
  const { data: serverCIs   = { items: [], total: 0 } } = useQuery({
    queryKey: ['ci', 'servers'],
    queryFn:  () => listCIs({ ci_type: 'hardware' }),
  })

  const mutation = useMutation({
    mutationFn: createCI,
    onSuccess: (ci) => {
      qc.invalidateQueries({ queryKey: ['ci'] })
      navigate(`/ci/${ci.id}`)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setServerError(msg ?? 'Une erreur est survenue.')
    },
  })

  function onSubmit(data: FormValues) {
    setServerError(null)
    const empty = (v?: string) => (v?.trim() ? v.trim() : null)

    const payload: Record<string, unknown> = {
      ci_type:     data.ci_type,
      name:        data.name.trim(),
      description: empty(data.description),
      status:      data.status,
      criticality: data.criticality,
      team:        empty(data.team),
      location:    empty(data.location),
      sla_id:      data.sla_id || null,
      attributes:  {},
    }

    if (data.ci_type === 'hardware') {
      payload.hardware = {
        hw_subtype:         empty(data.hw_subtype),
        manufacturer:       empty(data.manufacturer),
        model:              empty(data.model),
        serial_number:      empty(data.serial_number),
        purchase_date:      data.purchase_date || null,
        warranty_end_date:  data.warranty_end_date || null,
        supplier:           empty(data.supplier),
        purchase_price:     data.purchase_price ? parseFloat(data.purchase_price) : null,
        ip_address:         empty(data.ip_address),
        host_ci_id:         data.host_ci_id || null,
        acquisition_type:   data.acquisition_type || null,
        leasing_provider:   empty(data.leasing_provider),
        leasing_start_date: data.leasing_start_date || null,
        leasing_end_date:   data.leasing_end_date || null,
        monthly_cost:       data.monthly_cost ? parseFloat(data.monthly_cost) : null,
      }
    } else {
      payload.software = {
        product:            data.product!.trim(),
        vendor:             empty(data.vendor),
        version:            empty(data.version),
        cpe_name:           empty(data.cpe_name),
        is_internal:        data.is_internal,
        license_type:       empty(data.license_type),
        license_end_date:   data.license_end_date || null,
        eol_date:           data.eol_date || null,
        install_count:      data.install_count ? parseInt(data.install_count, 10) : null,
        max_seats:          data.max_seats ? parseInt(data.max_seats, 10) : null,
        license_subtype:    data.license_subtype || null,
        license_key:        empty(data.license_key),
        pack_id:            data.pack_id || null,
        integrator_name:    empty(data.integrator_name),
        integrator_contact: empty(data.integrator_contact),
        integrator_phone:   empty(data.integrator_phone),
        integrator_email:   empty(data.integrator_email),
        osv_ecosystem:      empty(data.osv_ecosystem),
        osv_package:        empty(data.osv_package),
      }
    }

    mutation.mutate(payload)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* En-tête */}
      <div>
        <Link
          to="/ci"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ChevronLeft size={15} />
          Retour à la liste
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Nouveau CI</h1>
        <p className="text-sm text-muted-foreground">Enregistrez un nouvel élément de configuration dans le parc.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* Sélecteur de type */}
        <Card>
          <CardHeader><CardTitle>Type</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {(['hardware', 'software'] as const).map((type) => {
                const Icon = type === 'hardware' ? Server : Package
                const label = type === 'hardware' ? 'Matériel' : 'Logiciel'
                const desc  = type === 'hardware' ? 'Serveur, poste, switch, etc.' : 'Application, OS, licence, etc.'
                const active = ciType === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setValue('ci_type', type)}
                    className={cn(
                      'flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all',
                      active
                        ? 'border-brand bg-brand/5'
                        : 'border-border bg-card hover:border-brand/40',
                    )}
                  >
                    <div className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg',
                      active ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground',
                    )}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <p className={cn('text-sm font-semibold', active ? 'text-brand' : 'text-foreground')}>{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Informations générales */}
        <Card>
          <CardHeader><CardTitle>Informations générales</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            <Field label="Nom" required error={errors.name?.message}>
              <input
                {...register('name')}
                placeholder="ex. SRV-PROD-01"
                className={inputCls(errors.name?.message)}
              />
            </Field>

            <Field label="Description" error={errors.description?.message}>
              <textarea
                {...register('description')}
                rows={2}
                placeholder="Description libre…"
                className={inputCls(errors.description?.message) + ' resize-none'}
              />
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
                <select {...register('team')} className={selectCls()}>
                  <option value="">— Sélectionner —</option>
                  {teams.map((t: import('@/api/settings').RefItem) => <option key={t.id} value={t.value}>{t.value}</option>)}
                </select>
              </Field>
              <Field label="Emplacement">
                <select {...register('location')} className={selectCls()}>
                  <option value="">— Sélectionner —</option>
                  {locations.map((l: import('@/api/settings').RefItem) => <option key={l.id} value={l.value}>{l.value}</option>)}
                </select>
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
        {ciType === 'hardware' && (
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
                  <input {...register('manufacturer')} placeholder="ex. Dell" className={inputCls()} />
                </Field>
                <Field label="Modèle">
                  <input {...register('model')} placeholder="ex. PowerEdge R750" className={inputCls()} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Numéro de série">
                  <input {...register('serial_number')} placeholder="ex. SN1234567" className={inputCls()} />
                </Field>
                <Field label="Fournisseur">
                  <input {...register('supplier')} placeholder="ex. Ingram Micro" className={inputCls()} />
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

              <Field label="Prix d'achat">
                <input type="number" min="0" step="0.01" {...register('purchase_price')} placeholder="ex. 4500.00" className={inputCls()} />
              </Field>

              <SectionTitle>Réseau & infrastructure</SectionTitle>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Adresse IP">
                  <input {...register('ip_address')} placeholder="ex. 192.168.1.10" className={inputCls()} />
                </Field>
                <Field label="Serveur hôte (VM)">
                  <select {...register('host_ci_id')} className={selectCls()}>
                    <option value="">— Aucun —</option>
                    {serverCIs.items.map(ci => (
                      <option key={ci.id} value={ci.id}>{ci.name}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <SectionTitle>Acquisition</SectionTitle>

              <Field label="Type d'acquisition">
                <select {...register('acquisition_type')} className={selectCls()}>
                  <option value="">— Sélectionner —</option>
                  <option value="purchase">Achat</option>
                  <option value="leasing">Leasing</option>
                  <option value="rental">Location</option>
                </select>
              </Field>

              {(acquisitionType === 'leasing' || acquisitionType === 'rental') && (
                <>
                  <Field label="Prestataire leasing/location">
                    <select {...register('leasing_provider')} className={selectCls()}>
                      <option value="">— Sélectionner —</option>
                      {leaseProv.map((p: import('@/api/settings').RefItem) => <option key={p.id} value={p.value}>{p.value}</option>)}
                    </select>
                  </Field>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Début contrat">
                      <input type="date" {...register('leasing_start_date')} className={inputCls()} />
                    </Field>
                    <Field label="Fin contrat">
                      <input type="date" {...register('leasing_end_date')} className={inputCls()} />
                    </Field>
                    <Field label="Coût mensuel">
                      <input type="number" min="0" step="0.01" {...register('monthly_cost')} placeholder="ex. 150.00" className={inputCls()} />
                    </Field>
                  </div>
                </>
              )}

            </CardContent>
          </Card>
        )}

        {/* Détails logiciel */}
        {ciType === 'software' && (
          <Card>
            <CardHeader><CardTitle>Détails logiciel</CardTitle></CardHeader>
            <CardContent className="space-y-4">

              <div className="grid grid-cols-2 gap-4">
                <Field label="Produit" required error={errors.product?.message}>
                  <input
                    {...register('product')}
                    placeholder="ex. PostgreSQL"
                    className={inputCls(errors.product?.message)}
                  />
                </Field>
                <Field label="Éditeur">
                  <input {...register('vendor')} placeholder="ex. The PostgreSQL Global Development Group" className={inputCls()} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Version">
                  <input {...register('version')} placeholder="ex. 16.3" className={inputCls()} />
                </Field>
                <Field label="Type de licence">
                  <input {...register('license_type')} placeholder="ex. Open Source / Entreprise" className={inputCls()} />
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

              <div className="grid grid-cols-3 gap-4">
                <Field label="Nb d'installations">
                  <input type="number" min="0" {...register('install_count')} placeholder="ex. 25" className={inputCls()} />
                </Field>
                <Field label="Sièges max">
                  <input type="number" min="0" {...register('max_seats')} placeholder="ex. 50" className={inputCls()} />
                </Field>
                <Field label="&nbsp;">
                  <label className="flex items-center gap-2.5 h-9 cursor-pointer">
                    <input type="checkbox" {...register('is_internal')} className="h-4 w-4 rounded border-border text-brand focus:ring-ring" />
                    <span className="text-sm text-foreground">Développement interne</span>
                  </label>
                </Field>
              </div>

              <SectionTitle>Licence avancée</SectionTitle>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Sous-type de licence">
                  <select {...register('license_subtype')} className={selectCls()}>
                    <option value="">— Non précisé —</option>
                    <option value="perpetual">Perpétuelle</option>
                    <option value="subscription">Abonnement annuel</option>
                    <option value="saas">SaaS / Cloud</option>
                    <option value="oem">OEM</option>
                    <option value="academic">Académique / Éducation</option>
                    <option value="open_source">Open source</option>
                  </select>
                </Field>
                <Field label="Clé de licence">
                  <input {...register('license_key')} placeholder="XXXXX-XXXXX-XXXXX" className={inputCls()} />
                </Field>
              </div>

              {packs.length > 0 && (
                <Field label="Pack de licences (optionnel)">
                  <select {...register('pack_id')} className={selectCls()}>
                    <option value="">— Aucun pack —</option>
                    {packs.map((p: import('@/api/settings').LicensePack) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.total_seats ? ` (${p.total_seats} sièges)` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <SectionTitle>Prestataire / Intégrateur</SectionTitle>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Société prestataire">
                  <input {...register('integrator_name')} placeholder="ex. Accenture" className={inputCls()} />
                </Field>
                <Field label="Contact">
                  <input {...register('integrator_contact')} placeholder="Prénom Nom" className={inputCls()} />
                </Field>
                <Field label="Téléphone">
                  <input {...register('integrator_phone')} placeholder="ex. +33 1 23 45 67 89" className={inputCls()} />
                </Field>
                <Field label="Email">
                  <input {...register('integrator_email')} type="email" placeholder="contact@prestataire.com" className={inputCls()} />
                </Field>
              </div>

            </CardContent>
          </Card>
        )}

        {/* Erreur serveur */}
        {serverError && (
          <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {serverError}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Link
            to="/ci"
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
            Créer le CI
          </button>
        </div>

      </form>
    </div>
  )
}
