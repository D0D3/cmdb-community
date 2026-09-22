import type { CI, CIList, CIRelation, MaintenanceSchedule, SLA, CIGraph } from '@/types/api'
import { client } from './client'

export interface ImportPreviewRow {
  [key: string]: string
}
export interface ImportResult {
  total:   number
  created: number
  updated: number
  errors:  { row: number; message: string }[]
}

export async function previewImportCSV(file: File): Promise<{ rows: ImportPreviewRow[]; total: number }> {
  const form = new FormData()
  form.append('file', file)
  const res = await client.post<{ rows: ImportPreviewRow[]; total: number }>('/ci/import/preview', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function importCSV(file: File): Promise<ImportResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await client.post<ImportResult>('/ci/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export function downloadTemplate(): void {
  window.open('/api/ci/import/template', '_blank')
}

export async function exportCIs(filters: CIFilters = {}): Promise<void> {
  const params = new URLSearchParams()
  if (filters.ci_type)     params.set('ci_type', filters.ci_type)
  if (filters.status)      params.set('status', filters.status)
  if (filters.criticality) params.set('criticality', filters.criticality)
  if (filters.hw_subtype)  params.set('hw_subtype', filters.hw_subtype)
  if (filters.search)      params.set('search', filters.search)
  const res = await client.get(`/ci/export?${params}`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'export_ci.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export interface CIFilters {
  ci_type?: string
  hw_subtype?: string
  status?: string
  criticality?: string
  search?: string
  has_cves?: boolean
  has_key_users?: boolean
  skip?: number
  limit?: number
}

export async function listCIs(filters: CIFilters = {}): Promise<CIList> {
  const res = await client.get<CIList>('/ci/', { params: filters })
  return res.data
}

export async function getCI(id: string): Promise<CI> {
  const res = await client.get<CI>(`/ci/${id}`)
  return res.data
}

export async function deleteCI(id: string): Promise<void> {
  await client.delete(`/ci/${id}`)
}

export async function bulkDeleteCIs(ids: string[]): Promise<{ deleted: number }> {
  const res = await client.post<{ deleted: number }>('/ci/bulk/delete', { ids })
  return res.data
}

export async function bulkMoveTeam(ids: string[], team: string | null): Promise<{ updated: number }> {
  const res = await client.post<{ updated: number }>('/ci/bulk/move-team', { ids, team })
  return res.data
}

export async function bulkExportCIs(ids: string[]): Promise<void> {
  const res = await client.post('/ci/bulk/export', { ids }, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'export_selection.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function listRelations(ciId: string): Promise<CIRelation[]> {
  const res = await client.get<CIRelation[]>(`/ci/${ciId}/relations`)
  return res.data
}

export async function addRelation(
  ciId: string,
  data: { target_ci_id: string; relation_type: string },
): Promise<CIRelation> {
  const res = await client.post<CIRelation>(`/ci/${ciId}/relations`, data)
  return res.data
}

export async function deleteRelation(ciId: string, relationId: string): Promise<void> {
  await client.delete(`/ci/${ciId}/relations/${relationId}`)
}

export async function listMaintenance(ciId: string): Promise<MaintenanceSchedule[]> {
  const res = await client.get<MaintenanceSchedule[]>(`/ci/${ciId}/maintenance`)
  return res.data
}

export async function deleteMaintenance(ciId: string, scheduleId: string): Promise<void> {
  await client.delete(`/ci/${ciId}/maintenance/${scheduleId}`)
}

export async function updateMaintenance(ciId: string, scheduleId: string, data: Partial<MaintenanceSchedule>): Promise<MaintenanceSchedule> {
  const res = await client.patch<MaintenanceSchedule>(`/ci/${ciId}/maintenance/${scheduleId}`, data)
  return res.data
}

export async function listGlobalMaintenance(params?: {
  from_date?: string
  to_date?: string
  kind?: string
}): Promise<import('@/types/api').MaintenanceGlobalItem[]> {
  const res = await client.get('/maintenance/', { params })
  return res.data
}

export async function createMaintenance(ciId: string, data: {
  title: string
  kind: string
  next_due_date: string
  rrule?: string
  remind_days?: number[]
  assigned_to?: string | null
}): Promise<MaintenanceSchedule> {
  const res = await client.post<MaintenanceSchedule>(`/ci/${ciId}/maintenance`, data)
  return res.data
}

export async function logMaintenance(ciId: string, scheduleId: string, notes?: string): Promise<void> {
  await client.post(`/ci/${ciId}/maintenance/${scheduleId}/log`, { notes })
}

export async function importMaintenanceCSV(file: File): Promise<{
  created: number
  errors: { row: number; ci_name: string; message: string }[]
}> {
  const form = new FormData()
  form.append('file', file)
  const res = await client.post('/maintenance/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function createCI(data: unknown): Promise<CI> {
  const res = await client.post<CI>('/ci/', data)
  return res.data
}

export async function updateCI(id: string, data: unknown): Promise<CI> {
  const res = await client.patch<CI>(`/ci/${id}`, data)
  return res.data
}

export async function getCIGraph(id: string, depth = 3): Promise<CIGraph> {
  const res = await client.get<CIGraph>(`/ci/${id}/graph`, { params: { depth } })
  return res.data
}

export async function listSLAs(): Promise<SLA[]> {
  const res = await client.get<SLA[]>('/sla/')
  return res.data
}

export async function createSLA(data: Omit<SLA, 'id' | 'created_at' | 'updated_at'>): Promise<SLA> {
  const res = await client.post<SLA>('/sla/', data)
  return res.data
}

export async function updateSLA(id: string, data: Partial<Omit<SLA, 'id' | 'created_at' | 'updated_at'>>): Promise<SLA> {
  const res = await client.patch<SLA>(`/sla/${id}`, data)
  return res.data
}

export async function deleteSLA(id: string): Promise<void> {
  await client.delete(`/sla/${id}`)
}

export interface SLAContract {
  id: string
  name: string
  provider: string | null
  level: string | null
  contract_ref: string | null
  support_contact: string | null
  response_time: string | null
  contract_end_date: string | null
  notes: string | null
  ci_count: number
  days_until_expiry: number | null
  expiry_status: 'ok' | 'warning' | 'critical' | 'expired' | 'no_date'
}

export interface SLADashboard {
  total: number
  active: number
  expiring_30d: number
  expiring_90d: number
  expired: number
  cis_without_sla: number
  contracts: SLAContract[]
}

export async function getSLADashboard(): Promise<SLADashboard> {
  const res = await client.get<SLADashboard>('/sla/dashboard')
  return res.data
}

// ── Licences ──────────────────────────────────────────────────────────────────

export interface LicenseItem {
  ci_id: string
  ci_name: string
  vendor: string | null
  product: string
  version: string | null
  license_type: string | null
  license_end_date: string | null
  days_until_expiry: number | null
  expiry_status: 'ok' | 'warning' | 'critical' | 'expired' | 'no_date'
  install_count: number | null
  max_seats: number | null
  utilization_pct: number | null
  seat_status: 'ok' | 'warning' | 'over' | 'unknown'
}

export interface LicenseDashboard {
  total_software: number
  licensed: number
  internal: number
  expiring_30d: number
  expiring_90d: number
  expired: number
  over_limit: number
  licenses: LicenseItem[]
}

export async function getLicenseDashboard(): Promise<LicenseDashboard> {
  const res = await client.get<LicenseDashboard>('/ci/licenses/dashboard')
  return res.data
}

// ── Parc Virtuel ──────────────────────────────────────────────────────────────

export interface VirtualStats {
  total_vms: number
  active_vms: number
  physical_hosts: number
  vms_without_host: number
  vms_with_cves: number
}

export interface VirtualVM {
  id: string
  name: string
  status: string
  criticality: string
  team: string | null
  location: string | null
  cve_count: number
  host_id: string | null
  host_name: string | null
}

export async function getVirtualStats(): Promise<VirtualStats> {
  const res = await client.get<VirtualStats>('/ci/virtual/stats')
  return res.data
}

export async function listVirtualVMs(params?: {
  status?: string
  criticality?: string
  search?: string
}): Promise<VirtualVM[]> {
  const res = await client.get<VirtualVM[]>('/ci/virtual/', { params })
  return res.data
}

export interface CPESuggestion {
  cpe_name: string
  title: string
  source: 'nvd' | 'heuristic'
}

export async function suggestCPE(
  vendor?: string,
  product?: string,
  version?: string,
): Promise<CPESuggestion[]> {
  const params: Record<string, string> = {}
  if (vendor)  params.vendor  = vendor
  if (product) params.product = product
  if (version) params.version = version
  const res = await client.get<CPESuggestion[]>('/ci/cpe-suggest', { params })
  return res.data
}
