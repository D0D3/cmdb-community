import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Share2, Plus, Pencil, Trash2, X, Check,
  Download, Upload, Info, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  listSegments, createSegment, updateSegment, deleteSegment,
  exportSegmentsCSV, importSegmentsCSV,
} from '@/api/network'
import type { NetworkSegment } from '@/types/api'
import type { SegmentIn, ImportResult } from '@/api/network'
import Spinner from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

const SEGMENT_TYPES = [
  { value: 'vlan',   label: 'VLAN' },
  { value: 'dmz',    label: 'DMZ' },
  { value: 'lan',    label: 'LAN' },
  { value: 'wan',    label: 'WAN' },
  { value: 'subnet', label: 'Sous-réseau' },
  { value: 'other',  label: 'Autre' },
]

const TYPE_BADGE: Record<string, string> = {
  vlan:   'bg-blue-100 text-blue-700',
  dmz:    'bg-red-100 text-red-700',
  lan:    'bg-green-100 text-green-700',
  wan:    'bg-purple-100 text-purple-700',
  subnet: 'bg-teal-100 text-teal-700',
  other:  'bg-slate-100 text-slate-600',
}

const BLANK: SegmentIn = { name: '', type: 'vlan', vlan_id: null, subnet: null, description: null, color: null }

const CSV_EXAMPLE = `name,type,vlan_id,subnet,description,color
VLAN 10 — Production,vlan,10,10.10.10.0/24,Serveurs de production,#3B82F6
DMZ Publique,dmz,100,192.168.100.0/28,Services exposés Internet,#EF4444
LAN Interne,lan,,172.16.0.0/16,Réseau local principal,
WAN — Opérateur,wan,,,Liaison Internet,#64748B`

// ── Modal création / édition ─────────────────────────────────────────────────

