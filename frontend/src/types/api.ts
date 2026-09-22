export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface Role {
  id: string
  slug: string
  name: string
  is_builtin: boolean
  permissions: Record<string, boolean>
}

export interface User {
  id: string
  email: string
  full_name: string
  auth_source: string
  is_active: boolean
  is_locked: boolean
  last_login_at: string | null
  last_active_at: string | null
  notify_critical_alerts: boolean
  totp_enabled: boolean
  has_avatar: boolean
  updated_at: string | null
  personal_primary_color: string | null
  personal_sidebar_color: string | null
  roles: Role[]
}

export interface UserCreate {
  email: string
  full_name: string
  password: string
  role_slugs: string[]
}

export interface UserUpdate {
  full_name?: string
  is_active?: boolean
  is_locked?: boolean
  role_slugs?: string[]
}

export interface HardwareDetail {
  hw_subtype: 'server' | 'vm' | 'workstation' | 'terminal_server' | 'network_device' | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  purchase_date: string | null
  warranty_end_date: string | null
  supplier: string | null
  purchase_price: string | null
}

export interface SoftwareDetail {
  vendor: string | null
  product: string
  version: string | null
  cpe_name: string | null
  is_internal: boolean
  license_type: string | null
  license_end_date: string | null
  eol_date: string | null
  install_count: number | null
  max_seats: number | null
  osv_ecosystem: string | null
  osv_package: string | null
}

export type CIStatus = 'ordered' | 'in_stock' | 'in_service' | 'maintenance' | 'retired'
export type CICriticality = 'low' | 'medium' | 'high' | 'critical'
export type RelationType = 'hosted_on' | 'depends_on' | 'assigned_to' | 'connected_to'
export type MaintenanceKind = 'maintenance' | 'update' | 'patch' | 'audit'

export interface CI {
  id: string
  ci_type: 'hardware' | 'software'
  name: string
  description: string | null
  status: CIStatus
  criticality: CICriticality
  owner_id: string | null
  team: string | null
  location: string | null
  sla_id: string | null
  attributes: Record<string, unknown>
  created_at: string
  updated_at: string
  hardware_details: HardwareDetail | null
  software_details: SoftwareDetail | null
  cve_count: number
}

export interface CIList {
  total: number
  items: CI[]
}

export interface CIRelation {
  id: string
  source_ci_id: string
  source_ci_name: string
  target_ci_id: string
  target_ci_name: string
  relation_type: RelationType
  created_at: string
}

export interface MaintenanceSchedule {
  id: string
  ci_id: string
  title: string
  kind: MaintenanceKind
  rrule: string | null
  next_due_date: string
  remind_days: number[]
  assigned_to: string | null
  is_active: boolean
  created_at: string
  m365_event_id: string | null
}

export interface MaintenanceGlobalItem extends MaintenanceSchedule {
  ci_name: string
  ci_type: string
  assignee_name: string | null
}

// ── M2 : Alertes, Échéances, Webhooks ─────────────────────────────────────

export type AlertKind = 'cve_match' | 'warranty_expiry' | 'license_expiry' | 'eol' | 'sla_expiry' | 'maintenance_due' | 'app_update'
export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface Alert {
  id: string
  kind: AlertKind
  severity: AlertSeverity
  title: string
  body: string | null
  ci_id: string | null
  cve_id: string | null
  dedup_key: string
  resolved_at: string | null
  created_at: string
}

export interface AlertList {
  total: number
  items: Alert[]
}

export interface AlertStats {
  open: number
  critical: number
  warning: number
  info_count: number
}

export interface Deadline {
  ci_id: string | null
  ci_name: string
  ci_type: string | null
  deadline_type: string
  deadline_label: string
  deadline_date: string
  days_remaining: number
  severity: 'critical' | 'warning' | 'info'
}

export interface DeadlineList {
  total: number
  items: Deadline[]
}

export interface Webhook {
  id: string
  name: string
  url: string
  is_active: boolean
  event_filter: string
  created_at: string
  updated_at: string
}

export interface WebhookCreate {
  name: string
  url: string
  secret?: string
  event_filter?: string
}

export interface WebhookDelivery {
  id: string
  endpoint_id: string
  alert_id: string | null
  status_code: number | null
  success: boolean
  attempt: number
  delivered_at: string
}

// ── M4 : Stats dashboards ─────────────────────────────────────────────────────

export interface NameCount { name: string; count: number }

export interface HardwareStats {
  total: number
  by_status: Record<string, number>
  by_criticality: Record<string, number>
  top_manufacturers: NameCount[]
  warranty_expiring_90d: number
  warranty_expired: number
}

export interface SoftwareStats {
  total: number
  by_status: Record<string, number>
  by_criticality: Record<string, number>
  top_vendors: NameCount[]
  license_expiring_90d: number
  eol_within_90d: number
  is_internal_count: number
}

export interface TrendPoint {
  month: string    // "2026-01"
  hardware: number
  software: number
  total: number
}

// ── M3 : Vulnérabilités CVE ───────────────────────────────────────────────────

export type CveSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type CICveStatus = 'open' | 'acknowledged' | 'mitigated' | 'not_affected'

export interface Cve {
  id: string
  summary: string | null
  cvss_score: string | null
  cvss_severity: CveSeverity | null
  is_kev: boolean
  published_at: string | null
  source_url: string | null
  ingested_at: string
  affected_count: number
}

export interface CICveEntry {
  ci_id: string
  ci_name: string
  ci_type: string
  cve_id: string
  matched_at: string
  status: CICveStatus
}

export interface CveDetail extends Cve {
  affected_cis: CICveEntry[]
}

export interface CveList {
  total: number
  items: Cve[]
}

