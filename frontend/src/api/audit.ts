import { client } from './client'

export interface AuditLogEntry {
  id: string
  entity_type: string
  entity_id: string | null
  entity_name: string | null
  action: 'create' | 'update' | 'delete'
  changes: Record<string, { before: string | null; after: string }> | null
  performed_by_id: string | null
  performed_by_name: string | null
  created_at: string
}

export interface AuditLogList {
  items: AuditLogEntry[]
  total: number
}

export async function listCIAudit(
  ciId: string,
  params: { skip?: number; limit?: number } = {},
): Promise<AuditLogList> {
  const res = await client.get(`/audit/ci/${ciId}`, { params })
  return res.data
}

export async function listAudit(params: {
  entity_type?: string
  entity_id?: string
  action?: string
  skip?: number
  limit?: number
}): Promise<AuditLogList> {
  const res = await client.get('/audit/', { params })
  return res.data
}
