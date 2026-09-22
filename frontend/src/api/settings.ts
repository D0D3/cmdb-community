import { client } from './client'
import type { AxiosResponse } from 'axios'

// ── App Settings ──────────────────────────────────────────────────────────────

export interface AppSettings {
  timezone:      string
  date_format:   string
  number_format: string
  currency:      string
}

export const getSettings   = () => client.get<AppSettings>('/settings').then((r: AxiosResponse<AppSettings>) => r.data)
export const patchSettings = (data: Partial<AppSettings>) =>
  client.patch<AppSettings>('/settings', data).then((r: AxiosResponse<AppSettings>) => r.data)

// ── Reference Lists ───────────────────────────────────────────────────────────

export type RefCategory =
  | 'team' | 'vendor' | 'manufacturer' | 'product'
  | 'location' | 'acquisition_type' | 'leasing_provider'

export interface RefItem {
  id:         string
  category:   string
  value:      string
  sort_order: number
  active:     boolean
  created_at: string
}

export const listRefItems = (category?: string, active_only = true) =>
  client.get<RefItem[]>('/reflists', { params: { category, active_only } }).then((r: AxiosResponse<RefItem[]>) => r.data)

export const createRefItem = (data: { category: string; value: string; sort_order?: number }) =>
  client.post<RefItem>('/reflists', data).then((r: AxiosResponse<RefItem>) => r.data)

export const updateRefItem = (id: string, data: Partial<{ value: string; sort_order: number; active: boolean }>) =>
  client.patch<RefItem>(`/reflists/${id}`, data).then((r: AxiosResponse<RefItem>) => r.data)

export const deleteRefItem = (id: string) =>
  client.delete(`/reflists/${id}`)

// ── License Packs ─────────────────────────────────────────────────────────────

export interface LicensePack {
  id:             string
  name:           string
  license_key:    string | null
  total_seats:    number | null
  notes:          string | null
  created_at:     string
  updated_at:     string
  assigned_count: number
  assigned_seats: number
}

export const listPacks  = () => client.get<LicensePack[]>('/license-packs').then((r: AxiosResponse<LicensePack[]>) => r.data)
export const createPack = (data: Omit<LicensePack, 'id' | 'created_at' | 'updated_at' | 'assigned_count' | 'assigned_seats'>) =>
  client.post<LicensePack>('/license-packs', data).then((r: AxiosResponse<LicensePack>) => r.data)
export const updatePack = (id: string, data: Partial<LicensePack>) =>
  client.patch<LicensePack>(`/license-packs/${id}`, data).then((r: AxiosResponse<LicensePack>) => r.data)
export const deletePack = (id: string) => client.delete(`/license-packs/${id}`)
