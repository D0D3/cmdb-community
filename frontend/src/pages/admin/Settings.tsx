import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings2, List, Package, Plus, Trash2, Check, Loader2, Edit2, X, AlertCircle } from 'lucide-react'
import {
  getSettings, patchSettings, listRefItems, createRefItem, updateRefItem, deleteRefItem,
  listPacks, createPack, updatePack, deletePack,
  type AppSettings, type RefItem, type LicensePack, type RefCategory,
} from '@/api/settings'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

// ── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors'
const selectCls = inputCls + ' cursor-pointer'

const CATEGORIES: { key: RefCategory; label: string }[] = [
  { key: 'team',             label: 'Équipes' },
  { key: 'vendor',           label: 'Éditeurs / Fournisseurs' },
  { key: 'manufacturer',     label: 'Fabricants' },
  { key: 'product',          label: 'Produits' },
  { key: 'location',         label: 'Emplacements' },
  { key: 'acquisition_type', label: "Types d'acquisition" },
  { key: 'leasing_provider', label: 'Prestataires leasing' },
]

const CURRENCIES = [
  { value: 'EUR', label: '€ — Euro' },
  { value: 'CHF', label: 'CHF — Franc suisse' },
  { value: 'USD', label: '$ — Dollar US' },
]
const TIMEZONES = [
  'Europe/Paris', 'Europe/London', 'Europe/Brussels', 'Europe/Zurich',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC',
]
const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'JJ/MM/AAAA (31/12/2026)' },
  { value: 'DD.MM.YYYY', label: 'JJ.MM.AAAA (31.12.2026)' },
  { value: 'MM/DD/YYYY', label: 'MM/JJ/AAAA (12/31/2026)' },
  { value: 'YYYY-MM-DD', label: 'AAAA-MM-JJ (2026-12-31)' },
]
const NUMBER_FORMATS = [
  { value: 'FR', label: 'Français : 1 000,00' },
  { value: 'EN', label: 'Anglais : 1,000.00' },
  { value: 'CH', label: 'Suisse : 1\'000.00' },
]

// ── Onglet Général ────────────────────────────────────────────────────────────

function TabGeneral() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['app-settings'], queryFn: getSettings })
  const [form, setForm] = useState<Partial<AppSettings>>({})
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const mutation = useMutation({
    mutationFn: patchSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-settings'] })
      setSaved(true)
      setSaveError(false)
      setTimeout(() => {
        setSaved(false)
        setForm({})
      }, 2000)
    },
    onError: () => {
      setSaveError(true)
      setTimeout(() => setSaveError(false), 3000)
    },
  })

  if (isLoading) return <Spinner />

  const current = { ...data!, ...form }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="space-y-1">
        <label className="block text-sm font-medium">Fuseau horaire</label>
        <select className={selectCls} value={current.timezone}
          onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Format de date</label>
        <select className={selectCls} value={current.date_format}
          onChange={e => setForm(f => ({ ...f, date_format: e.target.value }))}>
          {DATE_FORMATS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Format des nombres</label>
        <select className={selectCls} value={current.number_format}
          onChange={e => setForm(f => ({ ...f, number_format: e.target.value }))}>
          {NUMBER_FORMATS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Devise</label>
        <select className={selectCls} value={current.currency}
          onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
          {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending || Object.keys(form).length === 0}
          className="flex items-center gap-2"
        >
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" />
            : saved ? <Check size={14} />
            : saveError ? <AlertCircle size={14} />
            : null}
          {saved ? 'Enregistré' : saveError ? 'Erreur' : 'Sauvegarder'}
        </Button>
        {saveError && (
          <span className="text-xs text-red-500">Impossible d'enregistrer. Vérifiez vos droits.</span>
        )}
      </div>
    </div>
  )
}

// ── Onglet Listes de référence ────────────────────────────────────────────────

