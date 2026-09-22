import { useState } from 'react'
import {
  FileDown, FileText, Server, Package, ShieldAlert, Clock,
  Loader2, FileBarChart, Siren, FileCheck2, KeySquare, Star,
} from 'lucide-react'
import { downloadCSV, downloadPDF } from '@/api/reports'
import { cn } from '@/lib/utils'

interface ExportButton {
  label:       string
  description: string
  format:      'CSV' | 'PDF'
  action:      () => Promise<void>
  highlight?:  boolean
}

function ExportCard({ title, icon: Icon, buttons, color = 'brand' }: {
  title:    string
  icon:     React.ElementType
  buttons:  ExportButton[]
  color?:   string
}) {
  const [loading, setLoading] = useState<string | null>(null)

  async function handle(btn: ExportButton) {
    setLoading(btn.label)
    try { await btn.action() } finally { setLoading(null) }
  }

  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10">
          <Icon size={16} className="text-brand" />
        </div>
        <h2 className="font-semibold text-foreground">{title}</h2>
      </div>

      <div className="space-y-2">
        {buttons.map((btn) => (
          <button
            key={btn.label}
            onClick={() => handle(btn)}
            disabled={!!loading}
            className={cn(
              'w-full flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors text-left',
              btn.highlight
                ? 'border-brand/30 bg-brand/5 hover:bg-brand/10'
                : 'hover:bg-muted/60',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            )}
          >
            <div className="min-w-0">
              <span className={cn(
                'font-medium',
                btn.highlight ? 'text-brand' : 'text-foreground',
              )}>
                {btn.label}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{btn.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                btn.format === 'PDF'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-green-100 text-green-700',
              )}>
                {btn.format}
              </span>
              {loading === btn.label
                ? <Loader2 size={14} className="animate-spin text-muted-foreground" />
                : <FileDown size={14} className="text-muted-foreground" />
              }
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

const SECTIONS: { title: string; icon: React.ElementType; buttons: ExportButton[] }[] = [
  {
    title: 'Rapport exécutif',
    icon: Star,
    buttons: [
      {
        label: 'Rapport exécutif complet',
        description: 'KPIs, contrats SLA, licences, incidents ouverts — synthèse direction',
        format: 'PDF',
        action: downloadPDF.executive,
        highlight: true,
      },
    ],
  },
  {
    title: 'Inventaire',
    icon: Server,
    buttons: [
      {
        label: 'Inventaire complet',
        description: 'Tous les CIs (matériel + logiciels) avec leurs attributs',
        format: 'CSV',
        action: downloadCSV.inventory,
      },
      {
        label: 'Matériel',
        description: 'Inventaire matériel — fabricant, modèle, garantie, OS',
        format: 'CSV',
        action: downloadCSV.hardware,
      },
      {
        label: 'Logiciels',
        description: 'Inventaire logiciels — éditeur, version, licence, EOL, CPE',
        format: 'CSV',
        action: downloadCSV.software,
      },
      {
        label: 'Rapport inventaire PDF',
        description: 'Rapport mis en page — inventaire complet',
        format: 'PDF',
        action: downloadPDF.inventory,
      },
    ],
  },
  {
    title: 'Sécurité',
    icon: ShieldAlert,
    buttons: [
      {
        label: 'CVEs par CI',
        description: 'Vulnérabilités — sévérité, score CVSS, KEV, statut',
        format: 'CSV',
        action: downloadCSV.cves,
      },
      {
        label: 'Rapport CVE PDF',
        description: 'Rapport avec statistiques et tableau des vulnérabilités',
        format: 'PDF',
        action: downloadPDF.cves,
      },
    ],
  },
  {
    title: 'Incidents',
    icon: Siren,
    buttons: [
      {
        label: 'Historique incidents',
        description: 'Tous les incidents — sévérité, statut, CIs liés, durée de résolution',
        format: 'CSV',
        action: downloadCSV.incidents,
      },
    ],
  },
  {
    title: 'Conformité SLA',
    icon: FileCheck2,
    buttons: [
      {
        label: 'Contrats SLA',
        description: 'Tous les contrats — prestataire, niveau, fin de contrat, CIs couverts',
        format: 'CSV',
        action: downloadCSV.sla,
      },
    ],
  },
  {
    title: 'Licences',
    icon: KeySquare,
    buttons: [
      {
        label: 'Licences logiciels',
        description: 'Toutes les licences — sièges, type, expiration, conformité',
        format: 'CSV',
        action: downloadCSV.licenses,
      },
    ],
  },
  {
    title: 'Planification',
    icon: Clock,
    buttons: [
      {
        label: 'Échéances',
        description: 'Fins de garantie, EOL et licences — triées par date',
        format: 'CSV',
        action: downloadCSV.deadlines,
      },
    ],
  },
]

export default function Reports() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Rapports & Exports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Téléchargez vos données CMDB en CSV (Excel) ou PDF pour vos audits et réunions.
        </p>
      </div>

      <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
        <FileText size={15} className="mt-0.5 shrink-0" />
        <span>
          Les fichiers CSV sont encodés en UTF-8 avec BOM pour une ouverture correcte dans Excel.
          Les rapports PDF sont générés en temps réel à la date de téléchargement.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <ExportCard key={s.title} title={s.title} icon={s.icon} buttons={s.buttons} />
        ))}
      </div>
    </div>
  )
}
