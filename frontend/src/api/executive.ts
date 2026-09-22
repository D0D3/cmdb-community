import { client } from './client'
import type { RiskyCi, AlertTrendPoint } from './stats'

export interface ExecutiveSummary {
  // Gouvernance
  governance_score:        number
  governance_label:        string
  governance_color:        string
  // Piliers
  health_score:            number
  quality_score:           number
  sla_coverage_pct:        number
  license_compliance_pct:  number
  // Inventaire
  total_ci:                number
  active_ci:               number
  // Opérations
  open_incidents:          number
  critical_incidents:      number
  mttr_hours:              number | null
  open_alerts:             number
  critical_alerts:         number
  critical_cves:           number
  // SLA
  sla_total:               number
  sla_expiring_30d:        number
  sla_expired:             number
  cis_without_sla:         number
  // Licences
  license_total:           number
  license_expiring_30d:    number
  license_expired:         number
  license_over_limit:      number
  // Listes
  top_risky_cis:           RiskyCi[]
  alert_trend:             AlertTrendPoint[]
  recommendations:         string[]
}

export async function getExecutiveSummary(): Promise<ExecutiveSummary> {
  return client.get<ExecutiveSummary>('/kpi/executive').then(r => r.data)
}
