import { useCallback, useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Server, Package, Maximize2, Minimize2, X, ExternalLink } from 'lucide-react'
import type { CIGraph as CIGraphData, GraphNode, GraphEdge, GraphSegment } from '@/types/api'
import { cn } from '@/lib/utils'

// ── Couleurs ──────────────────────────────────────────────────────────────────

const CRIT_BORDER: Record<string, string> = {
  critical: 'border-red-500',
  high:     'border-orange-400',
  medium:   'border-blue-400',
  low:      'border-slate-300',
}
const STATUS_DOT: Record<string, string> = {
  in_service:  'bg-green-500',
  maintenance: 'bg-amber-500',
  retired:     'bg-red-400',
  in_stock:    'bg-slate-400',
  ordered:     'bg-blue-400',
}
const RELATION_COLOR: Record<string, string> = {
  hosted_on:    '#3B82F6',
  depends_on:   '#F97316',
  assigned_to:  '#22C55E',
  connected_to: '#A855F7',
}
const RELATION_LABEL: Record<string, string> = {
  hosted_on:    'hébergé sur',
  depends_on:   'dépend de',
  assigned_to:  'assigné à',
  connected_to: 'connecté à',
}
const LEVEL_OPACITY: Record<number, string> = {
  0: 'opacity-100',
  1: 'opacity-100',
  2: 'opacity-95',
  3: 'opacity-85',
  4: 'opacity-70',
  5: 'opacity-55',
}

// ── Nœud custom ───────────────────────────────────────────────────────────────

type NodeData = {
  graphNode: GraphNode
  isRoot: boolean
  isSelected: boolean
  onSelect: (id: string) => void
}

function CINode({ data }: NodeProps) {
  const d = data as NodeData
  const { graphNode: n } = d
  const Icon = n.ci_type === 'hardware' ? Server : Package
  const isL0 = n.level === 0

  return (
    <div
      onClick={() => d.onSelect(n.id)}
      onDoubleClick={(e) => { e.stopPropagation() }}
      title={`${n.name}\n${n.team ?? ''} ${n.location ? `· ${n.location}` : ''}`}
      className={cn(
        'flex items-center gap-2 rounded-xl border-2 bg-card px-3 py-2 cursor-pointer select-none transition-all',
        CRIT_BORDER[n.criticality] ?? 'border-border',
        LEVEL_OPACITY[n.level] ?? '',
        isL0 ? 'min-w-[170px] shadow-[0_0_0_3px_hsl(var(--brand))]' : 'min-w-[130px] shadow-sm',
        d.isSelected && !isL0 ? 'ring-2 ring-brand ring-offset-1' : '',
      )}
    >
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0 }} />

      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
        n.ci_type === 'hardware' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700',
      )}>
        <Icon size={13} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn('truncate font-medium leading-tight', isL0 ? 'text-sm' : 'text-xs')}>
          {n.name}
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[n.status] ?? 'bg-slate-300')} />
          <span className="text-[10px] text-muted-foreground capitalize">
            {n.status.replace('_', ' ')}
          </span>
          {n.level > 0 && (
            <span className="ml-auto text-[9px] text-muted-foreground/60 font-mono">
              N{n.level}
            </span>
          )}
        </div>
        {n.segments && n.segments.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-1">
            {n.segments.map((seg: GraphSegment) => (
              <span
                key={seg.name}
                className="text-[9px] px-1 py-0 rounded-sm font-medium leading-4"
                style={{
                  background: seg.color + '22',
                  color: seg.color,
                  border: `1px solid ${seg.color}55`,
                }}
              >
                {seg.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const nodeTypes = { ciNode: CINode }

// ── Layout sectoriel concentrique ─────────────────────────────────────────────

const RADII = [0, 230, 460, 680, 900, 1100]

function buildSectorLayout(
  rawNodes: GraphNode[],
  rawEdges: GraphEdge[],
  rootId: string,
  selectedId: string | null,
  onSelect: (id: string) => void,
  navigate: (id: string) => void,
): { flowNodes: Node[]; flowEdges: Edge[] } {
  // Adjacency list (bidirectionnel)
  const adj = new Map<string, string[]>()
  for (const n of rawNodes) adj.set(n.id, [])
  for (const e of rawEdges) {
    adj.get(e.source)?.push(e.target)
    adj.get(e.target)?.push(e.source)
  }

  const nodeMap = new Map<string, GraphNode>()
  for (const n of rawNodes) nodeMap.set(n.id, n)

  // BFS pour assigner positions + secteurs angulaires
  const positions = new Map<string, { x: number; y: number }>()
  const sectorMap = new Map<string, [number, number]>()
  const visited = new Set<string>()

  positions.set(rootId, { x: 0, y: 0 })
  sectorMap.set(rootId, [-Math.PI, Math.PI])  // 360° au départ
  visited.add(rootId)

  const queue: string[] = [rootId]

  while (queue.length > 0) {
    const current = queue.shift()!
    const [sStart, sEnd] = sectorMap.get(current) ?? [-Math.PI, Math.PI]
    const currentNode = nodeMap.get(current)!

    // Enfants non visités (niveau suivant)
    const children = (adj.get(current) ?? [])
      .filter(nid => !visited.has(nid))
      .map(nid => nodeMap.get(nid))
      .filter(Boolean) as GraphNode[]

    if (children.length === 0) continue

    const sRange = sEnd - sStart
    const sStep = sRange / children.length
    // Si secteur trop étroit, élargir légèrement pour la lisibilité
    const effectiveSStep = Math.max(sStep, (2 * Math.PI) / (rawNodes.length + 1))

    children.forEach((child, i) => {
      if (visited.has(child.id)) return
      visited.add(child.id)
      const r = RADII[child.level] ?? RADII[RADII.length - 1]
      // Angle central du secteur enfant
      const angle = sStart + sStep * (i + 0.5)
      positions.set(child.id, {
        x: Math.round(Math.cos(angle) * r),
        y: Math.round(Math.sin(angle) * r),
      })
      sectorMap.set(child.id, [
        sStart + sStep * i,
        sStart + sStep * (i + 1),
      ])
      queue.push(child.id)
    })
  }

  // Nœuds non positionnés (cas rare : graphe déconnecté)
  for (const n of rawNodes) {
    if (!positions.has(n.id)) {
      const r = RADII[n.level] ?? RADII[RADII.length - 1]
      const angle = Math.random() * 2 * Math.PI
      positions.set(n.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r })
    }
  }

  const flowNodes: Node[] = rawNodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 }
    const w = n.level === 0 ? 85 : 68
    return {
      id: n.id,
      type: 'ciNode',
      position: { x: pos.x - w, y: pos.y - 24 },
      data: {
        graphNode: n,
        isRoot: n.id === rootId,
        isSelected: n.id === selectedId,
        onSelect,
      } satisfies NodeData,
    }
  })

  const flowEdges: Edge[] = rawEdges.map((e) => {
    const color = RELATION_COLOR[e.relation_type] ?? '#94A3B8'
    const isActive = e.source === rootId || e.target === rootId
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: RELATION_LABEL[e.relation_type] ?? e.relation_type,
      labelStyle: { fontSize: 9, fill: '#64748B' },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
      labelBgPadding: [3, 5] as [number, number],
      labelBgBorderRadius: 4,
      animated: isActive,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color },
      style: { stroke: color, strokeWidth: isActive ? 2 : 1.5, opacity: 0.8 },
    }
  })

  return { flowNodes, flowEdges }
}

