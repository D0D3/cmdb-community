import { client } from './client'

export interface SamlConfigOut {
  configured: boolean
  enabled: boolean
  sp_entity_id: string
  sp_acs_url: string
  config: {
    idp_entity_id: string
    idp_sso_url: string
    idp_cert: string
    attr_email: string
    attr_name: string
    attr_groups: string
    sp_entity_id?: string
    sp_cert?: string
    sp_key?: string
  } | null
}

export interface SamlConfigIn {
  idp_entity_id: string
  idp_sso_url:   string
  idp_cert:      string
  attr_email:    string
  attr_name:     string
  attr_groups:   string
  sp_entity_id?: string
  sp_cert?:      string
  sp_key?:       string
  enabled:       boolean
}

export async function getSamlConfig(): Promise<SamlConfigOut> {
  const res = await client.get<SamlConfigOut>('/admin/saml')
  return res.data
}

export async function saveSamlConfig(data: SamlConfigIn): Promise<void> {
  await client.post('/admin/saml', data)
}

export async function deleteSamlConfig(): Promise<void> {
  await client.delete('/admin/saml')
}

export async function getSamlMetadataXml(): Promise<string> {
  const res = await client.get<string>('/admin/saml/metadata', {
    responseType: 'text',
  })
  return res.data
}

// ── Group mappings ────────────────────────────────────────────────────────────

export interface GroupMapping {
  id:         string
  source:     'saml' | 'oidc' | 'ldap'
  group_name: string
  role_id:    string
  role_name:  string
  role_slug:  string
}

export interface GroupMappingIn {
  source:     string
  group_name: string
  role_id:    string
}

export interface OidcStatus {
  enabled:    boolean
  issuer:     string | null
  client_id:  string | null
  provider:   string | null
}

export async function listGroupMappings(): Promise<GroupMapping[]> {
  const res = await client.get<GroupMapping[]>('/admin/saml/group-mappings')
  return res.data
}

export async function createGroupMapping(data: GroupMappingIn): Promise<GroupMapping> {
  const res = await client.post<GroupMapping>('/admin/saml/group-mappings', data)
  return res.data
}

export async function deleteGroupMapping(id: string): Promise<void> {
  await client.delete(`/admin/saml/group-mappings/${id}`)
}

export async function getOidcStatus(): Promise<OidcStatus> {
  const res = await client.get<OidcStatus>('/admin/saml/oidc-status')
  return res.data
}
