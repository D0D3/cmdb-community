import { useRef, useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, CalendarDays, List, Plus,
  Wrench, RefreshCw, Shield, ClipboardCheck, Trash2,
  CheckCircle2, Search, X, CalendarClock, Download, Upload,
} from 'lucide-react'
import {
  listGlobalMaintenance, createMaintenance, deleteMaintenance, logMaintenance,
  importMaintenanceCSV,
} from '@/api/ci'
import { listCIs } from '@/api/ci'
import { listUsers } from '@/api/auth'
import type { MaintenanceGlobalItem } from '@/types/api'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { formatDate, cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// ── Constantes ────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  maintenance: 'Maintenance', update: 'Mise à jour', patch: 'Patch', audit: 'Audit',
}
const KIND_COLOR: Record<string, string> = {
  maintenance: 'bg-blue-500',
  update:      'bg-green-500',
  patch:       'bg-orange-500',
  audit:       'bg-purple-500',
}
const KIND_PILL: Record<string, string> = {
  maintenance: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  update:      'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/40 dark:text-green-300',
  patch:       'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  audit:       'border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
}
const KIND_BADGE: Record<string, 'info' | 'success' | 'warning' | 'muted'> = {
  maintenance: 'info', update: 'success', patch: 'warning', audit: 'muted',
}
const KIND_ICON: Record<string, React.ElementType> = {
  maintenance: Wrench, update: RefreshCw, patch: Shield, audit: ClipboardCheck,
}
const ALL_KINDS = ['maintenance', 'update', 'patch', 'audit']

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const CSV_TEMPLATE = `ci_name,title,kind,date,rrule,assignee_email
"Serveur-Web-01","Patch sécurité mensuel","patch","2026-07-15","FREQ=MONTHLY",""
"Switch-Core","Mise à jour firmware","update","2026-08-01","",""
"Firewall-DMZ","Audit configuration","audit","2026-09-10","FREQ=YEARLY","admin@exemple.com"`

// ── Helpers calendrier ─────────────────────────────────────────────────────────

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1)
}
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}
function mondayOfWeek(d: Date): number {
  const day = d.getDay()
  return day === 0 ? 6 : day - 1
}

// ── Export CSV ─────────────────────────────────────────────────────────────────

