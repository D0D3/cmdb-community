import type {
  ChangeList, ChangeRequest, ChangeRequestSummary, ChangeStats,
  ChangeComment, ChangeType, ChangeStatus, ChangePriority, ChangeRisk, CIImpact,
} from '@/types/api'
import { client } from './client'

export interface ChangeCIPayload {
  ci_id: string
  impact: CIImpact
}

export interface ChangeCreatePayload {
  title: string
  description?: string
  change_type: ChangeType
  priority: ChangePriority
  risk: ChangeRisk
  approver_id?: string
  planned_start?: string
  planned_end?: string
  rollback_plan?: string
  notes?: string
  ci_links: ChangeCIPayload[]
}

export interface ChangeUpdatePayload {
  title?: string
  description?: string
  change_type?: ChangeType
  priority?: ChangePriority
  risk?: ChangeRisk
  approver_id?: string
  planned_start?: string
  planned_end?: string
  actual_start?: string
  actual_end?: string
  rollback_plan?: string
  notes?: string
  ci_links?: ChangeCIPayload[]
}

export interface ChangeFilters {
  status?: string
  change_type?: string
  priority?: string
  skip?: number
  limit?: number
}

export async function listChanges(filters: ChangeFilters = {}): Promise<ChangeList> {
  const res = await client.get<ChangeList>('/changes/', { params: filters })
  return res.data
}

export async function getChangeStats(): Promise<ChangeStats> {
  const res = await client.get<ChangeStats>('/changes/stats')
  return res.data
}

export async function getChange(id: string): Promise<ChangeRequest> {
  const res = await client.get<ChangeRequest>(`/changes/${id}`)
  return res.data
}

export async function createChange(payload: ChangeCreatePayload): Promise<ChangeRequest> {
  const res = await client.post<ChangeRequest>('/changes/', payload)
  return res.data
}

export async function updateChange(id: string, payload: ChangeUpdatePayload): Promise<ChangeRequest> {
  const res = await client.patch<ChangeRequest>(`/changes/${id}`, payload)
  return res.data
}

export async function transitionStatus(
  id: string, status: ChangeStatus, comment?: string
): Promise<ChangeRequest> {
  const res = await client.patch<ChangeRequest>(`/changes/${id}/status`, { status, comment })
  return res.data
}

export async function deleteChange(id: string): Promise<void> {
  await client.delete(`/changes/${id}`)
}

export async function listComments(id: string): Promise<ChangeComment[]> {
  const res = await client.get<ChangeComment[]>(`/changes/${id}/comments`)
  return res.data
}

export async function addComment(id: string, content: string): Promise<ChangeComment> {
  const res = await client.post<ChangeComment>(`/changes/${id}/comments`, { content })
  return res.data
}
