import { client } from './client'

export interface BrandingSettings {
  app_name:         string
  primary_color:    string   // "#RRGGBB"
  sidebar_color:    string   // "#RRGGBB"
  login_bg_enabled: boolean
  has_logo:         boolean
  updated_at:       string | null
}

export const getBranding    = ()                                        => client.get<BrandingSettings>('/branding').then(r => r.data)
export const updateBranding = (data: Partial<Pick<BrandingSettings, 'app_name' | 'primary_color' | 'sidebar_color' | 'login_bg_enabled'>>) =>
  client.patch<BrandingSettings>('/branding', data).then(r => r.data)
export const deleteLogo     = ()                                        => client.delete<BrandingSettings>('/branding/logo').then(r => r.data)

export async function uploadLogo(file: File): Promise<BrandingSettings> {
  const form = new FormData()
  form.append('file', file)
  return client.post<BrandingSettings>('/branding/logo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

/** URL du logo (avec cache-buster). */
export const logoUrl = (bust?: string) => `/api/branding/logo${bust ? `?v=${bust}` : ''}`
