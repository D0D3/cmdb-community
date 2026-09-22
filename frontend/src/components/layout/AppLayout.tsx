import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { IngestProvider } from '@/contexts/IngestContext'

export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <IngestProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar
          drawerOpen={drawerOpen}
          onDrawerClose={() => setDrawerOpen(false)}
        />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Topbar onOpenSidebar={() => setDrawerOpen(true)} />
          <main className="flex-1 overflow-auto p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </IngestProvider>
  )
}
