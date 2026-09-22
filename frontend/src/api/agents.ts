import { client } from './client'

export interface AgentTokenOut {
  id: string
  name: string
  description: string | null
  revoked: boolean
  last_seen_at: string | null
  last_seen_hostname: string | null
  created_at: string
}

export interface AgentTokenCreated extends AgentTokenOut {
  raw_token: string
}

export interface AgentTokenCreate {
  name: string
  description?: string
}

export async function listAgentTokens(): Promise<AgentTokenOut[]> {
  const res = await client.get<AgentTokenOut[]>('/agent/tokens')
  return res.data
}

export async function createAgentToken(data: AgentTokenCreate): Promise<AgentTokenCreated> {
  const res = await client.post<AgentTokenCreated>('/agent/tokens', data)
  return res.data
}

export async function revokeAgentToken(id: string): Promise<void> {
  await client.delete(`/agent/tokens/${id}`)
}

export async function downloadInstaller(
  tokenId: string,
  rawToken: string,
  os: 'linux' | 'windows' | 'macos',
  hwSubtype: string,
): Promise<Blob> {
  const res = await client.post(
    `/agent/tokens/${tokenId}/installer`,
    null,
    { params: { os, hw_subtype: hwSubtype, raw_token: rawToken }, responseType: 'blob' },
  )
  return res.data as Blob
}

export async function downloadScript(): Promise<Blob> {
  const res = await client.get('/agent/download/script', { responseType: 'blob' })
  return res.data as Blob
}

export async function downloadNativeRaw(os: 'linux' | 'windows' | 'macos'): Promise<Blob> {
  const res = await client.get('/agent/download/native', { params: { os }, responseType: 'blob' })
  return res.data as Blob
}

export async function downloadNativeInstaller(
  tokenId: string,
  rawToken: string,
  os: 'linux' | 'windows' | 'macos',
  hwSubtype: string,
): Promise<Blob> {
  const res = await client.post(
    `/agent/tokens/${tokenId}/native-installer`,
    null,
    { params: { os, hw_subtype: hwSubtype, raw_token: rawToken }, responseType: 'blob' },
  )
  return res.data as Blob
}

export function agentVersionUrl(): string {
  return '/api/agent/version'
}
