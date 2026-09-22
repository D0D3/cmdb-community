import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { createIncident } from '@/api/incidents'
import { listCIs } from '@/api/ci'
import { listUsers } from '@/api/auth'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export default function IncidentNew() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [title, setTitle]           = useState('')
  const [description, setDesc]      = useState('')
  const [severity, setSeverity]     = useState('medium')
  const [assigneeId, setAssigneeId] = useState('')
  const [ciSearch, setCiSearch]     = useState('')
  const [selectedCIs, setSelectedCIs] = useState<{ id: string; name: string; ci_type: string }[]>([])

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: listUsers, staleTime: 120_000 })
  const { data: ciData } = useQuery({
    queryKey: ['ci-search-inc', ciSearch],
    queryFn: () => listCIs({ search: ciSearch, limit: 8 }),
    enabled: ciSearch.length >= 2,
    staleTime: 10_000,
  })

  const mut = useMutation({
    mutationFn: createIncident,
    onSuccess: (inc) => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['incident-stats'] })
      navigate(`/incidents/${inc.id}`)
    },
  })

  const toggleCI = (ci: { id: string; name: string; ci_type: string }) => {
    setSelectedCIs((prev) =>
      prev.some((c) => c.id === ci.id)
        ? prev.filter((c) => c.id !== ci.id)
        : [...prev, ci]
    )
  }

  const submit = () => {
    if (!title.trim()) return
    mut.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      severity,
      assignee_id: assigneeId || undefined,
      ci_ids: selectedCIs.map((c) => c.id),
    })
  }

  const SELECT = 'w-full h-9 rounded border border-[hsl(var(--border))] bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/incidents')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-semibold text-foreground">Nouvel incident</h1>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-5">

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Titre *</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Serveur web hors ligne"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Sévérité</label>
            <select className={SELECT} value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="critical">Critique</option>
              <option value="high">Haute</option>
              <option value="medium">Moyenne</option>
              <option value="low">Faible</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Assigné à</label>
            <select className={SELECT} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Non assigné</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Description</label>
          <textarea
            className="w-full rounded border border-[hsl(var(--border))] bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-none"
            rows={4}
            placeholder="Décrivez l'incident, les symptômes observés…"
            value={description}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>

        {/* CIs impactés */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">CIs impactés</label>
          {selectedCIs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedCIs.map((ci) => (
                <span
                  key={ci.id}
                  onClick={() => toggleCI(ci)}
                  className="flex items-center gap-1 rounded-full border bg-brand/10 text-brand border-brand/20 px-2.5 py-0.5 text-xs cursor-pointer hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                >
                  {ci.name} ×
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Rechercher un CI…"
              value={ciSearch}
              onChange={(e) => setCiSearch(e.target.value)}
            />
          </div>
          {ciData?.items && ciData.items.length > 0 && (
            <div className="rounded border border-[hsl(var(--border))] bg-card shadow-sm divide-y">
              {ciData.items.map((ci) => {
                const selected = selectedCIs.some((c) => c.id === ci.id)
                return (
                  <div
                    key={ci.id}
                    onClick={() => toggleCI(ci)}
                    className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                      selected ? 'bg-brand/5 text-brand' : 'hover:bg-muted/40'
                    }`}
                  >
                    <span>{ci.name}</span>
                    <span className="text-xs text-muted-foreground">{ci.ci_type === 'hardware' ? 'Matériel' : 'Logiciel'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {mut.isError && (
          <p className="text-sm text-red-600">Erreur lors de la création.</p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-[hsl(var(--border))]">
          <Button variant="secondary" onClick={() => navigate('/incidents')}>Annuler</Button>
          <Button disabled={!title.trim() || mut.isPending} onClick={submit}>
            {mut.isPending ? 'Création…' : 'Créer l\'incident'}
          </Button>
        </div>
      </div>
    </div>
  )
}
