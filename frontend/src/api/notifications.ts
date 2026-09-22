import type { NotificationRule } from '@/types/api'
import { client } from './client'

export interface RuleUpdate {
  enabled?: boolean
  recipient_emails?: string[]
}

export async function listNotificationRules(): Promise<NotificationRule[]> {
  const res = await client.get<NotificationRule[]>('/notifications/rules')
  return res.data
}

export async function updateNotificationRule(id: string, data: RuleUpdate): Promise<NotificationRule> {
  const res = await client.patch<NotificationRule>(`/notifications/rules/${id}`, data)
  return res.data
}

export async function testNotification(event_type: string, recipient: string): Promise<void> {
  await client.post('/notifications/test', { event_type, recipient })
}
