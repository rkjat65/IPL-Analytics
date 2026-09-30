import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTournament } from '../../contexts/TournamentContext'

// Pages of this section (IPL or T20 World Cup), in reading order. CORE always
// sits in the bar on wide screens, EXTRA joins it from 1280 px, the rest (and
// EXTRA on narrower laptops) go under More.
const CORE = [
  ['/dashboard', 'Overview'],
  ['/matches', 'Matches'],
  ['/batting', 'Batting'],
  ['/bowling', 'Bowling'],
  ['/players', 'Players'],
  ['/records', 'Records'],
  ['/teams', 'Teams'],
  ['/venues', 'Venues'],
]
const EXTRA = [
  ['/seasons', null],
  ['/phases', 'Phases'],
  ['/matchups', 'Matchups'],
  ['/h2h', 'Head to head'],
]
const MORE = [
  ['/charts', 'Insights'],
  ['/player-impact', 'Impact ratings'],
  ['/pulse', 'Pulse'],
  ['/content-studio', 'Stat cards'],
  ['/fantasy', 'Fantasy'],
  ['/quiz', 'Quiz'],
  ['/faq', 'FAQ'],
]

const link = ({ isActive }) =>
  `relative flex h-11 shrink-0 items-center whitespace-nowrap px-1 text-[13px] font-semibold transition-colors ${
    isActive
      ? 'text-accent-brand after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-t after:bg-accent-brand'
      : 'text-text-secondary hover:text-text-primary'
  }`

export default function SectionNav({ onSearch }) {
  const tournament = useTournament()
  const { user, isAuthenticated, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const moreRef = useRef(null)
  const scrollerRef = useRef(null)
  const accountRef = useRef(null)

  const label = (path, text) => text || (path === '/seasons' ? tournament.competitionLabelPlural : path)
  const moreActive = [...EXTRA, ...MORE].some(([path]) => pathname === path || pathname.startsWith(`${path}/`))

  useEffect(() => { setMoreOpen(false); setAccountOpen(false) }, [pathname])
  // On small screens keep the current page's link visible in the sideways bar.
  useEffect(() => {
    const active = scrollerRef.current?.querySelector('[aria-current="page"]')
    active?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [pathname])
  useEffect(() => {
    const close = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false)
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="sticky top-16 z-30 border-b border-white/[0.06] bg-[#0C1210]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        {/* Section switch: the same page in the other tournament */}
        <div className="flex shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5" role="group" aria-label="Tournament">
          {[['ipl', 'IPL'], ['t20wc', 'T20 WC']].map(([slug, text]) => (
            <button
              key={slug}
              type="button"
              onClick={() => tournament.selectTournament(slug)}
              aria-pressed={tournament.tournament === slug}
              className={`rounded-md px-2.5 py-1 font-heading text-xs font-bold transition-colors ${
                tournament.tournament === slug ? 'bg-accent-brand text-bg-primary' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        {/* Every page, scrolling sideways on small screens */}
        <nav ref={scrollerRef} aria-label={`${tournament.shortName} pages`} className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto [scrollbar-width:none] lg:hidden">
          {[...CORE, ...EXTRA, ...MORE].map(([path, text]) => (
            <NavLink key={path} to={path} className={link}>{label(path, text)}</NavLink>
          ))}
        </nav>

        {/* Wide screens: main pages plus More */}
        <nav aria-label={`${tournament.shortName} pages`} className="hidden min-w-0 flex-1 items-center gap-4 lg:flex">
          {CORE.map(([path, text]) => (
            <NavLink key={path} to={path} className={link}>{label(path, text)}</NavLink>
          ))}
          {EXTRA.map(([path, text]) => (
            <NavLink key={path} to={path} className={(state) => `${link(state)} hidden xl:flex`}>{label(path, text)}</NavLink>
          ))}
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              className={`flex h-11 items-center gap-1 text-[13px] font-semibold transition-colors ${moreActive ? 'text-accent-brand' : 'text-text-secondary hover:text-text-primary'}`}
            >
              More
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={`h-3.5 w-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 min-w-[180px] overflow-hidden rounded-lg border border-border-active bg-bg-elevated py-1 shadow-2xl">
                {[...EXTRA.map((item) => [...item, true]), ...MORE].map(([path, text, extra]) => (
                  <NavLink key={path} to={path}
                    className={({ isActive }) => `block px-4 py-2 text-[13px] font-medium ${extra ? 'xl:hidden' : ''} ${isActive ? 'text-accent-brand' : 'text-text-secondary hover:bg-white/[0.04] hover:text-text-primary'}`}>
                    {label(path, text)}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>

        <button
          type="button"
          onClick={onSearch}
          className="hidden h-8 shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-text-muted transition-colors hover:border-accent-brand/40 hover:text-text-primary md:flex"
          aria-label={`Search ${tournament.shortName} players, teams and venues (Ctrl+K)`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span className="hidden 2xl:inline">Find a player</span>
          <kbd className="rounded border border-white/10 px-1.5 font-mono text-[10px]">Ctrl K</kbd>
        </button>

        {isAuthenticated && (
          <div className="relative shrink-0" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen((o) => !o)}
              aria-expanded={accountOpen}
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-accent-amber/40 bg-accent-amber/10 text-[11px] font-bold text-accent-amber"
              title={user?.email || 'Account'}
            >
              {user?.picture
                ? <img src={user.picture} alt="" className="h-full w-full object-cover" />
                : (user?.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
            </button>
            {accountOpen && (
              <div className="absolute right-0 top-full mt-2 min-w-[200px] overflow-hidden rounded-lg border border-border-active bg-bg-elevated py-1 shadow-2xl">
                <p className="truncate px-4 pt-2 text-xs font-semibold text-text-primary">{user?.name || 'Admin'}</p>
                <p className="truncate px-4 pb-2 font-mono text-[10px] text-text-muted">{user?.email}</p>
                {user?.is_admin && (
                  <>
                    <NavLink to="/admin" className="block px-4 py-2 text-[13px] text-text-secondary hover:bg-white/[0.04] hover:text-accent-amber">Admin</NavLink>
                    <NavLink to="/admin/social" className="block px-4 py-2 text-[13px] text-text-secondary hover:bg-white/[0.04] hover:text-accent-amber">Social</NavLink>
                  </>
                )}
                <button
                  type="button"
                  onClick={async () => { await logout(); navigate('/dashboard') }}
                  className="block w-full px-4 py-2 text-left text-[13px] text-text-secondary hover:bg-white/[0.04] hover:text-accent-magenta"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
