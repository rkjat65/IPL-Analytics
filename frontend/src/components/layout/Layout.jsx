import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import PageSkeleton from '../ui/PageSkeleton'
import { useTournament } from '../../contexts/TournamentContext'

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { tournament } = useTournament()

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      {/* Left slim sidebar: branding + user account */}
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Right area: top nav bar + content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-[1440px] mx-auto">
            <div key={tournament}>
              <Suspense fallback={<PageSkeleton />}>
                {children || <Outlet />}
              </Suspense>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
