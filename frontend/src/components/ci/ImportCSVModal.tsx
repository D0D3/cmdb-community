import { useState, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, X, FileText, Download, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react'
import { previewImportCSV, importCSV, downloadTemplate } from '@/api/ci'
import type { ImportPreviewRow, ImportResult } from '@/api/ci'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'upload' | 'preview' | 'result'

export default function ImportCSVModal({ open, onClose }: Props) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [step, setStep]         = useState<Step>('upload')
  const [file, setFile]         = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview]   = useState<ImportPreviewRow[]>([])
  const [result, setResult]     = useState<ImportResult | null>(null)

  const reset = () => {
    setStep('upload')
    setFile(null)
    setPreview([])
    setResult(null)
  }

  const handleClose = () => { reset(); onClose() }

  const previewMut = useMutation({
    mutationFn: previewImportCSV,
    onSuccess: (data) => {
      setPreview(data.rows)
      setStep('preview')
    },
  })

  const importMut = useMutation({
    mutationFn: importCSV,
    onSuccess: (data) => {
      setResult(data)
      setStep('result')
      qc.invalidateQueries({ queryKey: ['cis'] })
    },
  })

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.csv')) return
    setFile(f)
    previewMut.mutate(f)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  if (!open) return null

  const headers = preview.length > 0 ? Object.keys(preview[0]) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl bg-card rounded-xl shadow-2xl border border-[hsl(var(--border))] max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-foreground">Importer des CIs</h2>
            {/* Stepper */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {(['upload', 'preview', 'result'] as Step[]).map((s, i) => {
                const labels = ['Fichier', 'Aperçu', 'Résultat']
                const active = step === s
                const done   = (['upload', 'preview', 'result'] as Step[]).indexOf(step) > i
                return (
                  <span key={s} className="flex items-center gap-1">
                    <span className={cn(
                      'px-2 py-0.5 rounded font-medium',
                      active ? 'bg-brand text-brand-foreground' :
                      done   ? 'text-green-600'                  : 'text-muted-foreground',
                    )}>
                      {labels[i]}
                    </span>
                    {i < 2 && <ChevronRight className="w-3 h-3" />}
                  </span>
                )
              })}
            </div>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Étape 1 : Upload ──────────────────────────────────────────── */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Template */}
              <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Télécharger le modèle CSV</p>
                  <p className="text-xs text-muted-foreground">Contient les colonnes attendues avec des exemples matériel et logiciel</p>
                </div>
                <Button variant="secondary" size="sm" onClick={downloadTemplate}>
                  <Download className="w-3.5 h-3.5 mr-1" /> Modèle CSV
                </Button>
              </div>

              {/* Drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-colors',
                  dragging
                    ? 'border-brand bg-brand/5'
                    : 'border-[hsl(var(--border))] hover:border-brand/50 hover:bg-muted/30',
                )}
              >
                <Upload className={cn('w-10 h-10', dragging ? 'text-brand' : 'text-muted-foreground/50')} />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    {dragging ? 'Déposez le fichier' : 'Glissez votre CSV ici'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">ou cliquez pour parcourir</p>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
              </div>

              {previewMut.isPending && (
                <p className="text-sm text-center text-muted-foreground">Analyse du fichier…</p>
              )}
              {previewMut.isError && (
                <p className="text-sm text-center text-red-500">Erreur lors de l'analyse du fichier.</p>
              )}

              {/* Guide colonnes */}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground transition-colors font-medium">
                  Colonnes reconnues
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-[hsl(var(--border))] p-3">
                  <div>
                    <p className="font-semibold text-foreground mb-1">Colonnes communes</p>
                    <p>name · ci_type · description · status · criticality · team · location</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">Matériel (ci_type=hardware)</p>
                    <p>manufacturer · model · serial_number · hw_subtype · os_name · os_version · purchase_date · warranty_end_date · purchase_price · supplier</p>
                  </div>
                  <div className="col-span-2">
                    <p className="font-semibold text-foreground mb-1">Logiciel (ci_type=software)</p>
                    <p>vendor · product · version · license_type · license_end_date · eol_date · install_count · is_internal</p>
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* ── Étape 2 : Aperçu ──────────────────────────────────────────── */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4" />
                <span className="font-medium text-foreground">{file?.name}</span>
                <span>— aperçu des {preview.length} premières lignes</span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {headers.map(h => (
                        <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                        {headers.map(h => (
                          <td key={h} className="px-3 py-2 text-foreground max-w-[180px] truncate" title={row[h]}>
                            {row[h] || <span className="text-muted-foreground/50">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                Vérifiez que les colonnes correspondent bien au format attendu avant de lancer l'import.
              </p>
            </div>
          )}

          {/* ── Étape 3 : Résultat ────────────────────────────────────────── */}
          {step === 'result' && result && (
            <div className="space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border border-[hsl(var(--border))] bg-card p-4 text-center">
                  <p className="text-3xl font-bold text-foreground">{result.total}</p>
                  <p className="text-xs text-muted-foreground mt-1">Lignes traitées</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 text-center">
                  <p className="text-3xl font-bold text-green-700">{result.created}</p>
                  <p className="text-xs text-green-600 mt-1">CIs créés</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-center">
                  <p className="text-3xl font-bold text-blue-700">{result.updated}</p>
                  <p className="text-xs text-blue-600 mt-1">CIs mis à jour</p>
                </div>
                <div className={cn(
                  'rounded-lg border p-4 text-center',
                  result.errors.length > 0 ? 'border-red-200 bg-red-50/50' : 'border-[hsl(var(--border))] bg-card',
                )}>
                  <p className={cn('text-3xl font-bold', result.errors.length > 0 ? 'text-red-700' : 'text-foreground')}>
                    {result.errors.length}
                  </p>
                  <p className={cn('text-xs mt-1', result.errors.length > 0 ? 'text-red-600' : 'text-muted-foreground')}>
                    Erreurs
                  </p>
                </div>
              </div>

              {/* Message succès */}
              {(result.created > 0 || result.updated > 0) && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <p className="text-sm text-green-700">
                    {result.created > 0 && <><strong>{result.created} CI{result.created > 1 ? 's' : ''}</strong> créé{result.created > 1 ? 's' : ''}{result.updated > 0 ? ', ' : '.'}</>}
                    {result.updated > 0 && <><strong>{result.updated} CI{result.updated > 1 ? 's' : ''}</strong> mis à jour.</>}
                  </p>
                </div>
              )}

              {/* Erreurs détaillées */}
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <p className="text-sm font-medium text-red-700">Erreurs d'import</p>
                  </div>
                  <div className="divide-y divide-red-100 max-h-48 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <div key={i} className="flex gap-3 px-4 py-2 text-xs">
                        <span className="shrink-0 font-medium text-red-600">Ligne {err.row}</span>
                        <span className="text-red-700">{err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[hsl(var(--border))]">
          <Button variant="secondary" size="sm" onClick={step === 'upload' ? handleClose : reset}>
            {step === 'upload' ? 'Annuler' : 'Recommencer'}
          </Button>

          <div className="flex gap-2">
            {step === 'preview' && (
              <Button
                size="sm"
                disabled={importMut.isPending || !file}
                onClick={() => file && importMut.mutate(file)}
              >
                {importMut.isPending ? 'Import en cours…' : `Importer ${preview.length}+ lignes`}
              </Button>
            )}
            {step === 'result' && (
              <Button size="sm" onClick={handleClose}>
                Fermer
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
