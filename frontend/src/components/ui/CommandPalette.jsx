import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAPI, searchPlayers } from '../../lib/api'
import { useTournament } from '../../contexts/TournamentContext'
import PlayerAvatar from './PlayerAvatar'

const PAGES = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Matches', to: '/matches' },
  { label: 'Batting records', to: '/batting' },
  { label: 'Bowling records', to: '/bowling' },
  { label: 'Compare batters', to: '/batting/compare' },
  { label: 'Teams', to: '/teams' },
  { label: 'Head to head', to: '/h2h' },
  { label: 'Venues', to: '/venues' },
  { label: 'Seasons', to: '/seasons' },
  { label: 'Charts & insights', to: '/charts' },
  { label: 'Player impact', to: '/player-impact' },
  { label: 'Cricket Pulse', to: '/pulse' },
  { label: 'Studio — make a stat card', to: '/content-studio' },
  { label: 'FAQ', to: '/faq' },
]

// Lists that rarely change are fetched once per tournament per visit.
const listCache = {}
function cachedList(key, loader) {
  if (!listCache[key]) listCache[key] = loader().catch(() => { delete listCache[key]; return [] })
  return listCache[key]
}

const KIND_STYLE = {
  Player: 'text-accent-cyan bg-accent-cyan/10',
  Team: 'text-accent-magenta bg-accent-magenta/10',
  Venue: 'text-accent-lime bg-accent-lime/10',
  Season: 'text-accent-amber bg-accent-amber/10',
  Page: 'text-text-secondary bg-white/[0.04]',
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const tournament = useTournament()
  const [text, setText] = useState('')
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [venues, setVenues] = useState([])
  const [seasons, setSeasons] = useState([])
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setText(''); setActive(0)
    const slug = tournament.tournament
    cachedList(`teams:${slug}`, () => fetchAPI('/meta/teams')).then(setTeams)
    cachedList(`venues:${slug}`, () => fetchAPI('/venues')).then(v => setVenues((v || []).map(x => x.venue)))
    cachedList(`seasons:${slug}`, () => fetchAPI('/meta/seasons')).then(setSeasons)
  }, [open, tournament.tournament])

  useEffect(() => {
    const q = text.trim()
    if (q.length < 2) { setPlayers([]); return }
    let current = true
    const t = setTimeout(() => {
      searchPlayers(q).then(r => current && setPlayers((r || []).slice(0, 8))).catch(() => {})
    }, 150)
    return () => { current = false; clearTimeout(t) }
  }, [text])

  const results = useMemo(() => {
    const q = text.trim().toLowerCase()
    const match = (s) => s.toLowerCase().includes(q)
    const out = []
    players.forEach(p => out.push({ kind: 'Player', label: p, to: `/batting/${encodeURIComponent(p)}` }))
    if (q) {
      teams.filter(match).slice(0, 5).forEach(t => out.push({ kind: 'Team', label: t, to: `/teams/${encodeURIComponent(t)}` }))
      venues.filter(match).slice(0, 5).forEach(v => out.push({ kind: 'Venue', label: v, to: `/venues/${encodeURIComponent(v)}` }))
      seasons.filter(s => String(s).includes(q)).slice(0, 4).forEach(s => out.push({ kind: 'Season', label: `${tournament.shortName} ${s}`, to: `/seasons/${encodeURIComponent(s)}` }))
    }
    PAGES.filter(p => !q || match(p.label)).slice(0, q ? 5 : PAGES.length)
      .forEach(p => out.push({ kind: 'Page', label: p.label, to: p.to }))
    return out
  }, [text, players, teams, venues, seasons, tournament.shortName])

  useEffect(() => { setActive(0) }, [text])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const go = (item) => { onClose(); navigate(item.to) }
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 backdrop-blur-sm px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Crickrida"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border-subtle bg-bg-elevated shadow-2xl animate-pop"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Search ${tournament.shortName} players, teams, venues, seasons…`}
            className="h-14 w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-item-${active}` : undefined}
          />
          <kbd className="hidden rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted sm:block">Esc</kbd>
        </div>
        <ul id="palette-results" ref={listRef} role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-text-muted">No matches for “{text}”</li>
          )}
          {results.map((item, i) => (
            <li
              key={`${item.kind}:${item.to}`}
              id={`palette-item-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(item)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                i === active ? 'bg-accent-cyan/10 text-text-primary' : 'text-text-secondary'
              }`}
            >
              {item.kind === 'Player'
                ? <PlayerAvatar name={item.label} size={24} showBorder={false} />
                : <span className="h-6 w-6 shrink-0" />}
              <span className="flex-1 truncate">{item.label}</span>
              <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${KIND_STYLE[item.kind]}`}>{item.kind}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-border-subtle px-4 py-2 font-mono text-[10px] text-text-muted">
          <span>↑↓ to move</span><span>↵ to open</span><span className="ml-auto">Ctrl/⌘ K</span>
        </div>
      </div>
    </div>
  )
}
