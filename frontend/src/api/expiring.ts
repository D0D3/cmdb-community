import { client } from './client'

export interface ExpiringItem {
  ci_id:          string
  ci_name:        string
  ci_type:        'hardware' | 'software'
  team:           string | null
  location:       string | null
  status:         string
  expiry_type:    'warranty' | 'leasing' | 'license' | 'eol'
  expiry_date:    string
  days_remaining: number
}

export interface ExpiringResult {
  items: ExpiringItem[]
  total: number
}

export interface ExpiringFilters {
  horizon?:          number
  ci_type?:          string
  team?:             string
  include_expired?:  boolean
}

export async function listExpiring(filters: ExpiringFilters = {}): Promise<ExpiringResult> {
  const res = await client.get<ExpiringResult>('/ci/expiring', { params: filters })
  return res.data
}

export function expiringCsvUrl(filters: ExpiringFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.horizon         != null) params.set('horizon',          String(filters.horizon))
  if (filters.ci_type)                 params.set('ci_type',          filters.ci_type)
  if (filters.team)                    params.set('team',             filters.team)
  if (filters.include_expired != null) params.set('include_expired',  String(filters.include_expired))
  const token = localStorage.getItem('access_token') ?? ''
  return `/api/ci/expiring/csv?${params}&_token=${token}`
}
