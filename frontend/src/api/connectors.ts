import { client } from './client'

export interface ConnectorOut {
  id: string
  name: string
  connector_type: string
  enabled: boolean
  config: Record<string, string> | null
  sync_interval_hours: number | null
  last_test_at: string | null
  last_test_ok: boolean | null
  last_test_message: string | null
  last_sync_at: string | null
  last_sync_result: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface SyncLogOut {
  id: string
  connector_id: string
  started_at: string
  finished_at: string | null
  status: 'ok' | 'error' | 'running'
  result: Record<string, unknown> | null
  error: string | null
  triggered_by: string
}

export interface ConnectorCreate {
  name: string
  connector_type: string
  enabled?: boolean
  config?: Record<string, string>
}

export interface ConnectorUpdate {
  name?: string
  enabled?: boolean
  config?: Record<string, string>
  sync_interval_hours?: number | null
}

export async function listConnectors(): Promise<ConnectorOut[]> {
  const res = await client.get<ConnectorOut[]>('/connectors/')
  return res.data
}

export async function createConnector(data: ConnectorCreate): Promise<ConnectorOut> {
  const res = await client.post<ConnectorOut>('/connectors/', data)
  return res.data
}

export async function updateConnector(id: string, data: ConnectorUpdate): Promise<ConnectorOut> {
  const res = await client.patch<ConnectorOut>(`/connectors/${id}`, data)
  return res.data
}

export async function deleteConnector(id: string): Promise<void> {
  await client.delete(`/connectors/${id}`)
}

export async function testConnector(id: string): Promise<{ ok: boolean; message: string }> {
  const res = await client.post(`/connectors/${id}/test`)
  return res.data
}

export async function syncConnector(id: string): Promise<Record<string, unknown>> {
  const res = await client.post(`/connectors/${id}/sync`)
  return res.data
}

export async function getConnectorHistory(id: string, limit = 10): Promise<SyncLogOut[]> {
  const res = await client.get<SyncLogOut[]>(`/connectors/${id}/history`, { params: { limit } })
  return res.data
}

export interface DirectoryUser {
  external_id:    string
  email:          string
  full_name:      string
  already_exists: boolean
}

export async function searchDirectory(connectorId: string, q: string): Promise<DirectoryUser[]> {
  const res = await client.get<DirectoryUser[]>(`/connectors/${connectorId}/directory/search`, { params: { q } })
  return res.data
}

export async function importFromDirectory(
  connectorId: string,
  external_ids: string[],
  role_slug: string,
): Promise<{ imported: number; updated: number; errors: number }> {
  const res = await client.post(`/connectors/${connectorId}/directory/import`, { external_ids, role_slug })
  return res.data
}
