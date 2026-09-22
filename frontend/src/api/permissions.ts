import { client } from './client'

export interface PermModule {
  key: string
  label: string
  actions: string[]
}

export interface RolePerms {
  slug: string
  name: string
  is_builtin: boolean
  is_admin: boolean
  permissions: Record<string, boolean>
}

export interface PermissionsMatrix {
  modules: PermModule[]
  roles: RolePerms[]
}

export async function getPermissions(): Promise<PermissionsMatrix> {
  const res = await client.get<PermissionsMatrix>('/admin/permissions')
  return res.data
}

export async function updateRolePermissions(
  roleSlug: string,
  permissions: Record<string, boolean>
): Promise<void> {
  await client.patch(`/admin/permissions/${roleSlug}`, { permissions })
}

export async function resetRolePermissions(roleSlug: string): Promise<void> {
  await client.post(`/admin/permissions/${roleSlug}/reset`)
}

export interface RoleCreate {
  name: string
  slug: string
}

export async function createRole(data: RoleCreate): Promise<RolePerms> {
  const res = await client.post<RolePerms>('/admin/permissions/roles', data)
  return res.data
}

export async function deleteRole(slug: string): Promise<void> {
  await client.delete(`/admin/permissions/roles/${slug}`)
}
