import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import SiteHeader from './SiteHeader'
import SectionNav from './SectionNav'
import MobileTabBar from './MobileTabBar'
import CommandPalette from '../ui/CommandPalette'
import PageSkeleton from '../ui/PageSkeleton'
import useScrollReveal from '../../hooks/useScrollReveal'
import { useTournament } from '../../contexts/TournamentContext'

// crickrida.com's header on top, this section's pages in a sticky bar below it,
// and the page scrolling with the window like the rest of the site.
export default function Layout({ children }) {
  const { tournament } = useTournament()
  const { pathname } = useLocation()
  const mainRef = useRef(null)
  useScrollReveal(mainRef, [pathname, tournament])

  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  // Player search: Ctrl/Cmd+K anywhere, or "/" when not typing in a field.
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
    <div className="min-h-screen bg-bg-primary">
      <SiteHeader />
      <SectionNav onSearch={() => setSearchOpen(true)} />
      <main ref={mainRef} className="p-4 pb-24 sm:p-6 sm:pb-24 lg:pb-10">
        <div className="mx-auto max-w-[1440px]">
          <div key={`${tournament}:${pathname}`} className="page-enter">
            <Suspense fallback={<PageSkeleton />}>
              {children || <Outlet />}
            </Suspense>
          </div>
        </div>
      </main>
      <MobileTabBar onSearch={() => setSearchOpen(true)} />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