// ── Panneau de détail ─────────────────────────────────────────────────────────

const CRIT_LABEL: Record<string, string> = {
  critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Faible',
}
const STATUS_LABEL: Record<string, string> = {
  in_service: 'En service', maintenance: 'Maintenance',
  retired: 'Retiré', in_stock: 'En stock', ordered: 'Commandé',
}

function DetailPanel({
  node,
  onClose,
  onNavigate,
}: {
  node: GraphNode
  onClose: () => void
  onNavigate: (id: string) => void
}) {
  const Icon = node.ci_type === 'hardware' ? Server : Package
  return (
    <div className="absolute top-3 right-3 z-10 w-56 rounded-xl border bg-card shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-muted/40">
        <div className="flex items-center gap-2">
          <Icon size={13} className="text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground truncate max-w-[130px]">{node.name}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={13} />
        </button>
      </div>
      <div className="px-3 py-2 space-y-1.5 text-xs">
        <Row label="Type"      value={node.ci_type === 'hardware' ? 'Matériel' : 'Logiciel'} />
        <Row label="Statut"    value={STATUS_LABEL[node.status] ?? node.status} />
        <Row label="Criticité" value={CRIT_LABEL[node.criticality] ?? node.criticality} />
        {node.team     && <Row label="Équipe"      value={node.team} />}
        {node.location && <Row label="Emplacement" value={node.location} />}
        <Row label="Niveau" value={`Niveau ${node.level}`} />
      </div>
      <div className="px-3 pb-2.5">
        <button
          onClick={() => onNavigate(node.id)}
          className="w-full flex items-center justify-center gap-1.5 rounded-md bg-brand text-brand-foreground text-xs py-1.5 hover:opacity-90 transition-opacity font-medium"
        >
          <ExternalLink size={11} />
          Ouvrir la fiche
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground font-medium truncate text-right">{value}</span>
    </div>
  )
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function DepthBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 text-xs font-medium rounded transition-colors',
        active ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )
}

