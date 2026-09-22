import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { BrandingProvider } from '@/contexts/BrandingContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import CIList from '@/pages/ci/CIList'
import CINew from '@/pages/ci/CINew'
import CIEdit from '@/pages/ci/CIEdit'
import CIDetail from '@/pages/ci/CIDetail'
import Alerts from '@/pages/Alerts'
import Users from '@/pages/admin/Users'
import Webhooks from '@/pages/admin/Webhooks'
import GLPIAdmin from '@/pages/admin/GLPI'
import ConnectorsAdmin from '@/pages/admin/Connectors'
import AgentsAdmin from '@/pages/admin/Agents'
import AuditLogAdmin from '@/pages/admin/AuditLog'
import Reports from '@/pages/Reports'
import GraphExplorer from '@/pages/GraphExplorer'
import Vulnerabilities from '@/pages/Vulnerabilities'
import HardwareDashboard from '@/pages/HardwareDashboard'
import SoftwareDashboard from '@/pages/SoftwareDashboard'
import ChangeList from '@/pages/changes/ChangeList'
import ChangeDetail from '@/pages/changes/ChangeDetail'
import ChangeNew from '@/pages/changes/ChangeNew'
import ChangeEdit from '@/pages/changes/ChangeEdit'
import Profile from '@/pages/Profile'
import IncidentList from '@/pages/incidents/IncidentList'
import IncidentNew from '@/pages/incidents/IncidentNew'
import IncidentDetail from '@/pages/incidents/IncidentDetail'
import TokensAdmin from '@/pages/admin/Tokens'
import NotificationsAdmin from '@/pages/admin/NotificationsAdmin'
import Maintenance from '@/pages/Maintenance'
import ReportJobsAdmin from '@/pages/admin/ReportJobs'
import BrandingAdmin from '@/pages/admin/Branding'
import SettingsAdmin from '@/pages/admin/Settings'
import Quality from '@/pages/Quality'
import Documentation from '@/pages/Documentation'
import VirtualPark from '@/pages/ci/VirtualPark'
import SLADashboard from '@/pages/SLADashboard'
import Licenses from '@/pages/Licenses'
import OpsStatus from '@/pages/OpsStatus'
import KeyUsersDirectory from '@/pages/KeyUsersDirectory'
import Executive from '@/pages/Executive'
import Expiring from '@/pages/Expiring'
import PermissionsAdmin from '@/pages/admin/Permissions'
import SamlSettingsAdmin from '@/pages/admin/SamlSettings'
import M365CalendarAdmin from '@/pages/admin/M365Calendar'
import NetworkSegmentsAdmin from '@/pages/admin/NetworkSegments'
import MonitoringConnectorsAdmin from '@/pages/admin/MonitoringConnectors'
import BackupAdmin from '@/pages/admin/Backup'

export default function App() {
  return (
    <ThemeProvider>
    <BrandingProvider>
    <AuthProvider>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"  element={<Dashboard />} />
            <Route path="/executive"  element={<Executive />} />
            <Route path="/hardware" element={<HardwareDashboard />} />
            <Route path="/software" element={<SoftwareDashboard />} />
            <Route path="/virtual"  element={<VirtualPark />} />
            <Route path="/ci" element={<CIList />} />
            <Route path="/ci/new" element={<CINew />} />
            <Route path="/ci/:id/edit" element={<CIEdit />} />
            <Route path="/ci/:id" element={<CIDetail />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/vulnerabilities" element={<Vulnerabilities />} />
            <Route path="/deadlines" element={<Navigate to="/expiring" replace />} />
            <Route path="/admin/users"      element={<Users />} />
            <Route path="/admin/webhooks"   element={<Webhooks />} />
            <Route path="/admin/glpi"       element={<GLPIAdmin />} />
            <Route path="/admin/connectors" element={<ConnectorsAdmin />} />
            <Route path="/admin/agents"     element={<AgentsAdmin />} />
            <Route path="/admin/audit"      element={<AuditLogAdmin />} />
            <Route path="/reports"          element={<Reports />} />
            <Route path="/graph"            element={<GraphExplorer />} />
            <Route path="/changes"          element={<ChangeList />} />
            <Route path="/changes/new"      element={<ChangeNew />} />
            <Route path="/changes/:id/edit" element={<ChangeEdit />} />
            <Route path="/changes/:id"      element={<ChangeDetail />} />
            <Route path="/profile"          element={<Profile />} />
            <Route path="/incidents"              element={<IncidentList />} />
            <Route path="/incidents/new"          element={<IncidentNew />} />
            <Route path="/incidents/:id"          element={<IncidentDetail />} />
            <Route path="/admin/tokens"           element={<TokensAdmin />} />
            <Route path="/admin/notifications"    element={<NotificationsAdmin />} />
            <Route path="/admin/report-jobs"      element={<ReportJobsAdmin />} />
            <Route path="/admin/branding"         element={<BrandingAdmin />} />
            <Route path="/admin/sso"              element={<SamlSettingsAdmin />} />
            <Route path="/admin/m365-calendar"    element={<M365CalendarAdmin />} />
            <Route path="/admin/network"          element={<NetworkSegmentsAdmin />} />
            <Route path="/admin/monitoring"       element={<MonitoringConnectorsAdmin />} />
            <Route path="/admin/backup"           element={<BackupAdmin />} />
            <Route path="/admin/settings"         element={<SettingsAdmin />} />
            <Route path="/admin/permissions"      element={<PermissionsAdmin />} />
            <Route path="/quality"               element={<Quality />} />
            <Route path="/sla"                   element={<SLADashboard />} />
            <Route path="/licenses"              element={<Licenses />} />
            <Route path="/ops"                   element={<OpsStatus />} />
            <Route path="/keyusers"              element={<KeyUsersDirectory />} />
            <Route path="/maintenance"            element={<Maintenance />} />
            <Route path="/docs"                   element={<Documentation />} />
            <Route path="/expiring"              element={<Expiring />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
    </BrandingProvider>
    </ThemeProvider>
  )
}
