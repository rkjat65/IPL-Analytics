import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import BrandMark from '../brand/BrandMark'
import { useTournament } from '../../contexts/TournamentContext'
import { PREFIXES } from '../../lib/site'

// The same header as every other page on crickrida.com (the archive builds it in
// tools/site_shell.py): five links, three grouped menus and a search field. Its links leave
// this app's router (the archive is a separate build), so they are plain anchors.
const PRIMARY = [
  ['/players/', 'Players'],
  ['/teams/', 'Teams'],
  ['/matches/', 'Matches'],
  ['/records/', 'Records'],
  ['/ratings/', 'Ratings'],
]
// [label, [[href, name, one line, tournament slug served by this app]]]
const MENUS = [
  ['Tournaments', [
    ['/world-cup/', 'World Cups', 'ODI and T20, men and women'],
    ['/world-cup/2027/', 'World Cup 2027', 'Schedule, venues and teams'],
    [`${PREFIXES.ipl}/dashboard`, 'IPL', 'Every season since 2008', 'ipl'],
    [`${PREFIXES.t20wc}/dashboard`, 'T20 World Cup', 'Ball by ball, 2007 to 2026', 't20wc'],
    ['/series/', 'Series and tours', 'Every bilateral series'],
  ]],
  ['Tools', [
    ['/compare/', 'Compare players', 'Two or three careers side by side'],
    ['/matchups/', 'Batter v bowler', 'Every ball between two players'],
    ['/phases/', 'Phase analysis', 'Powerplay, middle and death overs'],
    ['/studio/', 'Chart Studio', 'Build and export a chart'],
    ['/fantasy/', 'Fantasy XI', 'A suggested team for any match'],
    ['/quiz/', 'Quiz', 'Name the player from the numbers'],
    ['/tools/', 'All tools', ''],
  ]],
  ['More', [
    ['/grounds/', 'Grounds', 'Records at every venue'],
    ['/head-to-head/', 'Head-to-head', 'Team rivalries by format'],
    ['/on-this-day/', 'On this day', "Cricket on today's date"],
    ['/blog/', 'Daily notes', 'Short reads from the data'],
    ['/questions/', 'Questions', 'Quick answers with the figures'],
    ['/where-to-watch/', 'Where to watch', 'Fixtures and broadcasters'],
  ]],
]

const linkClass = 'rounded-full px-3 py-2 text-[13.5px] font-semibold text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary hover:no-underline'

function SearchIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  )
}

export default function SiteHeader() {
  const { tournament } = useTournament()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(null)
  const [scrolled, setScrolled] = useState(false)
  const bar = useRef(null)

  useEffect(() => { setOpen(false); setMenu(null) }, [pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // One menu open at a time; a click elsewhere or Escape closes it.
  useEffect(() => {
    if (menu === null) return undefined
    const onClick = (e) => { if (!bar.current?.contains(e.target)) setMenu(null) }
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey) }
  }, [menu])

  return (
    <header className={`sticky top-0 z-40 border-b border-white/[0.06] bg-[#12121a]/85 backdrop-blur-xl transition-shadow ${scrolled ? 'shadow-[0_10px_30px_-18px_#000]' : ''}`}>
      <div ref={bar} className="relative mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <a href="/" aria-label="Crickrida home" className="flex shrink-0 items-center gap-2.5 text-text-primary hover:no-underline">
          <BrandMark className="h-[30px] w-[30px]" />
          <span className="font-heading text-[23px] font-bold leading-none tracking-[-0.9px]">crickrida</span>
        </a>

        <nav
          id="site-nav"
          aria-label="Crickrida"
          className={`${open ? 'grid' : 'hidden'} absolute inset-x-0 top-16 max-h-[calc(100dvh-4rem)] grid-cols-2 gap-x-2 overflow-auto border-b border-white/[0.06] bg-[#12121a] px-4 pb-6 pt-2 lg:static lg:ml-2 lg:flex lg:max-h-none lg:flex-1 lg:items-center lg:gap-0.5 lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0`}
        >
          {PRIMARY.map(([href, label]) => (
            <a key={href} href={href} className={`${linkClass} max-lg:rounded-xl max-lg:py-3 max-lg:text-[15px] max-lg:text-text-primary`}>
              {label}
            </a>
          ))}
          {MENUS.map(([label, links]) => {
            const here = links.some(([, , , slug]) => slug && slug === tournament)
            const shown = menu === label
            return (
              <div key={label} className="relative max-lg:col-span-2 max-lg:mt-2 max-lg:border-t max-lg:border-white/[0.06] max-lg:pt-3">
                <button
                  type="button"
                  onClick={() => setMenu(shown ? null : label)}
                  aria-expanded={shown}
                  className={`${linkClass} hidden items-center gap-1.5 lg:flex ${here ? 'text-accent-amber' : ''} ${shown ? 'bg-white/[0.06] text-text-primary' : ''}`}
                >
                  {label}
                  <svg viewBox="0 0 10 6" className={`h-1.5 w-2.5 opacity-70 transition-transform ${shown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg>
                </button>
                <p className="px-3 pb-1 font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-text-secondary lg:hidden">{label}</p>
                <div className={`grid grid-cols-2 gap-0.5 lg:absolute lg:left-0 lg:top-[calc(100%+12px)] lg:z-50 lg:w-[290px] lg:grid-cols-1 lg:rounded-2xl lg:border lg:border-white/[0.08] lg:bg-[#161922] lg:p-2 lg:shadow-[0_26px_60px_-22px_#000] ${shown ? '' : 'lg:hidden'}`}>
                  {links.map(([href, name, line, slug]) => (
                    <a
                      key={href}
                      href={href}
                      aria-current={slug && slug === tournament ? 'page' : undefined}
                      className={`flex flex-col gap-px rounded-[10px] px-3 py-2.5 text-[13.5px] hover:bg-white/[0.06] hover:no-underline ${slug && slug === tournament ? 'bg-accent-amber/10 text-accent-amber' : 'text-text-primary'}`}
                    >
                      <b className="font-semibold">{name}</b>
                      {line ? <small className="text-[12px] text-text-secondary max-lg:hidden">{line}</small> : null}
                    </a>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <a
          href="/search/"
          aria-label="Search Crickrida"
          className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full border border-white/[0.08] text-[13px] font-medium text-text-secondary transition-colors hover:border-white/20 hover:text-text-primary hover:no-underline lg:ml-0 lg:w-[250px] lg:justify-start lg:px-3.5"
        >
          <SearchIcon className="h-[18px] w-[18px] shrink-0" />
          <span className="hidden truncate lg:inline">Search players, teams, records</span>
        </a>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-text-secondary hover:text-text-primary lg:hidden"
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="site-nav"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>
    </header>
  )
}