function SegmentModal({
  initial, onClose, onSave, saving,
}: {
  initial: SegmentIn
  onClose: () => void
  onSave: (d: SegmentIn) => void
  saving: boolean
}) {
  const [form, setForm] = useState<SegmentIn>(initial)
  const set = (k: keyof SegmentIn, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-card border shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base">
            {initial.name ? 'Modifier le segment' : 'Nouveau segment réseau'}
          </h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nom *</label>
            <input
              className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="ex. VLAN 10 — Production"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type *</label>
              <select
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.type}
                onChange={e => set('type', e.target.value)}
              >
                {SEGMENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">VLAN ID</label>
              <input
                type="number" min={1} max={4094}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.vlan_id ?? ''}
                onChange={e => set('vlan_id', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="1–4094"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Sous-réseau (CIDR)</label>
              <input
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.subnet ?? ''}
                onChange={e => set('subnet', e.target.value || null)}
                placeholder="192.168.10.0/24"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Couleur</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-12 rounded-md border bg-background cursor-pointer p-1"
                  value={form.color ?? '#3B82F6'}
                  onChange={e => set('color', e.target.value)}
                />
                <input
                  className="flex-1 h-9 rounded-md border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  value={form.color ?? ''}
                  onChange={e => set('color', e.target.value || null)}
                  placeholder="#3B82F6"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description</label>
            <input
              className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.description ?? ''}
              onChange={e => set('description', e.target.value || null)}
              placeholder="Segment de production…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-md border text-sm text-muted-foreground hover:bg-muted">
            Annuler
          </button>
          <button
            disabled={!form.name.trim() || saving}
            onClick={() => onSave(form)}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-brand-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Spinner size="sm" /> : <Check size={14} />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Import CSV modal ─────────────────────────────────────────────────────────

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTech, setShowTech] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const res = await importSegmentsCSV(file)
      setResult(res)
      onDone()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur lors de l\'import'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-card border shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Upload size={16} className="text-brand" />
            Importer des segments (CSV)
          </h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>

        {/* Note technique */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3 mb-4">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-blue-600 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
              <p className="font-medium">Comportement de l'import (mise à jour et ajout)</p>
              <ul className="list-disc pl-3 space-y-0.5 text-blue-700 dark:text-blue-400">
                <li>Si un segment avec le même <strong>nom</strong> existe, ses champs sont <strong>mis à jour</strong>.</li>
                <li>Si le nom est nouveau, le segment est <strong>créé</strong>.</li>
                <li>Les segments absents du fichier sont <strong>conservés</strong> (aucune suppression automatique).</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Format CSV */}
        <button
          onClick={() => setShowTech(v => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3"
        >
          {showTech ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Voir le format CSV attendu
        </button>
        {showTech && (
          <pre className="text-[10px] font-mono bg-muted rounded-md p-3 overflow-x-auto mb-4 leading-relaxed text-muted-foreground">
{CSV_EXAMPLE}
          </pre>
        )}

        {/* Sélection fichier */}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null) }}
        />

        {result ? (
          <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm mb-4">
            <p className="font-medium text-foreground">Import terminé</p>
            <div className="flex gap-4 text-xs">
              <span className="text-green-600">✓ {result.created} créé{result.created > 1 ? 's' : ''}</span>
              <span className="text-blue-600">↻ {result.updated} mis à jour</span>
              {result.skipped > 0 && <span className="text-muted-foreground">— {result.skipped} ignoré{result.skipped > 1 ? 's' : ''}</span>}
            </div>
            {result.errors.length > 0 && (
              <ul className="text-xs text-destructive space-y-0.5">
                {result.errors.map((e, i) => <li key={i}>⚠ {e}</li>)}
              </ul>
            )}
          </div>
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed cursor-pointer py-8 mb-4 transition-colors',
              file ? 'border-brand bg-brand/5' : 'border-border hover:border-muted-foreground',
            )}
          >
            <Upload size={24} className={file ? 'text-brand' : 'text-muted-foreground/40'} />
            {file ? (
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} Ko</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Cliquer pour sélectionner un fichier CSV</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">UTF-8 ou Excel (encodage automatique)</p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 text-destructive text-xs p-2 mb-3">
            <AlertCircle size={13} />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border text-sm text-muted-foreground hover:bg-muted">
            {result ? 'Fermer' : 'Annuler'}
          </button>
          {!result && (
            <button
              disabled={!file || loading}
              onClick={handleImport}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-brand-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Spinner size="sm" /> : <Upload size={14} />}
              Importer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function NetworkSegmentsAdmin() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; editing: NetworkSegment | null }>({ open: false, editing: null })
  const [importOpen, setImportOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const { data: segments = [], isLoading } = useQuery({
    queryKey: ['network-segments'],
    queryFn: listSegments,
  })

  const saveMut = useMutation({
    mutationFn: (d: SegmentIn) =>
      modal.editing ? updateSegment(modal.editing.id, d) : createSegment(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['network-segments'] })
      setModal({ open: false, editing: null })
    },
  })

  const delMut = useMutation({
    mutationFn: deleteSegment,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['network-segments'] }); setDeleting(null) },
  })

  async function handleExport() {
    setExporting(true)
    try { await exportSegmentsCSV() } finally { setExporting(false) }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Share2 size={20} className="text-brand" />
            Segments réseau
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gérez les VLANs, DMZ et sous-réseaux. Associez-les aux CIs depuis leur onglet <strong>Réseau</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExport}
            disabled={exporting || segments.length === 0}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {exporting ? <Spinner size="sm" /> : <Download size={14} />}
            Exporter CSV
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Upload size={14} />
            Importer CSV
          </button>
          <button
            onClick={() => setModal({ open: true, editing: null })}
            className="flex items-center gap-2 rounded-md bg-brand text-brand-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
          >
            <Plus size={14} />
            Nouveau segment
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : segments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed gap-3 text-center">
          <Share2 size={32} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Aucun segment réseau configuré.</p>
          <div className="flex gap-3">
            <button onClick={() => setModal({ open: true, editing: null })} className="text-sm text-brand hover:underline">
              Créer manuellement
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button onClick={() => setImportOpen(true)} className="text-sm text-brand hover:underline">
              Importer un CSV
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Nom</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">VLAN ID</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Sous-réseau</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">CIs</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Couleur</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {segments.map((seg, i) => (
                <tr key={seg.id} className={cn('border-b last:border-0', i % 2 === 0 ? '' : 'bg-muted/20')}>
                  <td className="px-4 py-2.5 font-medium">{seg.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYPE_BADGE[seg.type] ?? 'bg-slate-100 text-slate-600')}>
                      {SEGMENT_TYPES.find(t => t.value === seg.type)?.label ?? seg.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono">
                    {seg.vlan_id ?? <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">
                    {seg.subnet ?? <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[180px] truncate">
                    {seg.description ?? <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{seg.ci_count}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border shrink-0" style={{ background: seg.resolved_color }} />
                      <span className="text-xs text-muted-foreground font-mono">{seg.resolved_color}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setModal({ open: true, editing: seg })}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Pencil size={13} />
                      </button>
                      {deleting === seg.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => delMut.mutate(seg.id)}
                            disabled={delMut.isPending}
                            className="text-xs px-2 py-1 rounded bg-destructive text-white hover:opacity-90"
                          >
                            {delMut.isPending ? '…' : 'Confirmer'}
                          </button>
                          <button onClick={() => setDeleting(null)} className="text-xs px-2 py-1 rounded border hover:bg-muted">
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleting(seg.id)}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {modal.open && (
        <SegmentModal
          initial={modal.editing
            ? {
                name: modal.editing.name,
                type: modal.editing.type,
                vlan_id: modal.editing.vlan_id ?? null,
                subnet: modal.editing.subnet ?? null,
                description: modal.editing.description ?? null,
                color: modal.editing.color ?? null,
              }
            : BLANK
          }
          onClose={() => setModal({ open: false, editing: null })}
          onSave={d => saveMut.mutate(d)}
          saving={saveMut.isPending}
        />
      )}

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ['network-segments'] })}
        />
      )}
    </div>
  )
}
