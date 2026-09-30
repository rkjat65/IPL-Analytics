import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import BrandMark from '../brand/BrandMark'
import { useTournament } from '../../contexts/TournamentContext'
import { PREFIXES } from '../../lib/site'

// The same header as every other page on crickrida.com. Its links leave this
// app's router (the archive is a separate build), so they are plain anchors.
const SITE_NAV = [
  ['/matches/', 'Matches'],
  ['/players/', 'Players'],
  ['/teams/', 'Teams'],
  ['/records/', 'Records'],
  ['/compare/', 'Compare'],
  ['/studio/', 'Studio'],
  ['/series/', 'Series'],
  ['/where-to-watch/', 'Watch'],
]
const SECTIONS = [['ipl', 'IPL'], ['t20wc', 'T20 World Cup']]

export default function SiteHeader() {
  const { tournament } = useTournament()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`sticky top-0 z-40 border-b border-white/[0.06] bg-[#12121a]/85 backdrop-blur-xl transition-shadow ${scrolled ? 'shadow-[0_10px_30px_-18px_#000]' : ''}`}>
      <div className="relative mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-4 sm:px-6">
        <a href="/" aria-label="Crickrida home" className="flex shrink-0 items-center gap-2.5 text-text-primary hover:no-underline">
          <BrandMark className="h-[30px] w-[30px]" />
          <span className="font-heading text-[23px] font-bold leading-none tracking-[-0.9px]">crickrida</span>
        </a>

        <nav
          id="site-nav"
          aria-label="Crickrida"
          className={`${open ? 'flex' : 'hidden'} absolute inset-x-0 top-16 flex-col border-b border-white/[0.06] bg-[#12121a] px-4 py-2 lg:static lg:flex lg:flex-1 lg:flex-row lg:items-center lg:gap-6 lg:border-0 lg:bg-transparent lg:p-0`}
        >
          {SITE_NAV.map(([href, label]) => (
            <a key={href} href={href} className="py-3 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary lg:py-0">
              {label}
            </a>
          ))}
          <span className="flex gap-2 py-2 lg:py-0">
            {SECTIONS.map(([slug, label]) => (
              <a
                key={slug}
                href={`${PREFIXES[slug]}/dashboard`}
                aria-current={tournament === slug ? 'page' : undefined}
                className={`rounded-full border px-3 py-1 text-[13px] font-bold transition-colors ${
                  tournament === slug
                    ? 'border-accent-amber bg-accent-amber text-bg-primary'
                    : 'border-accent-amber/25 bg-accent-amber/10 text-accent-amber hover:bg-accent-amber/20'
                }`}
              >
                {label}
              </a>
            ))}
          </span>
          <a href="/search/" className="py-3 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary lg:py-0">Search</a>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary lg:hidden"
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
