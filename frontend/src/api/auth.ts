import axios from 'axios'
import type { User, UserCreate, UserUpdate } from '@/types/api'
import { client } from './client'

export interface LoginResponse {
  access_token?: string
  token_type: string
  totp_required: boolean
  partial_token?: string
}

export async function getOidcConfig(): Promise<{ enabled: boolean }> {
  const res = await axios.get<{ enabled: boolean }>('/api/auth/oidc/config')
  return res.data
}

export async function getSamlStatus(): Promise<{ enabled: boolean }> {
  const res = await axios.get<{ enabled: boolean }>('/api/auth/saml/config')
  return res.data
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const params = new URLSearchParams({ username, password })
  const res = await axios.post<LoginResponse>('/api/auth/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return res.data
}

export async function verifyTotp(partial_token: string, code: string): Promise<{ access_token: string }> {
  const res = await axios.post<{ access_token: string }>('/api/auth/totp/verify', { partial_token, code })
  return res.data
}

export async function getMe(): Promise<User> {
  const res = await client.get<User>('/auth/me')
  return res.data
}

export async function listUsers(): Promise<User[]> {
  const res = await client.get<User[]>('/users/')
  return res.data
}

export async function createUser(data: UserCreate): Promise<User> {
  const res = await client.post<User>('/users/', data)
  return res.data
}

export async function updateUser(id: string, data: UserUpdate): Promise<User> {
  const res = await client.patch<User>(`/users/${id}`, data)
  return res.data
}

export async function deleteUser(id: string): Promise<void> {
  await client.delete(`/users/${id}`)
}

export async function resetUserPassword(id: string, new_password: string): Promise<void> {
  await client.post(`/users/${id}/reset-password`, { new_password })
}

export interface ProfileUpdate {
  full_name?: string
  notify_critical_alerts?: boolean
  personal_primary_color?: string | null
  personal_sidebar_color?: string | null
}

export async function updateMyProfile(data: ProfileUpdate): Promise<User> {
  const res = await client.patch<User>('/users/me', data)
  return res.data
}

export async function changeMyPassword(current_password: string, new_password: string): Promise<void> {
  await client.post('/users/me/password', { current_password, new_password })
}

export async function uploadAvatar(file: File): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  await client.post('/users/me/avatar', form)
}

export async function deleteAvatar(): Promise<void> {
  await client.delete('/users/me/avatar')
}

export function avatarUrl(userId: string, updatedAt: string | null): string {
  return `/api/users/${userId}/avatar?v=${updatedAt ?? '0'}`
}

export interface TotpSetup {
  secret: string
  uri: string
}

export async function setupTotp(): Promise<TotpSetup> {
  const res = await client.post<TotpSetup>('/users/me/totp/setup')
  return res.data
}

export async function enableTotp(code: string): Promise<void> {
  await client.post('/users/me/totp/enable', { code })
}

export async function disableTotp(code: string): Promise<void> {
  await client.delete('/users/me/totp/disable', { data: { code } })
}

export async function sendHeartbeat(): Promise<void> {
  await client.post('/users/me/heartbeat')
}
