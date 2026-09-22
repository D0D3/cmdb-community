import type { Cve, CveList, CveStats, CveDetail, CICveEntry, CICveStatus } from '@/types/api'
import { client } from './client'

export interface CveFilters {
  severity?: string
  is_kev?: boolean
  ci_id?: string
  search?: string
  skip?: number
  limit?: number
}

export async function getCveStats(): Promise<CveStats> {
  const res = await client.get<CveStats>('/cve/stats')
  return res.data
}

export async function listCves(filters: CveFilters = {}): Promise<CveList> {
  const res = await client.get<CveList>('/cve/', { params: filters })
  return res.data
}

export async function getCve(cveId: string): Promise<CveDetail> {
  const res = await client.get<CveDetail>(`/cve/${cveId}`)
  return res.data
}

export async function updateCICveStatus(
  cveId: string,
  ciId: string,
  status: CICveStatus,
): Promise<CICveEntry> {
  const res = await client.patch<CICveEntry>(`/cve/${cveId}/ci/${ciId}`, { status })
  return res.data
}

export async function triggerIngest(): Promise<void> {
  await client.post('/cve/ingest')
}

export interface CveSources {
  nvd: {
    name: string
    provider: string
    url: string
    api_url: string
    has_api_key: boolean
    rate_limit: string
    total_cves: number
  }
  cisa_kev: {
    name: string
    provider: string
    url: string
    feed_url: string
    total_kev: number
  }
  osv: {
    name: string
    provider: string
    url: string
    api_url: string
    note: string
  }
  last_sync: IngestStatus
}

export interface IngestStatus {
  running: boolean
  started_at: string | null
  finished_at: string | null
  matched_cves: number | null
  new_links: number | null
}

export async function getIngestStatus(): Promise<IngestStatus> {
  const res = await client.get<IngestStatus>('/cve/ingest/status')
  return res.data
}

export async function getCveSources(): Promise<CveSources> {
  const res = await client.get<CveSources>('/cve/sources')
  return res.data
}
