import { client } from './client'

export interface BackupJob {
  id: string
  name: string
  schedule: 'manual' | 'daily' | 'weekly' | 'monthly'
  schedule_hour: number | null
  schedule_minute: number | null
  schedule_weekday: number | null
  schedule_monthday: number | null
  retention_count: number
  include_uploads: boolean
  is_active: boolean
  last_run_at: string | null
  created_at: string
  run_count: number
  remote_enabled: boolean
  remote_type: 'sftp' | 'smb' | null
  remote_host: string | null
  remote_port: number | null
  remote_user: string | null
  remote_has_password: boolean
  remote_path: string | null
  remote_has_ssh_key: boolean
  remote_smb_share: string | null
}

export interface BackupRun {
  id: string
  job_id: string
  job_name: string
  status: 'running' | 'success' | 'error'
  filename: string | null
  size_bytes: number | null
  error_msg: string | null
  started_at: string
  finished_at: string | null
}

export interface RestoreLog {
  id: string
  source_type: 'local' | 'upload' | 'sftp' | 'smb'
  source_ref: string | null
  run_id: string | null
  status: 'success' | 'error'
  error_msg: string | null
  started_at: string
  finished_at: string | null
}

export interface JobIn {
  name: string
  schedule: string
  schedule_hour: number | null
  schedule_minute: number | null
  schedule_weekday: number | null
  schedule_monthday: number | null
  retention_count: number
  include_uploads: boolean
  is_active: boolean
  remote_enabled: boolean
  remote_type: string | null
  remote_host: string | null
  remote_port: number | null
  remote_user: string | null
  remote_password: string | null
  remote_path: string | null
  remote_ssh_key: string | null
  remote_smb_share: string | null
}

const BASE = '/admin/backup'

export const backupApi = {
  listJobs:    ()                         => client.get<BackupJob[]>(`${BASE}/jobs`).then(r => r.data),
  createJob:   (data: JobIn)              => client.post<BackupJob>(`${BASE}/jobs`, data).then(r => r.data),
  updateJob:   (id: string, data: JobIn)  => client.patch<BackupJob>(`${BASE}/jobs/${id}`, data).then(r => r.data),
  deleteJob:   (id: string)               => client.delete(`${BASE}/jobs/${id}`).then(r => r.data),
  runJob:      (id: string)               => client.post<BackupRun>(`${BASE}/jobs/${id}/run`, {}).then(r => r.data),
  testRemote:  (id: string)               => client.post<{ ok: boolean; message: string }>(`${BASE}/jobs/${id}/test-remote`, {}).then(r => r.data),

  listRestoreLogs: () => client.get<RestoreLog[]>(`${BASE}/restore-logs`).then(r => r.data),

  listRuns:   (jobId?: string) => client.get<BackupRun[]>(`${BASE}/runs${jobId ? `?job_id=${jobId}` : ''}`).then(r => r.data),
  deleteRun:  (id: string)    => client.delete(`${BASE}/runs/${id}`).then(r => r.data),
  cancelRun:  (id: string)    => client.post<{ ok: boolean; already_done?: boolean; status?: string }>(`${BASE}/runs/${id}/cancel`, {}).then(r => r.data),
  restoreRun: (id: string)    => client.post<{ ok: boolean; message: string }>(`${BASE}/runs/${id}/restore`, {}).then(r => r.data),

  downloadRun: async (run: BackupRun) => {
    const res = await client.get(`${BASE}/runs/${run.id}/download`, { responseType: 'blob' })
    const url  = URL.createObjectURL(new Blob([res.data], { type: 'application/gzip' }))
    const a    = document.createElement('a')
    a.href     = url
    a.download = run.filename ?? `cmdb_backup_${run.id}.tar.gz`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
}
