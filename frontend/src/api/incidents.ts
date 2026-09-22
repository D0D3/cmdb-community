import type { Incident, IncidentList, IncidentStats, IncidentComment } from '@/types/api'
import { client } from './client'

export interface IncidentFilters {
  status?: string
  severity?: string
  search?: string
  skip?: number
  limit?: number
}

export async function getIncidentStats(): Promise<IncidentStats> {
  const res = await client.get<IncidentStats>('/incidents/stats')
  return res.data
}

export async function listIncidents(filters: IncidentFilters = {}): Promise<IncidentList> {
  const res = await client.get<IncidentList>('/incidents/', { params: filters })
  return res.data
}

export async function getIncident(id: string): Promise<Incident> {
  const res = await client.get<Incident>(`/incidents/${id}`)
  return res.data
}

export async function createIncident(data: {
  title: string
  description?: string
  severity: string
  assignee_id?: string
  ci_ids: string[]
}): Promise<Incident> {
  const res = await client.post<Incident>('/incidents/', data)
  return res.data
}

export async function updateIncident(id: string, data: {
  title?: string
  description?: string
  severity?: string
  assignee_id?: string
  ci_ids?: string[]
  external_ticket_url?: string
}): Promise<Incident> {
  const res = await client.patch<Incident>(`/incidents/${id}`, data)
  return res.data
}

export async function transitionIncidentStatus(id: string, status: string, comment?: string): Promise<Incident> {
  const res = await client.post<Incident>(`/incidents/${id}/status`, { status, comment })
  return res.data
}

export async function deleteIncident(id: string): Promise<void> {
  await client.delete(`/incidents/${id}`)
}

export async function addIncidentComment(id: string, body: string): Promise<IncidentComment> {
  const res = await client.post<IncidentComment>(`/incidents/${id}/comments`, { body })
  return res.data
}
