import { client } from './client'

export interface M365Config {
  configured: boolean
  enabled:    boolean
  config: {
    tenant_id:     string
    client_id:     string
    client_secret: string
    calendar_user: string
  } | null
}

export interface M365ConfigIn {
  tenant_id:     string
  client_id:     string
  client_secret: string
  calendar_user: string
  enabled:       boolean
}

export interface M365TestResult {
  ok:           boolean
  display_name: string
  mail:         string
}

export interface M365MaintenanceStatus {
  id:            string
  title:         string
  kind:          string
  ci_name:       string
  next_due_date: string
  m365_event_id: string | null
  synced:        boolean
}

export interface M365SyncAllResult {
  ok:      boolean
  created: number
  updated: number
  errors:  number
}

export async function getM365Config(): Promise<M365Config> {
  const res = await client.get<M365Config>('/admin/m365')
  return res.data
}

export async function saveM365Config(data: M365ConfigIn): Promise<void> {
  await client.post('/admin/m365', data)
}

export async function deleteM365Config(): Promise<void> {
  await client.delete('/admin/m365')
}

export async function testM365(): Promise<M365TestResult> {
  const res = await client.post<M365TestResult>('/admin/m365/test')
  return res.data
}

export async function listM365Maintenances(): Promise<M365MaintenanceStatus[]> {
  const res = await client.get<M365MaintenanceStatus[]>('/admin/m365/maintenances')
  return res.data
}

export async function syncMaintenance(scheduleId: string): Promise<void> {
  await client.post(`/admin/m365/sync/${scheduleId}`)
}

export async function unsyncMaintenance(scheduleId: string): Promise<void> {
  await client.delete(`/admin/m365/sync/${scheduleId}`)
}

export async function syncAllMaintenances(): Promise<M365SyncAllResult> {
  const res = await client.post<M365SyncAllResult>('/admin/m365/sync-all')
  return res.data
}
