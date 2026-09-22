import { client } from './client'
import type { MonitoringConnector, MonitoringAlert } from '@/types/api'

export interface ConnectorIn {
  name: string
  connector_type: string
  enabled: boolean
  description?: string | null
  snmp_version: string
  snmp_port: number
  snmp_community?: string | null
  snmp_v3_user?: string | null
  snmp_v3_auth_proto?: string | null
  snmp_v3_auth_key?: string | null
  snmp_v3_priv_proto?: string | null
  snmp_v3_priv_key?: string | null
  auto_create_incident: boolean
  min_severity: string
}

export async function listMonitoringConnectors(): Promise<MonitoringConnector[]> {
  const res = await client.get<MonitoringConnector[]>('/admin/monitoring')
  return res.data
}

export async function createMonitoringConnector(data: ConnectorIn): Promise<MonitoringConnector> {
  const res = await client.post<MonitoringConnector>('/admin/monitoring', data)
  return res.data
}

export async function updateMonitoringConnector(id: string, data: ConnectorIn): Promise<MonitoringConnector> {
  const res = await client.patch<MonitoringConnector>(`/admin/monitoring/${id}`, data)
  return res.data
}

export async function toggleMonitoringConnector(id: string): Promise<{ enabled: boolean }> {
  const res = await client.patch<{ enabled: boolean }>(`/admin/monitoring/${id}/toggle`)
  return res.data
}

export async function deleteMonitoringConnector(id: string): Promise<void> {
  await client.delete(`/admin/monitoring/${id}`)
}

export async function listMonitoringAlerts(params?: {
  connector_id?: string
  status?: string
  limit?: number
}): Promise<MonitoringAlert[]> {
  const res = await client.get<MonitoringAlert[]>('/admin/monitoring/alerts', { params })
  return res.data
}