export interface CveStats {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  kev_count: number
  open_count: number
}

// ── Graph ─────────────────────────────────────────────────────────────────────

export interface GraphSegment {
  name: string
  color: string
}

export interface GraphNode {
  id: string
  name: string
  ci_type: 'hardware' | 'software'
  status: string
  criticality: string
  level: number
  team?: string | null
  location?: string | null
  segments: GraphSegment[]
}

export interface NetworkSegment {
  id: string
  name: string
  type: 'vlan' | 'dmz' | 'lan' | 'wan' | 'subnet' | 'other'
  vlan_id?: number | null
  subnet?: string | null
  description?: string | null
  color?: string | null
  resolved_color: string
  ci_count: number
}

// ── Monitoring ────────────────────────────────────────────────────────────────

export type MonitoringConnectorType = 'zabbix' | 'alertmanager' | 'grafana' | 'prtg' | 'snmp' | 'generic'
export type SnmpVersion = 'v1' | 'v2c' | 'v3'
export type MonitoringSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type AlertStatus = 'firing' | 'resolved'

export interface MonitoringConnector {
  id: string
  name: string
  connector_type: MonitoringConnectorType
  enabled: boolean
  description?: string | null
  ingest_key: string
  snmp_version: SnmpVersion
  snmp_port: number
  snmp_community?: string | null
  snmp_v3_user?: string | null
  snmp_v3_auth_proto?: string | null
  snmp_v3_priv_proto?: string | null
  auto_create_incident: boolean
  min_severity: MonitoringSeverity
  alert_count: number
  last_alert_at?: string | null
}

export interface MonitoringAlert {
  id: string
  connector_id: string
  connector_name: string
  source_id?: string | null
  title: string
  body?: string | null
  severity: MonitoringSeverity
  status: AlertStatus
  host_hint?: string | null
  ci_id?: string | null
  incident_id?: string | null
  received_at: string
  resolved_at?: string | null
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  relation_type: string
}

export interface CIGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface SLA {
  id: string
  name: string
  level: string | null
  contract_ref: string | null
  provider: string | null
  support_contact: string | null
  response_time: string | null
  contract_end_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── M12 : Gestion des changements ─────────────────────────────────────────────

export type ChangeType     = 'normal' | 'standard' | 'emergency'
export type ChangeStatus   = 'draft' | 'pending_approval' | 'approved' | 'in_progress' | 'completed' | 'rejected' | 'cancelled'
export type ChangePriority = 'low' | 'medium' | 'high' | 'critical'
export type ChangeRisk     = 'low' | 'medium' | 'high'
export type CIImpact       = 'info' | 'affected' | 'critical'

export interface ChangeCILink {
  ci_id: string
  impact: CIImpact
  ci_name: string | null
  ci_type: string | null
  ci_status: string | null
}

export interface ChangeComment {
  id: string
  change_id: string
  author_id: string | null
  author_name: string | null
  content: string
  created_at: string
}

export interface ChangeRequest {
  id: string
  title: string
  description: string | null
  change_type: ChangeType
  status: ChangeStatus
  priority: ChangePriority
  risk: ChangeRisk
  requester_id: string | null
  requester_name: string | null
  approver_id: string | null
  approver_name: string | null
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  rollback_plan: string | null
  notes: string | null
  ci_links: ChangeCILink[]
  created_at: string
  updated_at: string
}

export interface ChangeRequestSummary {
  id: string
  title: string
  change_type: ChangeType
  status: ChangeStatus
  priority: ChangePriority
  risk: ChangeRisk
  requester_name: string | null
  approver_name: string | null
  planned_start: string | null
  planned_end: string | null
  ci_count: number
  created_at: string
  updated_at: string
}

export interface ChangeList {
  items: ChangeRequestSummary[]
  total: number
}

export interface ChangeStats {
  total: number
  draft: number
  pending_approval: number
  approved: number
  in_progress: number
  completed: number
  rejected: number
  cancelled: number
}

// ── M18 : Incidents ───────────────────────────────────────────────────────────

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'
export type IncidentStatus   = 'open' | 'investigating' | 'resolved' | 'closed'

export interface IncidentCILink {
  ci_id: string
  ci_name: string
  ci_type: string
}

export interface IncidentComment {
  id: string
  author_id: string | null
  author_name: string | null
  body: string
  created_at: string
}

export interface IncidentHistoryEntry {
  id: string
  author_id: string | null
  author_name: string | null
  from_status: IncidentStatus
  to_status: IncidentStatus
  comment: string | null
  created_at: string
}

export interface Incident {
  id: string
  title: string
  description: string | null
  severity: IncidentSeverity
  status: IncidentStatus
  reporter_id: string | null
  reporter_name: string | null
  assignee_id: string | null
  assignee_name: string | null
  resolved_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  external_ticket_url: string | null
  ci_links: IncidentCILink[]
  comments: IncidentComment[]
  history: IncidentHistoryEntry[]
}

export interface IncidentSummary {
  id: string
  title: string
  severity: IncidentSeverity
  status: IncidentStatus
  reporter_name: string | null
  assignee_name: string | null
  ci_count: number
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export interface IncidentList {
  items: IncidentSummary[]
  total: number
}

export interface IncidentStats {
  open: number
  investigating: number
  resolved: number
  closed: number
  critical: number
  high: number
  mttr_hours: number | null
}

export interface ApiToken {
  id: string
  name: string
  scopes: string[]
  expires_at: string | null
  last_used_at: string | null
  created_at: string
  created_by_name?: string | null
  token?: string
}

export interface NotificationRule {
  id: string
  event_type: string
  event_label: string
  event_description: string
  enabled: boolean
  recipient_emails: string[]
  updated_at: string
}
