import { client } from './client'

// ── Types rapports planifiés ───────────────────────────────────────────────────

export interface ReportJob {
  id: string
  name: string
  report_type: string
  report_type_label: string
  format: string
  schedule: string
  schedule_label: string
  recipients: string[]
  is_active: boolean
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export interface ReportJobCreate {
  name: string
  report_type: string
  format: 'csv' | 'pdf'
  schedule: 'manual' | 'daily' | 'weekly' | 'monthly'
  recipients: string[]
}

// ── CRUD rapports planifiés ────────────────────────────────────────────────────

export const listReportJobs  = ()                          => client.get<ReportJob[]>('/reports/jobs').then(r => r.data)
export const createReportJob = (data: ReportJobCreate)    => client.post<ReportJob>('/reports/jobs', data).then(r => r.data)
export const updateReportJob = (id: string, data: Partial<ReportJobCreate & { is_active: boolean }>) =>
  client.patch<ReportJob>(`/reports/jobs/${id}`, data).then(r => r.data)
export const deleteReportJob = (id: string)               => client.delete(`/reports/jobs/${id}`)
export const runReportJob    = (id: string)               => client.post<{ status: string; message: string }>(`/reports/jobs/${id}/run`).then(r => r.data)

async function _download(url: string, filename: string): Promise<void> {
  const res = await client.get(url, { responseType: 'blob' })
  const href = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  URL.revokeObjectURL(href)
}

export const downloadCSV = {
  inventory:  () => _download('/reports/csv/inventory', 'inventaire_ci.csv'),
  hardware:   () => _download('/reports/csv/hardware',  'inventaire_materiel.csv'),
  software:   () => _download('/reports/csv/software',  'inventaire_logiciels.csv'),
  cves:       () => _download('/reports/csv/cves',      'rapport_cves.csv'),
  deadlines:  () => _download('/reports/csv/deadlines', 'echeances.csv'),
  sla:        () => _download('/reports/csv/sla',       'contrats_sla.csv'),
  licenses:   () => _download('/reports/csv/licenses',  'licences.csv'),
  incidents:  () => _download('/reports/csv/incidents', 'incidents.csv'),
}

export const downloadPDF = {
  inventory:  () => _download('/reports/pdf/inventory',  'inventaire_cmdb.pdf'),
  cves:       () => _download('/reports/pdf/cves',       'rapport_cves.pdf'),
  executive:  () => _download('/reports/pdf/executive',  'rapport_executif_cmdb.pdf'),
}
