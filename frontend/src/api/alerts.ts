import type {
  AlertList, AlertStats, Alert, DeadlineList, Webhook, WebhookCreate, WebhookDelivery,
} from '@/types/api'
import { client } from './client'

// ── Alertes ───────────────────────────────────────────────────────────────────

export interface AlertFilters {
  open_only?: boolean
  kind?: string
  severity?: string
  ci_id?: string
  skip?: number
  limit?: number
}

export async function listAlerts(filters: AlertFilters = {}): Promise<AlertList> {
  const res = await client.get<AlertList>('/alerts/', { params: filters })
  return res.data
}

export async function getAlertStats(): Promise<AlertStats> {
  const res = await client.get<AlertStats>('/alerts/stats')
  return res.data
}

export async function getRecentAlerts(limit = 5): Promise<Alert[]> {
  const res = await client.get<Alert[]>('/alerts/recent', { params: { limit } })
  return res.data
}

export async function resolveAlert(id: string): Promise<Alert> {
  const res = await client.patch<Alert>(`/alerts/${id}/resolve`)
  return res.data
}

// ── Échéances ─────────────────────────────────────────────────────────────────

export interface DeadlineFilters {
  days_ahead?: number
  include_expired?: boolean
}

export async function listDeadlines(filters: DeadlineFilters = {}): Promise<DeadlineList> {
  const res = await client.get<DeadlineList>('/deadlines/', { params: filters })
  return res.data
}

export function deadlinesCsvUrl(filters: DeadlineFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.days_ahead !== undefined) params.set('days_ahead', String(filters.days_ahead))
  if (filters.include_expired !== undefined) params.set('include_expired', String(filters.include_expired))
  const token = localStorage.getItem('access_token') ?? ''
  return `/api/deadlines/csv?${params}&_token=${token}`
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export async function listWebhooks(): Promise<Webhook[]> {
  const res = await client.get<Webhook[]>('/webhooks/')
  return res.data
}

export async function createWebhook(data: WebhookCreate): Promise<Webhook> {
  const res = await client.post<Webhook>('/webhooks/', data)
  return res.data
}

export async function deleteWebhook(id: string): Promise<void> {
  await client.delete(`/webhooks/${id}`)
}

export async function testWebhook(id: string): Promise<{ success: boolean; status_code: number | null; response: string }> {
  const res = await client.post(`/webhooks/${id}/test`)
  return res.data
}

export async function listDeliveries(endpointId: string): Promise<WebhookDelivery[]> {
  const res = await client.get<WebhookDelivery[]>(`/webhooks/${endpointId}/deliveries`)
  return res.data
}
