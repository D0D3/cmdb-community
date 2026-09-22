import { client } from './client'
import type { NetworkSegment } from '@/types/api'

export interface SegmentIn {
  name: string
  type: string
  vlan_id?: number | null
  subnet?: string | null
  description?: string | null
  color?: string | null
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: string[]
}

export async function listSegments(): Promise<NetworkSegment[]> {
  const res = await client.get<NetworkSegment[]>('/network-segments')
  return res.data
}

export async function createSegment(data: SegmentIn): Promise<NetworkSegment> {
  const res = await client.post<NetworkSegment>('/network-segments', data)
  return res.data
}

export async function updateSegment(id: string, data: SegmentIn): Promise<NetworkSegment> {
  const res = await client.patch<NetworkSegment>(`/network-segments/${id}`, data)
  return res.data
}

export async function deleteSegment(id: string): Promise<void> {
  await client.delete(`/network-segments/${id}`)
}

export async function exportSegmentsCSV(): Promise<void> {
  const res = await client.get('/network-segments/export', { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'segments_reseau.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export async function importSegmentsCSV(file: File): Promise<ImportResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await client.post<ImportResult>('/network-segments/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function getCISegments(ciId: string): Promise<NetworkSegment[]> {
  const res = await client.get<NetworkSegment[]>(`/ci/${ciId}/network-segments`)
  return res.data
}

export async function assignSegment(ciId: string, segId: string): Promise<void> {
  await client.post(`/ci/${ciId}/network-segments/${segId}`)
}

export async function unassignSegment(ciId: string, segId: string): Promise<void> {
  await client.delete(`/ci/${ciId}/network-segments/${segId}`)
}