function exportCSV(events: MaintenanceGlobalItem[]) {
  const header = 'Date,CI,Titre,Type,Récurrence,Assigné'
  const rruleLabel = (r: string | null) => {
    if (!r) return 'Une fois'
    if (r.includes('INTERVAL=3')) return 'Trimestriel'
    if (r === 'FREQ=MONTHLY') return 'Mensuel'
    if (r === 'FREQ=YEARLY') return 'Annuel'
    return r
  }
  const rows = events.map(ev =>
    [ev.next_due_date, ev.ci_name, ev.title, KIND_LABEL[ev.kind] ?? ev.kind,
     rruleLabel(ev.rrule ?? null), ev.assignee_name ?? '']
    .map(v => `"${String(v).replace(/"/g, '""')}"`)
    .join(',')
  )
  const csv = '﻿' + [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `maintenances-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function downloadTemplate() {
  const blob = new Blob(['﻿' + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'modele-import-maintenances.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Modal création ─────────────────────────────────────────────────────────────

function CreateModal({ onClose, defaultDate }: { onClose: () => void; defaultDate?: string }) {
  const qc = useQueryClient()
  const [ciSearch, setCiSearch]     = useState('')
  const [selectedCI, setSelectedCI] = useState<{ id: string; name: string } | null>(null)
  const [title, setTitle]           = useState('')
  const [kind, setKind]             = useState('maintenance')
  const [date, setDate]             = useState(defaultDate ?? new Date().toISOString().slice(0, 10))
  const [recurrence, setRecurrence] = useState('once')
  const [assignee, setAssignee]     = useState('')

  const { data: ciResults } = useQuery({
    queryKey: ['ci-search-maint', ciSearch],
    queryFn: () => listCIs({ search: ciSearch, limit: 6 }),
    enabled: ciSearch.length >= 2,
    staleTime: 10_000,
  })
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: listUsers, staleTime: 120_000 })

  const mut = useMutation({
    mutationFn: ({ ciId, data }: { ciId: string; data: Parameters<typeof createMaintenance>[1] }) =>
      createMaintenance(ciId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-global'] })
      onClose()
    },
  })

  const rruleMap: Record<string, string | undefined> = {
    once:      undefined,
    monthly:   'FREQ=MONTHLY',
    quarterly: 'FREQ=MONTHLY;INTERVAL=3',
    annual:    'FREQ=YEARLY',
  }

  const submit = () => {
    if (!selectedCI || !title.trim()) return
    mut.mutate({
      ciId: selectedCI.id,
      data: {
        title: title.trim(),
        kind,
        next_due_date: date,
        rrule: rruleMap[recurrence],
        remind_days: [30, 7],
        assigned_to: assignee || null,
      },
    })
  }

  const SEL = 'w-full h-9 rounded border border-[hsl(var(--border))] bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-card border shadow-xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Planifier une maintenance</h2>

        {/* Recherche CI */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">CI concerné *</label>
          {selectedCI ? (
            <div className="flex items-center gap-2 rounded border border-brand/30 bg-brand/5 px-3 py-2">
              <span className="flex-1 text-sm font-medium text-brand">{selectedCI.name}</span>
              <button onClick={() => setSelectedCI(null)} className="text-muted-foreground hover:text-foreground">
                <X size={13} />
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input className="pl-8" placeholder="Rechercher un CI…" value={ciSearch} onChange={(e) => setCiSearch(e.target.value)} autoFocus />
              </div>
              {ciResults?.items && ciResults.items.length > 0 && (
                <div className="rounded border border-[hsl(var(--border))] bg-card shadow-sm divide-y max-h-40 overflow-y-auto">
                  {ciResults.items.map((ci) => (
                    <div key={ci.id} onClick={() => { setSelectedCI(ci); setCiSearch('') }}
                      className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                      <span>{ci.name}</span>
                      <span className="text-xs text-muted-foreground">{ci.ci_type === 'hardware' ? 'Matériel' : 'Logiciel'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Titre *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Mise à jour firmware" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Type</label>
            <select className={SEL} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="maintenance">Maintenance</option>
              <option value="update">Mise à jour</option>
              <option value="patch">Patch</option>
              <option value="audit">Audit</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Récurrence</label>
            <select className={SEL} value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              <option value="once">Une fois</option>
              <option value="monthly">Mensuel</option>
              <option value="quarterly">Trimestriel</option>
              <option value="annual">Annuel</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Assigné à</label>
            <select className={SEL} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Non assigné</option>
              {users?.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
        </div>

        {mut.isError && <p className="text-sm text-red-600">Erreur lors de la création.</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-[hsl(var(--border))]">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button disabled={!selectedCI || !title.trim() || mut.isPending} onClick={submit}>
            {mut.isPending ? 'Création…' : 'Planifier'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Modal résultat import ──────────────────────────────────────────────────────

function ImportResultModal({
  result, onClose,
}: {
  result: { created: number; errors: { row: number; ci_name: string; message: string }[] }
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-card border shadow-xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Résultat de l'import</h2>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-4 py-3 flex-1 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{result.created}</p>
            <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">créées</p>
          </div>
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 flex-1 text-center">
            <p className="text-2xl font-bold text-red-700 dark:text-red-400">{result.errors.length}</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">erreur{result.errors.length > 1 ? 's' : ''}</p>
          </div>
        </div>
        {result.errors.length > 0 && (
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Détail des erreurs</p>
            {result.errors.map((e, i) => (
              <div key={i} className="flex items-start gap-2 rounded border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-3 py-2 text-xs">
                <span className="shrink-0 text-muted-foreground">Ligne {e.row}</span>
                <span className="font-medium text-foreground shrink-0">{e.ci_name || '—'}</span>
                <span className="text-red-700 dark:text-red-400 flex-1">{e.message}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between items-center pt-2 border-t border-[hsl(var(--border))]">
          <button
            onClick={downloadTemplate}
            className="text-xs text-muted-foreground hover:text-brand flex items-center gap-1.5 transition-colors"
          >
            <Download size={12} /> Télécharger le modèle CSV
          </button>
          <Button onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  )
}

// ── Carte maintenance ─────────────────────────────────────────────────────────

function MaintCard({ item, onDelete, onLog, canWrite }: {
  item: MaintenanceGlobalItem
  onDelete: () => void
  onLog: () => void
  canWrite: boolean
}) {
  const navigate = useNavigate()
  const KindIcon = KIND_ICON[item.kind]
  const today = new Date().toISOString().slice(0, 10)
  const isPast = item.next_due_date < today
  const isToday = item.next_due_date === today
  const daysUntil = Math.ceil((new Date(item.next_due_date).getTime() - new Date(today).getTime()) / 86_400_000)

  return (
    <div className={cn(
      'rounded-lg border bg-card p-3 space-y-2 transition-colors',
      isPast ? 'border-red-200 bg-red-50/30' : isToday ? 'border-amber-200 bg-amber-50/30' : '',
    )}>
      <div className="flex items-start gap-2.5">
        <div className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded', `bg-${item.kind === 'maintenance' ? 'blue' : item.kind === 'update' ? 'green' : item.kind === 'patch' ? 'orange' : 'purple'}-100`)}>
          <KindIcon size={12} className={`text-${item.kind === 'maintenance' ? 'blue' : item.kind === 'update' ? 'green' : item.kind === 'patch' ? 'orange' : 'purple'}-600`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">{item.title}</p>
          <button
            onClick={() => navigate(`/ci/${item.ci_id}`)}
            className="text-xs text-brand hover:underline mt-0.5"
          >
            {item.ci_name}
          </button>
        </div>
        <div className="flex items-center gap-1">
          {item.m365_event_id && (
            <span title="Synchronisé dans le calendrier M365">
              <CalendarClock size={12} className="text-blue-500" />
            </span>
          )}
          {canWrite && (
            <>
              <button
                title="Marquer effectuée"
                onClick={onLog}
                className="p-1 rounded text-muted-foreground hover:text-green-600 transition-colors"
              >
                <CheckCircle2 size={13} />
              </button>
              <button
                title="Supprimer"
                onClick={() => { if (confirm(`Supprimer « ${item.title} » ?`)) onDelete() }}
                className="p-1 rounded text-muted-foreground hover:text-red-600 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{item.assignee_name ?? 'Non assigné'}</span>
        <span className={cn('font-medium', isPast ? 'text-red-600' : isToday ? 'text-amber-600' : daysUntil <= 7 ? 'text-orange-500' : '')}>
          {isPast ? `−${Math.abs(daysUntil)}j` : isToday ? "Aujourd'hui" : `+${daysUntil}j`}
        </span>
      </div>
    </div>
  )
}

// ── Calendrier ────────────────────────────────────────────────────────────────

function Calendar({
  year, month, events, selectedDay, onSelectDay,
}: {
  year: number
  month: number
  events: MaintenanceGlobalItem[]
  selectedDay: string | null
  onSelectDay: (day: string) => void
}) {
  const firstDow = mondayOfWeek(startOfMonth(year, month))
  const totalDays = daysInMonth(year, month)
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const byDay = useMemo(() => {
    const map: Record<string, MaintenanceGlobalItem[]> = {}
    for (const ev of events) {
      const key = ev.next_due_date.slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(ev)
    }
    return map
  }, [events])

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {DAYS_FR.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="border-b border-r last:border-r-0 min-h-[80px] bg-muted/10" />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = byDay[dateStr] ?? []
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDay
          const isPast = dateStr < todayStr

          return (
            <div
              key={idx}
              onClick={() => onSelectDay(dateStr)}
              className={cn(
                'border-b border-r last:border-r-0 min-h-[80px] p-1.5 cursor-pointer transition-colors',
                isSelected ? 'bg-brand/5 ring-1 ring-inset ring-brand' : 'hover:bg-muted/30',
                isPast && !isToday ? 'opacity-60' : '',
              )}
            >
              <div className={cn(
                'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1',
                isToday ? 'bg-brand text-brand-foreground' : 'text-foreground',
              )}>
                {day}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <div
                    key={ev.id}
                    className={cn('rounded px-1 py-0.5 text-[10px] font-medium text-white truncate', KIND_COLOR[ev.kind])}
                    title={`${ev.title} — ${ev.ci_name}`}
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const qc = useQueryClient()
  const { can } = useAuth()
  const canWrite = can('changes:write')

  const now = new Date()
  const [year, setYear]         = useState(now.getFullYear())
  const [month, setMonth]       = useState(now.getMonth())
  const [view, setView]         = useState<'calendar' | 'list'>('calendar')
  const [visibleKinds, setVisibleKinds] = useState<Set<string>>(new Set(ALL_KINDS))
  const [selectedDay, setSelectedDay]   = useState<string | null>(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [createDate, setCreateDate]     = useState<string | undefined>()
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState<{
    created: number; errors: { row: number; ci_name: string; message: string }[]
  } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const fromDate = new Date(year, month - 1, 1).toISOString().slice(0, 10)
  const toDate   = new Date(year, month + 2, 0).toISOString().slice(0, 10)

  const { data: rawEvents = [], isLoading } = useQuery({
    queryKey: ['maintenance-global', year, month],
    queryFn: () => listGlobalMaintenance({
      from_date: new Date(year, month, 1).toISOString().slice(0, 10),
      to_date:   new Date(year, month + 1, 0).toISOString().slice(0, 10),
    }),
    staleTime: 30_000,
  })

  const { data: rawListEvents = [], isLoading: listLoading } = useQuery({
    queryKey: ['maintenance-list'],
    queryFn: () => listGlobalMaintenance({
      from_date: new Date().toISOString().slice(0, 10),
      to_date: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    }),
    enabled: view === 'list',
    staleTime: 30_000,
  })

  // Filtrage par types visibles
  const events     = useMemo(() => rawEvents.filter(e => visibleKinds.has(e.kind)),     [rawEvents, visibleKinds])
  const listEvents = useMemo(() => rawListEvents.filter(e => visibleKinds.has(e.kind)), [rawListEvents, visibleKinds])

  const deleteMut = useMutation({
    mutationFn: ({ ciId, schedId }: { ciId: string; schedId: string }) =>
      deleteMaintenance(ciId, schedId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-global'] })
      qc.invalidateQueries({ queryKey: ['maintenance-list'] })
    },
  })

  const logMut = useMutation({
    mutationFn: ({ ciId, schedId }: { ciId: string; schedId: string }) =>
      logMaintenance(ciId, schedId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-global'] }),
  })

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }
  const goToday   = () => { setYear(now.getFullYear()); setMonth(now.getMonth()) }

  const selectedEvents = selectedDay
    ? events.filter(e => e.next_due_date.slice(0, 10) === selectedDay)
    : []

  function toggleKind(k: string) {
    setVisibleKinds(prev => {
      const next = new Set(prev)
      if (next.has(k)) { if (next.size > 1) next.delete(k) }
      else next.add(k)
      return next
    })
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const result = await importMaintenanceCSV(file)
      setImportResult(result)
      if (result.created > 0) {
        qc.invalidateQueries({ queryKey: ['maintenance-global'] })
        qc.invalidateQueries({ queryKey: ['maintenance-list'] })
      }
    } catch {
      setImportResult({ created: 0, errors: [{ row: 0, ci_name: '', message: 'Erreur serveur lors de l\'import.' }] })
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ''
    }
  }

  const currentListForExport = view === 'list' ? listEvents : events

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Maintenances</h1>
          <p className="text-sm text-muted-foreground">
            {view === 'calendar'
              ? `${events.length} maintenance${events.length > 1 ? 's' : ''} en ${MONTHS_FR[month]}`
              : `Prochaines 90 jours`
            }
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">

          {/* Toggle de visibilité par type */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {ALL_KINDS.map(k => {
              const active = visibleKinds.has(k)
              return (
                <button
                  key={k}
                  onClick={() => toggleKind(k)}
                  title={active ? `Masquer ${KIND_LABEL[k]}` : `Afficher ${KIND_LABEL[k]}`}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                    active ? KIND_PILL[k] : 'border-border bg-muted/20 text-muted-foreground opacity-50 line-through',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', active ? KIND_COLOR[k] : 'bg-muted-foreground')} />
                  {KIND_LABEL[k]}
                </button>
              )
            })}
          </div>

          {/* Toggle vue */}
          <div className="flex rounded-lg border bg-muted/30 p-0.5">
            <button
              onClick={() => setView('calendar')}
              className={cn('rounded px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5',
                view === 'calendar' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <CalendarDays size={14} /> Calendrier
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('rounded px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5',
                view === 'list' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <List size={14} /> Liste
            </button>
          </div>

          {/* Export */}
          <button
            onClick={() => exportCSV(view === 'list' ? listEvents : rawEvents.filter(e => visibleKinds.has(e.kind)))}
            title="Exporter la liste en CSV"
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Download size={13} /> Exporter
          </button>

          {/* Import */}
          {canWrite && (
            <>
              <input
                ref={importRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleImport}
              />
              <button
                onClick={() => importRef.current?.click()}
                disabled={importing}
                title="Importer un fichier CSV de maintenances"
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Upload size={13} /> {importing ? 'Import…' : 'Importer'}
              </button>
              <Button onClick={() => { setCreateDate(undefined); setShowCreate(true) }}>
                <Plus size={15} /> Planifier
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Vue calendrier */}
      {view === 'calendar' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="rounded border p-1.5 hover:bg-muted/50 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-base font-semibold text-foreground min-w-[160px] text-center">
              {MONTHS_FR[month]} {year}
            </h2>
            <button onClick={nextMonth} className="rounded border p-1.5 hover:bg-muted/50 transition-colors">
              <ChevronRight size={16} />
            </button>
            <button onClick={goToday} className="text-xs text-brand hover:underline ml-1">
              Aujourd'hui
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <Calendar
                year={year} month={month}
                events={events}
                selectedDay={selectedDay}
                onSelectDay={(d) => setSelectedDay(d === selectedDay ? null : d)}
              />

              <div className="space-y-3">
                {selectedDay ? (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        {new Date(selectedDay + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </h3>
                      {canWrite && (
                        <button
                          onClick={() => { setCreateDate(selectedDay); setShowCreate(true) }}
                          className="text-xs text-brand hover:underline flex items-center gap-1"
                        >
                          <Plus size={11} /> Ajouter
                        </button>
                      )}
                    </div>
                    {selectedEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Aucune maintenance ce jour.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedEvents.map((ev) => (
                          <MaintCard
                            key={ev.id}
                            item={ev}
                            canWrite={canWrite}
                            onDelete={() => deleteMut.mutate({ ciId: ev.ci_id, schedId: ev.id })}
                            onLog={() => logMut.mutate({ ciId: ev.ci_id, schedId: ev.id })}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed bg-card/50 p-6 text-center text-sm text-muted-foreground">
                    Cliquez sur un jour pour voir les maintenances planifiées.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vue liste */}
      {view === 'list' && (
        <div className="rounded-lg border bg-card overflow-hidden">
          {listLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : listEvents.length === 0 ? (
            <div className="py-14 text-center">
              <CalendarDays size={28} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">Aucune maintenance dans les 90 prochains jours</p>
              <button
                onClick={downloadTemplate}
                className="mt-3 text-xs text-brand hover:underline flex items-center gap-1 mx-auto"
              >
                <Download size={12} /> Télécharger le modèle d'import CSV
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {['Date', 'CI', 'Titre', 'Type', 'Assigné', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listEvents.map((ev) => {
                  const today = new Date().toISOString().slice(0, 10)
                  const isPast = ev.next_due_date < today
                  const isToday = ev.next_due_date === today
                  const daysUntil = Math.ceil((new Date(ev.next_due_date).getTime() - new Date(today).getTime()) / 86_400_000)
                  const KindIcon = KIND_ICON[ev.kind]

                  return (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className={cn('text-sm font-medium', isPast ? 'text-red-600' : isToday ? 'text-amber-600' : '')}>
                          {formatDate(ev.next_due_date)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {isPast ? `−${Math.abs(daysUntil)}j` : isToday ? "Aujourd'hui" : `+${daysUntil}j`}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => window.location.href = `/ci/${ev.ci_id}`}
                          className="text-brand text-sm hover:underline"
                        >
                          {ev.ci_name}
                        </button>
                        <p className="text-xs text-muted-foreground">{ev.ci_type === 'hardware' ? 'Matériel' : 'Logiciel'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{ev.title}</span>
                        {ev.rrule && <span className="ml-2 text-[10px] text-muted-foreground rounded bg-muted px-1.5 py-0.5">récurrent</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <KindIcon size={12} className="text-muted-foreground" />
                          <Badge variant={KIND_BADGE[ev.kind]}>{KIND_LABEL[ev.kind]}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm">
                        {ev.assignee_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {canWrite && (
                          <div className="flex items-center gap-1">
                            <button
                              title="Marquer effectuée"
                              onClick={() => logMut.mutate({ ciId: ev.ci_id, schedId: ev.id })}
                              className="p-1 rounded text-muted-foreground hover:text-green-600 transition-colors"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                            <button
                              title="Supprimer"
                              onClick={() => { if (confirm(`Supprimer « ${ev.title} » ?`)) deleteMut.mutate({ ciId: ev.ci_id, schedId: ev.id }) }}
                              className="p-1 rounded text-muted-foreground hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          defaultDate={createDate}
        />
      )}

      {importResult && (
        <ImportResultModal
          result={importResult}
          onClose={() => setImportResult(null)}
        />
      )}
    </div>
  )
}
