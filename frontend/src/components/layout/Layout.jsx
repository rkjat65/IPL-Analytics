import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileTabBar from './MobileTabBar'
import CommandPalette from '../ui/CommandPalette'
import PageSkeleton from '../ui/PageSkeleton'
import useScrollReveal from '../../hooks/useScrollReveal'
import { useTournament } from '../../contexts/TournamentContext'

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { tournament } = useTournament()
  const { pathname } = useLocation()
  const mainRef = useRef(null)
  useScrollReveal(mainRef, [pathname, tournament])

  // The page scrolls inside <main>, so reset it when moving to a new page.
  useEffect(() => { mainRef.current?.scrollTo(0, 0) }, [pathname])

  // Global search: Ctrl/⌘+K anywhere, or "/" when not typing in a field.
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); setSearchOpen(o => !o)
      } else if (e.key === '/' && !typing) {
        e.preventDefault(); setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      {/* Left slim sidebar: branding + user account */}
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Right area: top nav bar + content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} onSearch={() => setSearchOpen(true)} />
        <main ref={mainRef} className="flex-1 overflow-auto p-4 pb-24 sm:p-6 sm:pb-24 lg:pb-6">
          <div className="max-w-[1440px] mx-auto">
            <div key={`${tournament}:${pathname}`} className="page-enter">
              <Suspense fallback={<PageSkeleton />}>
                {children || <Outlet />}
              </Suspense>
            </div>
          </div>
        </main>
      </div>
      <MobileTabBar onSearch={() => setSearchOpen(true)} />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
