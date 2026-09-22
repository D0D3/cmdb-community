import type { ApiToken } from '@/types/api'
import { client } from './client'

export interface TokenCreatePayload {
  name: string
  scopes: string[]
  expires_at?: string | null
}

export async function listMyTokens(): Promise<ApiToken[]> {
  const res = await client.get<ApiToken[]>('/tokens/')
  return res.data
}

export async function listAllTokens(): Promise<ApiToken[]> {
  const res = await client.get<ApiToken[]>('/tokens/admin/all')
  return res.data
}

export async function createToken(data: TokenCreatePayload): Promise<ApiToken> {
  const res = await client.post<ApiToken>('/tokens/', data)
  return res.data
}

export async function revokeToken(id: string): Promise<void> {
  await client.delete(`/tokens/${id}`)
}
