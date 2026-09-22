import { client } from './client'

export interface GLPIStatus {
  enabled: boolean
  glpi_url: string
  total_synced: number
  last_sync: SyncResult | null
}

export interface SyncResult {
  total_glpi: number
  created: number
  updated: number
  skipped: number
  errors: number
  duration_s: number
  synced_at: string
}

export async function getGLPIStatus(): Promise<GLPIStatus> {
  const res = await client.get<GLPIStatus>('/glpi/status')
  return res.data
}

export async function pingGLPI(): Promise<{ ok: boolean; glpi_url: string }> {
  const res = await client.post('/glpi/ping')
  return res.data
}

export async function syncGLPI(): Promise<SyncResult> {
  const res = await client.post<SyncResult>('/glpi/sync')
  return res.data
}