// ── Composant interne (accès au contexte ReactFlow) ───────────────────────────

interface InnerProps {
  data: CIGraphData
  rootId: string
  depth: 1 | 2 | 3 | 4 | 5
  onDepthChange: (d: 1 | 2 | 3 | 4 | 5) => void
  fullscreen: boolean
  onFullscreenToggle: () => void
}

function GraphInner({ data, rootId, depth, onDepthChange, fullscreen, onFullscreenToggle }: InnerProps) {
  const navigate = useNavigate()
  const { fitView } = useReactFlow()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50)
  }, [depth, fitView])
  const selectedNode = selectedId ? data.nodes.find(n => n.id === selectedId) ?? null : null

  const goTo = useCallback((id: string) => navigate(`/ci/${id}`), [navigate])

  const { flowNodes, flowEdges } = useMemo(
    () => buildSectorLayout(data.nodes, data.edges, rootId, selectedId, setSelectedId, goTo),
    [data, rootId, selectedId, goTo],
  )

  const [nodes, , onNodesChange] = useNodesState(flowNodes)
  const [edges, , onEdgesChange] = useEdgesState(flowEdges)

  const nodeCount = data.nodes.length
  const edgeCount = data.edges.length

  if (data.nodes.length <= 1) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed gap-3 text-center">
        <Server size={28} className="text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">Aucune relation enregistrée.</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Ajoutez des relations dans l'onglet Relations.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'relative rounded-xl border bg-card overflow-hidden',
      fullscreen ? 'fixed inset-0 z-50 rounded-none border-0' : 'h-[560px]',
    )}>
      {/* Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-3 py-2 bg-card/90 backdrop-blur-sm border-b">
        <div className="flex items-center gap-0.5 rounded-md border p-0.5">
          {([1, 2, 3, 4, 5] as const).map((d) => (
            <DepthBtn key={d} active={depth === d} onClick={() => onDepthChange(d)} label={`${d} niv.`} />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {nodeCount} nœud{nodeCount > 1 ? 's' : ''} · {edgeCount} lien{edgeCount > 1 ? 's' : ''}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => fitView({ padding: 0.2, duration: 400 })}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            Recadrer
          </button>
          <button
            onClick={onFullscreenToggle}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Panneau de détail */}
      {selectedNode && (
        <DetailPanel
          node={selectedNode}
          onClose={() => setSelectedId(null)}
          onNavigate={goTo}
        />
      )}

      <div className="h-full pt-10">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onPaneClick={() => setSelectedId(null)}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1} color="hsl(var(--border))" />
          <Controls showInteractive={false} style={{ bottom: 40 }} />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as NodeData
              return d.graphNode?.ci_type === 'hardware' ? '#a78bfa' : '#60a5fa'
            }}
            maskColor="hsl(var(--background) / 0.6)"
            style={{ borderRadius: 8, bottom: 44 }}
          />
        </ReactFlow>
      </div>

      {/* Légende */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground pointer-events-none">
        {[
          { color: 'border-red-500',    bg: 'bg-red-500',    label: 'Critique' },
          { color: 'border-orange-400', bg: 'bg-orange-400', label: 'Haute' },
          { color: 'border-blue-400',   bg: 'bg-blue-400',   label: 'Moyenne' },
          { color: 'border-slate-300',  bg: 'bg-slate-300',  label: 'Faible' },
        ].map(({ bg, label }) => (
          <span key={label} className="flex items-center gap-1 rounded bg-card/80 px-1.5 py-0.5 backdrop-blur-sm border border-border/40">
            <span className={cn('h-2 w-2 rounded-sm', bg)} />
            {label}
          </span>
        ))}
        {Object.entries(RELATION_LABEL).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1 rounded bg-card/80 px-1.5 py-0.5 backdrop-blur-sm border border-border/40">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: RELATION_COLOR[k] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Composant principal (wrappé dans le provider) ─────────────────────────────

export interface CIGraphProps {
  data: CIGraphData
  rootId: string
  depth: 1 | 2 | 3 | 4 | 5
  onDepthChange: (d: 1 | 2 | 3 | 4 | 5) => void
}

export default function CIGraph({ data, rootId, depth, onDepthChange }: CIGraphProps) {
  const [fullscreen, setFullscreen] = useState(false)

  return (
    <ReactFlowProvider>
      <GraphInner
        data={data}
        rootId={rootId}
        depth={depth}
        onDepthChange={onDepthChange}
        fullscreen={fullscreen}
        onFullscreenToggle={() => setFullscreen((f) => !f)}
      />
    </ReactFlowProvider>
  )
}
