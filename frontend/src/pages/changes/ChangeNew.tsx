import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus, X, Search } from 'lucide-react'
import { createChange } from '@/api/changes'
import { listCIs } from '@/api/ci'
import type { ChangeType, ChangePriority, ChangeRisk, CIImpact } from '@/types/api'
import type { ChangeCIPayload } from '@/api/changes'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const LABEL_CLASS  = 'block text-sm font-medium text-foreground mb-1'
const INPUT_CLASS  = 'w-full rounded border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'
const SELECT_CLASS = INPUT_CLASS

const IMPACT_VARIANT: Record<CIImpact, 'default' | 'warning' | 'danger'> = {
  info:     'default',
  affected: 'warning',
  critical: 'danger',
}
const IMPACT_LABEL: Record<CIImpact, string> = {
  info: 'Info', affected: 'Affecté', critical: 'Critique',
}

interface CIRow {
  ci_id: string
  ci_name: string
  ci_type: string
  impact: CIImpact
}

export default function ChangeNew() {
  const navigate = useNavigate()

  const [title, setTitle]           = useState('')
  const [description, setDesc]      = useState('')
  const [changeType, setType]       = useState<ChangeType>('normal')
  const [priority, setPriority]     = useState<ChangePriority>('medium')
  const [risk, setRisk]             = useState<ChangeRisk>('medium')
  const [plannedStart, setStart]    = useState('')
  const [plannedEnd, setEnd]        = useState('')
  const [rollbackPlan, setRollback] = useState('')
  const [notes, setNotes]           = useState('')
  const [ciSearch, setCiSearch]     = useState('')
  const [selectedCIs, setSelectedCIs] = useState<CIRow[]>([])

  const { data: ciData } = useQuery({
    queryKey: ['ci-search', ciSearch],
    queryFn: () => listCIs({ search: ciSearch, limit: 20 }),
    enabled: ciSearch.length >= 2,
  })

  const createMut = useMutation({
    mutationFn: createChange,
    onSuccess: (cr) => navigate(`/changes/${cr.id}`),
  })

  const addCI = (ci: { id: string; name: string; ci_type: string }) => {
    if (selectedCIs.find(c => c.ci_id === ci.id)) return
    setSelectedCIs(prev => [...prev, { ci_id: ci.id, ci_name: ci.name, ci_type: ci.ci_type, impact: 'affected' }])
    setCiSearch('')
  }

  const removeCI = (ci_id: string) => setSelectedCIs(prev => prev.filter(c => c.ci_id !== ci_id))

  const setImpact = (ci_id: string, impact: CIImpact) =>
    setSelectedCIs(prev => prev.map(c => c.ci_id === ci_id ? { ...c, impact } : c))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    createMut.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      change_type: changeType,
      priority,
      risk,
      planned_start: plannedStart || undefined,
      planned_end:   plannedEnd   || undefined,
      rollback_plan: rollbackPlan.trim() || undefined,
      notes:         notes.trim()        || undefined,
      ci_links: selectedCIs.map<ChangeCIPayload>(c => ({ ci_id: c.ci_id, impact: c.impact })),
    })
  }

  const ciResults = ciData?.items ?? []

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/changes')}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold text-foreground">Nouvelle RFC</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Titre */}
        <div>
          <label className={LABEL_CLASS}>Titre <span className="text-red-500">*</span></label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={INPUT_CLASS}
            placeholder="Ex. Mise à jour serveur SQL prod"
            required
          />
        </div>

        {/* Type / Priorité / Risque */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={LABEL_CLASS}>Type</label>
            <select value={changeType} onChange={e => setType(e.target.value as ChangeType)} className={SELECT_CLASS}>
              <option value="normal">Normal</option>
              <option value="standard">Standard</option>
              <option value="emergency">Urgent</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Priorité</label>
            <select value={priority} onChange={e => setPriority(e.target.value as ChangePriority)} className={SELECT_CLASS}>
              <option value="low">Faible</option>
              <option value="medium">Moyenne</option>
              <option value="high">Haute</option>
              <option value="critical">Critique</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Risque</label>
            <select value={risk} onChange={e => setRisk(e.target.value as ChangeRisk)} className={SELECT_CLASS}>
              <option value="low">Faible</option>
              <option value="medium">Moyen</option>
              <option value="high">Élevé</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className={LABEL_CLASS}>Description</label>
          <textarea
            value={description}
            onChange={e => setDesc(e.target.value)}
            rows={3}
            className={INPUT_CLASS + ' resize-none'}
            placeholder="Objectif et périmètre du changement…"
          />
        </div>

        {/* Planification */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>Début planifié</label>
            <input type="datetime-local" value={plannedStart} onChange={e => setStart(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Fin planifiée</label>
            <input type="datetime-local" value={plannedEnd} onChange={e => setEnd(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>

        {/* CIs impactés */}
        <div>
          <label className={LABEL_CLASS}>CIs impactés</label>

          {/* Sélectionnés */}
          {selectedCIs.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {selectedCIs.map(c => (
                <div key={c.ci_id} className="flex items-center gap-2 rounded border border-[hsl(var(--border))] bg-muted/30 px-3 py-1.5">
                  <span className="flex-1 text-sm font-medium text-foreground">{c.ci_name}</span>
                  <select
                    value={c.impact}
                    onChange={e => setImpact(c.ci_id, e.target.value as CIImpact)}
                    className="h-7 rounded border border-[hsl(var(--border))] bg-background px-2 text-xs focus:outline-none"
                  >
                    <option value="info">Info</option>
                    <option value="affected">Affecté</option>
                    <option value="critical">Critique</option>
                  </select>
                  <Badge variant={IMPACT_VARIANT[c.impact]}>{IMPACT_LABEL[c.impact]}</Badge>
                  <button type="button" onClick={() => removeCI(c.ci_id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Recherche CI */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={ciSearch}
              onChange={e => setCiSearch(e.target.value)}
              placeholder="Rechercher un CI à ajouter…"
              className={INPUT_CLASS + ' pl-9'}
            />
            {ciResults.length > 0 && ciSearch.length >= 2 && (
              <div className="absolute z-10 mt-1 w-full rounded border border-[hsl(var(--border))] bg-popover shadow-lg max-h-48 overflow-y-auto">
                {ciResults.map(ci => (
                  <button
                    key={ci.id}
                    type="button"
                    onClick={() => addCI(ci)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium">{ci.name}</span>
                    <Badge variant="muted">{ci.ci_type}</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Plan de retour arrière */}
        <div>
          <label className={LABEL_CLASS}>Plan de retour arrière</label>
          <textarea
            value={rollbackPlan}
            onChange={e => setRollback(e.target.value)}
            rows={2}
            className={INPUT_CLASS + ' resize-none'}
            placeholder="Étapes pour annuler le changement si nécessaire…"
          />
        </div>

        {/* Notes */}
        <div>
          <label className={LABEL_CLASS}>Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className={INPUT_CLASS + ' resize-none'}
            placeholder="Informations complémentaires…"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={!title.trim() || createMut.isPending}>
            {createMut.isPending ? 'Création…' : 'Créer la RFC'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/changes')}>
            Annuler
          </Button>
        </div>

        {createMut.isError && (
          <p className="text-sm text-red-500">Erreur lors de la création. Vérifiez les champs.</p>
        )}
      </form>
    </div>
  )
}
