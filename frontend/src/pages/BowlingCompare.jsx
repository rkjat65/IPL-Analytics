import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from 'recharts'
import SEO from '../components/SEO'
import PlayerAvatar from '../components/ui/PlayerAvatar'
import { searchPlayers, getPlayerBowling } from '../lib/api'
import { useTournament } from '../contexts/TournamentContext'
import useUrlState from '../hooks/useUrlState'
import { formatNumber, formatDecimal } from '../utils/format'

const COLORS = ['#C3F23B', '#FF2D78', '#2DD4BF', '#FFB800']
const MAX_PLAYERS = 4
const tooltipStyle = {
  contentStyle: { backgroundColor: '#121a17', border: '1px solid #22302B', borderRadius: 8, color: '#F3F4EE' },
  itemStyle: { color: '#F3F4EE' },
}

// Higher is better for every axis; "lower is better" stats are inverted.
const AXES = [
  { label: 'Wickets / match', get: c => c.wickets / Math.max(1, c.matches) },
  { label: 'Economy', get: c => c.economy, lowerIsBetter: true },
  { label: 'Average', get: c => c.avg, lowerIsBetter: true },
  { label: 'Strike rate', get: c => c.sr, lowerIsBetter: true },
  { label: 'Dot ball %', get: c => (100 * c.dots) / Math.max(1, c.total_balls) },
]

export default function BowlingCompare() {
  const tournament = useTournament()
  // Selected bowlers live in the URL (?p=A,B) so a comparison can be shared
  const [picked, setPicked] = useUrlState('p', '')
  const names = picked ? picked.split(',').filter(Boolean) : []
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [careers, setCareers] = useState({})

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    let current = true
    const t = setTimeout(() => searchPlayers(query.trim()).then(r => current && setResults((r || []).slice(0, 8))).catch(() => {}), 200)
    return () => { current = false; clearTimeout(t) }
  }, [query])

  useEffect(() => {
    names.filter(n => !(n in careers)).forEach(n => {
      getPlayerBowling(n)
        .then(d => setCareers(prev => ({ ...prev, [n]: d?.career?.wickets != null ? d.career : null })))
        .catch(() => setCareers(prev => ({ ...prev, [n]: null })))
    })
  }, [picked])

  const add = (n) => {
    if (names.includes(n) || names.length >= MAX_PLAYERS) return
    setPicked([...names, n].join(',')); setQuery(''); setResults([])
  }
  const remove = (n) => setPicked(names.filter(x => x !== n).join(','))

  const withData = names.filter(n => careers[n])
  const radar = AXES.map(axis => {
    const values = withData.map(n => axis.get(careers[n]) || 0)
    const best = axis.lowerIsBetter ? Math.min(...values.filter(v => v > 0)) : Math.max(...values)
    const row = { axis: axis.label }
    withData.forEach((n, i) => {
      const v = values[i]
      row[n] = !v || !best ? 0 : Math.round(axis.lowerIsBetter ? (best / v) * 100 : (v / best) * 100)
    })
    return row
  })

  const rows = [
    ['Matches', c => formatNumber(c.matches)],
    ['Wickets', c => formatNumber(c.wickets)],
    ['Overs', c => c.overs],
    ['Economy', c => formatDecimal(c.economy)],
    ['Average', c => formatDecimal(c.avg)],
    ['Strike rate', c => formatDecimal(c.sr)],
    ['Dot ball %', c => formatDecimal((100 * c.dots) / Math.max(1, c.total_balls), 1)],
    ['Best', c => c.best_figures],
    ['4w / 5w', c => `${c.four_w ?? 0} / ${c.five_w ?? 0}`],
  ]

  return (
    <div className="space-y-6">
      <SEO
        title={`${tournament.shortName} Bowling Comparison — Compare Bowlers Side by Side`}
        description={`Compare ${tournament.shortName} bowlers side by side: wickets, economy, average, strike rate and dot-ball percentage.`}
        url="/bowling/compare"
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold text-text-primary">Compare Bowlers</h1>
          <p className="mt-1 text-sm text-text-secondary">Pick up to {MAX_PLAYERS} bowlers. Every axis is scaled so the best of the group scores 100.</p>
        </div>
        <Link to="/batting/compare" className="text-sm text-accent-brand hover:underline">Compare batters →</Link>
      </div>

      <div className="card space-y-3">
        <div className="relative max-w-md">
          <input value={query} onChange={e => setQuery(e.target.value)} disabled={names.length >= MAX_PLAYERS}
            placeholder={names.length >= MAX_PLAYERS ? 'Remove a bowler to add another' : 'Search bowler…'}
            aria-label="Search bowler"
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-brand/50 focus:outline-none" />
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border-subtle bg-bg-elevated shadow-xl">
              {results.map(r => (
                <li key={r}>
                  <button onClick={() => add(r)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-accent-brand/10 hover:text-text-primary">
                    <PlayerAvatar name={r} size={22} showBorder={false} />{r}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {names.map((n, i) => (
            <span key={n} className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm" style={{ borderColor: `${COLORS[i]}66`, color: COLORS[i] }}>
              {n}
              {careers[n] === null && <span className="text-[10px] text-text-muted">(no bowling)</span>}
              <button onClick={() => remove(n)} aria-label={`Remove ${n}`} className="text-text-muted hover:text-text-primary">×</button>
            </span>
          ))}
        </div>
      </div>

      {withData.length === 0 && (
        <div className="card py-12 text-center text-sm text-text-secondary">
          Try <button className="text-accent-brand hover:underline" onClick={() => setPicked('JJ Bumrah,YS Chahal,SP Narine')}>Bumrah vs Chahal vs Narine</button>
        </div>
      )}

      {withData.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="#2E3F39" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: '#AEB8B2', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                {withData.map(n => (
                  <Radar key={n} name={n} dataKey={n} stroke={COLORS[names.indexOf(n)]} fill={COLORS[names.indexOf(n)]} fillOpacity={0.15} strokeWidth={2} />
                ))}
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="py-2 text-left font-mono text-[11px] uppercase text-text-muted">Stat</th>
                  {withData.map(n => (
                    <th key={n} className="py-2 text-right font-semibold" style={{ color: COLORS[names.indexOf(n)] }}>{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, fmt]) => (
                  <tr key={label} className="border-t border-border-subtle">
                    <td className="py-2 font-mono text-xs text-text-muted">{label}</td>
                    {withData.map(n => <td key={n} className="py-2 text-right font-mono text-text-primary">{fmt(careers[n])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
