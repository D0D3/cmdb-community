import type { HardwareStats, SoftwareStats, TrendPoint } from '@/types/api'
import { client } from './client'

// ── Types KPI ────────────────────────────────────────────────────────────────

export interface HealthDetail { label: string; value: number; penalty: number }
export interface HealthScore  { score: number; label: string; color: string; details: HealthDetail[] }
export interface RiskyCi      { id: string; name: string; ci_type: string; cve_critical: number; open_incidents: number; risk_score: number }
export interface AlertTrendPoint { date: string; total: number; critical: number }
export interface KpiSummary   { health: HealthScore; top_risky_cis: RiskyCi[]; alert_trend: AlertTrendPoint[] }

export async function getKpiSummary(): Promise<KpiSummary> {
  return client.get<KpiSummary>('/kpi/summary').then(r => r.data)
}

export async function getHardwareStats(): Promise<HardwareStats> {
  const res = await client.get<HardwareStats>('/ci/stats/hardware')
  return res.data
}

export async function getSoftwareStats(): Promise<SoftwareStats> {
  const res = await client.get<SoftwareStats>('/ci/stats/software')
  return res.data
}

export async function getCiTrend(): Promise<TrendPoint[]> {
  const res = await client.get<TrendPoint[]>('/ci/stats/trend')
  return res.data
}