function TabLists() {
  const qc = useQueryClient()
  const [activeCat, setActiveCat] = useState<RefCategory>('team')
  const [newValue, setNewValue] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['reflists', activeCat],
    queryFn: () => listRefItems(activeCat, false),
  })

  const addMutation = useMutation({
    mutationFn: () => createRefItem({ category: activeCat, value: newValue.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reflists', activeCat] }); setNewValue('') },
  })

  const updateMutation = useMutation({
    mutationFn: (id: string) => updateRefItem(id, { value: editValue.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reflists', activeCat] }); setEditId(null) },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateRefItem(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reflists', activeCat] }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteRefItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reflists', activeCat] }),
  })

  return (
    <div className="flex gap-6">
      {/* Sidebar catégories */}
      <div className="w-52 shrink-0 space-y-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => { setActiveCat(cat.key); setEditId(null) }}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              activeCat === cat.key
                ? 'bg-brand text-brand-foreground font-medium'
                : 'text-foreground hover:bg-muted'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div className="flex-1 space-y-4">
        <div className="flex gap-2">
          <input
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newValue.trim() && addMutation.mutate()}
            placeholder={`Ajouter dans ${CATEGORIES.find(c => c.key === activeCat)?.label}…`}
            className={inputCls}
          />
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!newValue.trim() || addMutation.isPending}
            className="shrink-0 flex items-center gap-1.5"
          >
            <Plus size={14} /> Ajouter
          </Button>
        </div>

        {isLoading ? <Spinner /> : (
          <div className="space-y-1">
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Aucune entrée — ajoutez-en une ci-dessus.</p>
            )}
            {items.map((item: RefItem) => (
              <div key={item.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${item.active ? 'border-border bg-card' : 'border-dashed border-border bg-muted/30 opacity-60'}`}>
                {editId === item.id ? (
                  <>
                    <input
                      className={inputCls + ' flex-1 h-7 py-0.5'}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && updateMutation.mutate(item.id)}
                      autoFocus
                    />
                    <button onClick={() => updateMutation.mutate(item.id)} className="text-green-600 hover:text-green-700"><Check size={14} /></button>
                    <button onClick={() => setEditId(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{item.value}</span>
                    <button onClick={() => { setEditId(item.id); setEditValue(item.value) }} className="text-muted-foreground hover:text-foreground"><Edit2 size={13} /></button>
                    <button onClick={() => toggleMutation.mutate({ id: item.id, active: !item.active })}
                      className="text-xs text-muted-foreground hover:text-foreground">
                      {item.active ? 'Désactiver' : 'Activer'}
                    </button>
                    <button onClick={() => deleteMutation.mutate(item.id)} className="text-red-500 hover:text-red-600"><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Onglet Packs de licences ─────────────────────────────────────────────────

function TabPacks() {
  const qc = useQueryClient()
  const { data: packs = [], isLoading } = useQuery({ queryKey: ['license-packs'], queryFn: listPacks })
  const [showForm, setShowForm] = useState(false)
  const [editPack, setEditPack] = useState<LicensePack | null>(null)
  const [form, setForm] = useState({ name: '', license_key: '', total_seats: '', notes: '' })

  const resetForm = () => { setForm({ name: '', license_key: '', total_seats: '', notes: '' }); setEditPack(null); setShowForm(false) }

  const createMutation = useMutation({
    mutationFn: () => createPack({
      name: form.name, license_key: form.license_key || null,
      total_seats: form.total_seats ? parseInt(form.total_seats) : null,
      notes: form.notes || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['license-packs'] }); resetForm() },
  })

  const updateMutation = useMutation({
    mutationFn: () => updatePack(editPack!.id, {
      name: form.name, license_key: form.license_key || null,
      total_seats: form.total_seats ? parseInt(form.total_seats) : null,
      notes: form.notes || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['license-packs'] }); resetForm() },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePack,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['license-packs'] }),
  })

  const startEdit = (p: LicensePack) => {
    setEditPack(p)
    setForm({ name: p.name, license_key: p.license_key ?? '', total_seats: p.total_seats?.toString() ?? '', notes: p.notes ?? '' })
    setShowForm(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { resetForm(); setShowForm(true) }} className="flex items-center gap-1.5">
          <Plus size={14} /> Nouveau pack
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{editPack ? 'Modifier le pack' : 'Nouveau pack de licences'}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium">Nom du pack *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="ex. Microsoft Office 365 — 50 licences" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Clé de licence</label>
                <input value={form.license_key} onChange={e => setForm(f => ({ ...f, license_key: e.target.value }))} className={inputCls} placeholder="XXXXX-XXXXX-XXXXX" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Sièges totaux</label>
                <input type="number" min="1" value={form.total_seats} onChange={e => setForm(f => ({ ...f, total_seats: e.target.value }))} className={inputCls} placeholder="ex. 50" />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputCls + ' resize-none'} rows={2} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => editPack ? updateMutation.mutate() : createMutation.mutate()}
                disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2"
              >
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
                {editPack ? 'Mettre à jour' : 'Créer'}
              </Button>
              <button onClick={resetForm} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">Annuler</button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? <Spinner /> : (
        <div className="space-y-3">
          {packs.length === 0 && <p className="text-sm text-muted-foreground italic">Aucun pack de licences.</p>}
          {packs.map((pack: LicensePack) => {
            const used = pack.assigned_seats
            const total = pack.total_seats ?? 0
            const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
            return (
              <Card key={pack.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{pack.name}</p>
                      {pack.license_key && <p className="text-xs text-muted-foreground font-mono mt-0.5">{pack.license_key}</p>}
                      {pack.notes && <p className="text-xs text-muted-foreground mt-1">{pack.notes}</p>}
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{pack.assigned_count} logiciel(s) — {used} / {total || '∞'} sièges utilisés</span>
                          {total > 0 && <span className={pct >= 90 ? 'text-red-500 font-medium' : ''}>{pct}%</span>}
                        </div>
                        {total > 0 && (
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => startEdit(pack)} className="text-muted-foreground hover:text-foreground"><Edit2 size={15} /></button>
                      <button onClick={() => deleteMutation.mutate(pack.id)} className="text-red-500 hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

type Tab = 'general' | 'lists' | 'packs'

const TABS: { key: Tab; label: string; Icon: typeof Settings2 }[] = [
  { key: 'general', label: 'Général',            Icon: Settings2 },
  { key: 'lists',   label: 'Listes de référence', Icon: List },
  { key: 'packs',   label: 'Packs de licences',   Icon: Package },
]

export default function SettingsAdmin() {
  const [tab, setTab] = useState<Tab>('general')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Configuration globale de la CMDB.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-brand text-brand'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'general' && <TabGeneral />}
        {tab === 'lists'   && <TabLists />}
        {tab === 'packs'   && <TabPacks />}
      </div>
    </div>
  )
}
