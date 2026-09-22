import { client } from './client'

export interface CIKeyUserOut {
  id: string
  ci_id: string
  user_type: 'local' | 'entra' | 'ldap'
  source_id: string
  display_name: string
  email: string
  job_title: string | null
  department: string | null
  role: 'key_user' | 'owner' | 'referent' | 'local_admin'
  notes: string | null
  created_at: string
}

export interface UserSearchResult {
  source: 'local' | 'entra' | 'ldap'
  source_id: string
  display_name: string
  email: string
  job_title?: string | null
  department?: string | null
  ldap_uid?: string | null
}

export interface AddKeyUserPayload {
  user_type: 'local' | 'entra' | 'ldap'
  role?: CIKeyUserOut['role']
  notes?: string
  // local
  local_user_id?: string
  // entra
  entra_oid?: string
  entra_email?: string
  entra_display_name?: string
  entra_job_title?: string | null
  entra_department?: string | null
  // ldap
  ldap_dn?: string
  ldap_uid?: string | null
  ldap_email?: string
  ldap_display_name?: string
  ldap_job_title?: string | null
  ldap_department?: string | null
}

export async function listKeyUsers(ciId: string): Promise<CIKeyUserOut[]> {
  const res = await client.get<CIKeyUserOut[]>(`/ci/${ciId}/key-users`)
  return res.data
}

export async function addKeyUser(ciId: string, payload: AddKeyUserPayload): Promise<CIKeyUserOut> {
  const res = await client.post<CIKeyUserOut>(`/ci/${ciId}/key-users`, payload)
  return res.data
}

export async function patchKeyUser(
  ciId: string,
  kuId: string,
  data: { role?: CIKeyUserOut['role']; notes?: string },
): Promise<CIKeyUserOut> {
  const res = await client.patch<CIKeyUserOut>(`/ci/${ciId}/key-users/${kuId}`, data)
  return res.data
}

export async function removeKeyUser(ciId: string, kuId: string): Promise<void> {
  await client.delete(`/ci/${ciId}/key-users/${kuId}`)
}

export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  const res = await client.get<UserSearchResult[]>('/keyusers/search', { params: { q } })
  return res.data
}

export interface CIKeyUserGlobalOut {
  id: string
  ci_id: string
  ci_name: string
  ci_type: 'hardware' | 'software'
  ci_criticality: string
  user_type: 'local' | 'entra'
  source_id: string
  display_name: string
  email: string
  job_title: string | null
  department: string | null
  role: CIKeyUserOut['role']
  notes: string | null
  created_at: string
}

export interface KeyUsersPage {
  total: number
  items: CIKeyUserGlobalOut[]
}

export async function exportKeyUsers(): Promise<void> {
  const res = await client.get('/keyusers/export', { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'key_users.csv'
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

export interface KeyUsersImportResult {
  processed_cis: number
  skipped_cis: number
  created: number
}

export async function importKeyUsers(file: File): Promise<KeyUsersImportResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await client.post<KeyUsersImportResult>('/keyusers/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function syncKeyUsers(): Promise<{ updated: number; errors: number }> {
  const res = await client.post<{ updated: number; errors: number }>('/keyusers/sync')
  return res.data
}

export async function listAllKeyUsers(params?: {
  q?: string
  role?: string
  ci_type?: string
  skip?: number
  limit?: number
}): Promise<KeyUsersPage> {
  const res = await client.get<KeyUsersPage>('/keyusers', { params })
  return res.data
}
