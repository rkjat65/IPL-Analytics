import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTournament } from '../contexts/TournamentContext'
import SEO from '../components/SEO'
import { useFetch } from '../hooks/useFetch'
import {
  getKPIs,
  getSeasons,
  getBattingLeaderboard,
  getBowlingLeaderboard,
  getMatches,
  getTopTotals,
  getTopSixes,
  getTopFours,
  getMostWins,
  getTitleWinners,
} from '../lib/api'
import { getTeamColor, getTeamAbbr } from '../constants/teams'
import TeamLogo from '../components/ui/TeamLogo'
import {
  BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import StatCard from '../components/ui/StatCard'
import DataTable from '../components/ui/DataTable'
import Loading from '../components/ui/Loading'
import MultiSeasonSelect from '../components/ui/MultiSeasonSelect'
import { formatNumber, formatDecimal, formatDate, getMatchResult } from '../utils/format'

/* ── Custom Recharts Tooltip ────────────────────────────── */
function NeonTooltip({ active, payload, label, valueLabel }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-xl border"
      style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
      <p className="text-text-primary font-semibold mb-0.5">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {valueLabel || p.name}: <span className="font-mono font-bold">{formatNumber(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const tournament = useTournament()
  const [season, setSeason] = useState('')
  const [showTopTotals, setShowTopTotals] = useState(false)
  const [showTopSixes, setShowTopSixes] = useState(false)
  const [showTopFours, setShowTopFours] = useState(false)
  const [showTopWickets, setShowTopWickets] = useState(false)
  const [batSort, setBatSort] = useState('runs')
  const [bowlSort, setBowlSort] = useState('wickets')

  const { data: seasons, loading: seasonsLoading } = useFetch(() => getSeasons(), [])

  const { data: kpis, loading: kpisLoading, error: kpisError } = useFetch(
    () => getKPIs(season),
    [season]
  )

  const { data: batters, loading: battersLoading } = useFetch(
    () => getBattingLeaderboard({ season, limit: 10, sort_by: batSort, order: 'desc' }),
    [season, batSort]
  )

  const { data: bowlers, loading: bowlersLoading } = useFetch(
    () => getBowlingLeaderboard({ season, limit: 10, sort_by: bowlSort, order: 'desc' }),
    [season, bowlSort]
  )

  const { data: matchesData, loading: matchesLoading } = useFetch(
    () => getMatches({ season, limit: 10, offset: 0 }),
    [season]
  )

  const { data: topTotals, loading: topTotalsLoading } = useFetch(
    () => getTopTotals(season),
    [season]
  )

  const { data: topSixes, loading: topSixesLoading } = useFetch(
    () => getTopSixes(season),
    [season]
  )

  const { data: topFours, loading: topFoursLoading } = useFetch(
    () => getTopFours(season),
    [season]
  )

  const { data: mostWins, loading: mostWinsLoading } = useFetch(
    () => getMostWins(season),
    [season]
  )

  const { data: titleWinners, loading: titleWinnersLoading } = useFetch(
    () => getTitleWinners(),
    []
  )

  const seasonOptions = (seasons || []).map((s) => ({ value: s, label: s }))

  // Batting leaderboard columns
  const battingColumns = [
    { key: 'rank', label: '#', align: 'center' },
    {
      key: 'player',
      label: 'Player',
      render: (val) => (
        <Link
          to={`/batting/${encodeURIComponent(val)}`}
          className="text-accent-cyan hover:underline"
        >
          {val}
        </Link>
      ),
    },
    { key: 'matches', label: 'Mat', align: 'right' },
    { key: 'innings', label: 'Inn', align: 'right' },
    { key: 'runs', label: 'Runs', align: 'right', render: (val) => <span className="font-mono font-semibold text-accent-lime">{formatNumber(val)}</span> },
    { key: 'avg', label: 'Avg', align: 'right', render: (val) => <span className="font-mono">{formatDecimal(val)}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (val) => <span className="font-mono">{formatDecimal(val)}</span> },
    { key: 'fifties', label: '50s', align: 'right' },
    { key: 'hundreds', label: '100s', align: 'right' },
  ]

  // Bowling leaderboard columns
  const bowlingColumns = [
    { key: 'rank', label: '#', align: 'center' },
    {
      key: 'player',
      label: 'Player',
      render: (val) => (
        <Link
          to={`/bowling/${encodeURIComponent(val)}`}
          className="text-accent-cyan hover:underline"
        >
          {val}
        </Link>
      ),
    },
    { key: 'matches', label: 'Mat', align: 'right' },
    { key: 'innings', label: 'Inn', align: 'right' },
    { key: 'wickets', label: 'Wkts', align: 'right', render: (val) => <span className="font-mono font-semibold text-accent-magenta">{val}</span> },
    { key: 'avg', label: 'Avg', align: 'right', render: (val) => <span className="font-mono">{formatDecimal(val)}</span> },
    { key: 'economy', label: 'Econ', align: 'right', render: (val) => <span className="font-mono">{formatDecimal(val)}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (val) => <span className="font-mono">{formatDecimal(val)}</span> },
  ]

  const battersWithRank = (Array.isArray(batters) ? batters : []).map((b, i) => ({
    ...b,
    rank: i + 1,
  }))

  const bowlersWithRank = (Array.isArray(bowlers) ? bowlers : []).map((b, i) => ({
    ...b,
    rank: i + 1,
  }))

  const recentMatches = matchesData?.matches || []

  /* ── Chart data transforms ─────────────────────────────── */
  const BAT_SORT_OPTIONS = [
    { key: 'runs', label: 'Runs' },
    { key: 'avg', label: 'Average' },
    { key: 'sr', label: 'Strike Rate' },
    { key: 'fifties', label: '50s' },
    { key: 'hundreds', label: '100s' },
    { key: 'sixes', label: 'Sixes' },
    { key: 'fours', label: 'Fours' },
    { key: 'matches', label: 'Matches' },
  ]
  const BOWL_SORT_OPTIONS = [
    { key: 'wickets', label: 'Wickets' },
    { key: 'economy', label: 'Economy' },
    { key: 'avg', label: 'Average' },
    { key: 'sr', label: 'Strike Rate' },
    { key: 'five_wickets', label: '5W Hauls' },
    { key: 'four_wickets', label: '4W Hauls' },
    { key: 'matches', label: 'Matches' },
  ]

  const BAT_BAR_COLORS = ['#00E5FF', '#B8FF00', '#FFB800', '#FF2D78', '#8B5CF6', '#22D3EE', '#22C55E', '#FBBF24', '#EF4444', '#A78BFA']
  const BOWL_BAR_COLORS = ['#FF2D78', '#8B5CF6', '#00E5FF', '#FFB800', '#B8FF00', '#EF4444', '#22D3EE', '#F472B6', '#A78BFA', '#34D399']

  const batSortLabel = BAT_SORT_OPTIONS.find(o => o.key === batSort)?.label || batSort
  const bowlSortLabel = BOWL_SORT_OPTIONS.find(o => o.key === bowlSort)?.label || bowlSort

  const batterChartData = [...battersWithRank].map((b) => ({
    name: b.player?.length > 14 ? b.player.slice(0, 13) + '\u2026' : b.player,
    fullName: b.player,
    value: b[batSort] ?? b.runs,
    runs: b.runs,
    avg: b.avg,
    sr: b.sr,
  })).sort((a, b) => b.value - a.value)

  const bowlerChartData = [...bowlersWithRank].map((b) => ({
    name: b.player?.length > 14 ? b.player.slice(0, 13) + '\u2026' : b.player,
    fullName: b.player,
    value: (bowlSort === 'five_wickets' ? b.five_w : bowlSort === 'four_wickets' ? b.four_w : b[bowlSort]) ?? b.wickets,
    wickets: b.wickets,
    economy: b.economy,
  })).sort((a, b) => b.value - a.value)

  /* ── Most Wins chart data ──────────────────────────────── */
  const winsChartData = useMemo(() => {
    if (!Array.isArray(mostWins) || mostWins.length === 0) return []
    return [...mostWins]
      .sort((a, b) => b.wins - a.wins)
      .map((t) => ({
        team: getTeamAbbr(t.team),
        fullTeam: t.team,
        wins: t.wins,
        matches: t.matches,
        win_pct: t.win_pct,
        fill: getTeamColor(t.team),
      }))
  }, [mostWins])

  /* ── Title Winners chart data ──────────────────────────── */
  const titleChartData = useMemo(() => {
    if (!Array.isArray(titleWinners) || titleWinners.length === 0) return []
    const counts = {}
    titleWinners.forEach((t) => {
      counts[t.winner] = (counts[t.winner] || 0) + 1
    })
    return Object.entries(counts)
      .map(([team, titles]) => ({
        team: getTeamAbbr(team),
        fullTeam: team,
        titles,
        fill: getTeamColor(team),
      }))
      .sort((a, b) => b.titles - a.titles)
  }, [titleWinners])

  /* ── Safe array helpers for expandable cards ───────────── */
  const topTotalsList = Array.isArray(topTotals) ? topTotals : []
  const topSixesList = Array.isArray(topSixes) ? topSixes : []
  const topFoursList = Array.isArray(topFours) ? topFours : []

  if (kpisError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-danger font-heading text-lg">Failed to load dashboard</p>
        <p className="text-text-secondary text-sm">{kpisError}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <SEO
        title={`${tournament.shortName} Dashboard — Stats, Leaderboards & ${tournament.competitionLabel} Trends`}
        description={`Crickrida ${tournament.shortName} analytics with batting and bowling leaderboards, match results, records, and ${tournament.competitionLabel.toLowerCase()} trends.`}
        url="/dashboard"
      />
      {/* Page Header + Season Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-text-primary">
            {tournament.shortName} Dashboard
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Comprehensive analytics across all {tournament.name} {tournament.competitionLabelPlural.toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-text-secondary text-sm font-body">{tournament.competitionLabel}</label>
          <MultiSeasonSelect seasons={seasons || []} value={season} onChange={setSeason} />
        </div>
      </div>

      {/* Hero KPI Row */}
      {kpisLoading ? (
        <Loading message="Loading KPIs..." />
      ) : kpis ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 stagger-children">
          <StatCard label="Total Matches" value={formatNumber(kpis.total_matches)} color="cyan" />
          <StatCard label="Total Runs" value={formatNumber(kpis.total_runs)} color="lime" />
          <StatCard label="Total Wickets" value={formatNumber(kpis.total_wickets)} color="magenta" />
          <StatCard label="Total Boundaries" value={formatNumber(kpis.total_boundaries)} color="amber" />
          <StatCard label="Avg Score" value={formatDecimal(kpis.avg_score, 1)} color="cyan" />
          <StatCard label="Total Sixes" value={formatNumber(kpis.total_sixes)} color="magenta" />
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════
          EXPANDABLE HIGHLIGHT CARDS (Top Totals, Sixes, Fours)
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Highest Totals */}
        <div className="bg-[#111118] border border-[#1E1E2A] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent-lime/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-accent-lime" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <p className="text-xs uppercase tracking-wider text-text-muted font-medium">Highest Totals</p>
          </div>
          {topTotalsLoading ? (
            <Loading message="Loading..." />
          ) : topTotalsList.length === 0 ? (
            <p className="text-text-muted text-sm">No data</p>
          ) : (
            <>
              {/* #1 always visible */}
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-text-muted font-mono text-xs w-5 text-right">#1</span>
                <Link to={`/matches/${topTotalsList[0].match_id}`} className="hover:underline flex-1 min-w-0">
                  <span className="text-xl font-heading font-bold text-accent-lime stat-glow-lime">
                    {topTotalsList[0].total_runs}
                  </span>
                  <span className="text-text-secondary ml-2 text-sm">
                    {topTotalsList[0].batting_team}
                  </span>
                  <span className="text-text-muted ml-1 text-xs">
                    vs {topTotalsList[0].opponent}
                  </span>
                </Link>
              </div>

              {/* Expandable list */}
              {showTopTotals && topTotalsList.slice(1, 10).map((item, idx) => (
                <div key={item.match_id || idx} className="flex items-baseline gap-2 py-1.5 border-t border-[#1E1E2A]">
                  <span className="text-text-muted font-mono text-xs w-5 text-right">#{idx + 2}</span>
                  <Link to={`/matches/${item.match_id}`} className="hover:underline flex-1 min-w-0">
                    <span className="font-mono font-bold text-accent-lime text-sm">{item.total_runs}</span>
                    <span className="text-text-secondary ml-2 text-xs">{item.batting_team}</span>
                    <span className="text-text-muted ml-1 text-xs">vs {item.opponent}</span>
                  </Link>
                </div>
              ))}

              {topTotalsList.length > 1 && (
                <button
                  onClick={() => setShowTopTotals(!showTopTotals)}
                  className="text-accent-cyan text-xs mt-2 hover:underline cursor-pointer"
                >
                  {showTopTotals ? 'Collapse \u25B2' : 'View Top 10 \u25BC'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Most Sixes */}
        <div className="bg-[#111118] border border-[#1E1E2A] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent-amber/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-accent-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <p className="text-xs uppercase tracking-wider text-text-muted font-medium">Most Sixes</p>
          </div>
          {topSixesLoading ? (
            <Loading message="Loading..." />
          ) : topSixesList.length === 0 ? (
            <p className="text-text-muted text-sm">No data</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-text-muted font-mono text-xs w-5 text-right">#1</span>
                <Link to={`/batting/${encodeURIComponent(topSixesList[0].player)}`} className="hover:underline flex-1 min-w-0">
                  <span className="text-xl font-heading font-bold text-accent-amber stat-glow-amber">
                    {topSixesList[0].sixes}
                  </span>
                  <span className="text-text-secondary ml-2 text-sm">
                    {topSixesList[0].player}
                  </span>
                  <span className="text-text-muted ml-1 text-xs">
                    ({topSixesList[0].matches} mat)
                  </span>
                </Link>
              </div>

              {showTopSixes && topSixesList.slice(1, 10).map((item, idx) => (
                <div key={item.player || idx} className="flex items-baseline gap-2 py-1.5 border-t border-[#1E1E2A]">
                  <span className="text-text-muted font-mono text-xs w-5 text-right">#{idx + 2}</span>
                  <Link to={`/batting/${encodeURIComponent(item.player)}`} className="hover:underline flex-1 min-w-0">
                    <span className="font-mono font-bold text-accent-amber text-sm">{item.sixes}</span>
                    <span className="text-text-secondary ml-2 text-xs">{item.player}</span>
                    <span className="text-text-muted ml-1 text-xs">({item.matches} mat)</span>
                  </Link>
                </div>
              ))}

              {topSixesList.length > 1 && (
                <button
                  onClick={() => setShowTopSixes(!showTopSixes)}
                  className="text-accent-cyan text-xs mt-2 hover:underline cursor-pointer"
                >
                  {showTopSixes ? 'Collapse \u25B2' : 'View Top 10 \u25BC'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Most Fours */}
        <div className="bg-[#111118] border border-[#1E1E2A] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent-cyan/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-accent-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
              </svg>
            </div>
            <p className="text-xs uppercase tracking-wider text-text-muted font-medium">Most Fours</p>
          </div>
          {topFoursLoading ? (
            <Loading message="Loading..." />
          ) : topFoursList.length === 0 ? (
            <p className="text-text-muted text-sm">No data</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-text-muted font-mono text-xs w-5 text-right">#1</span>
                <Link to={`/batting/${encodeURIComponent(topFoursList[0].player)}`} className="hover:underline flex-1 min-w-0">
                  <span className="text-xl font-heading font-bold text-accent-cyan stat-glow-cyan">
                    {topFoursList[0].fours}
                  </span>
                  <span className="text-text-secondary ml-2 text-sm">
                    {topFoursList[0].player}
                  </span>
                  <span className="text-text-muted ml-1 text-xs">
                    ({topFoursList[0].matches} mat)
                  </span>
                </Link>
              </div>

              {showTopFours && topFoursList.slice(1, 10).map((item, idx) => (
                <div key={item.player || idx} className="flex items-baseline gap-2 py-1.5 border-t border-[#1E1E2A]">
                  <span className="text-text-muted font-mono text-xs w-5 text-right">#{idx + 2}</span>
                  <Link to={`/batting/${encodeURIComponent(item.player)}`} className="hover:underline flex-1 min-w-0">
                    <span className="font-mono font-bold text-accent-cyan text-sm">{item.fours}</span>
                    <span className="text-text-secondary ml-2 text-xs">{item.player}</span>
                    <span className="text-text-muted ml-1 text-xs">({item.matches} mat)</span>
                  </Link>
                </div>
              ))}

              {topFoursList.length > 1 && (
                <button
                  onClick={() => setShowTopFours(!showTopFours)}
                  className="text-accent-cyan text-xs mt-2 hover:underline cursor-pointer"
                >
                  {showTopFours ? 'Collapse \u25B2' : 'View Top 10 \u25BC'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Most Wickets */}
        <div className="bg-[#111118] border border-[#1E1E2A] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent-magenta/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-accent-magenta" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </div>
            <p className="text-xs uppercase tracking-wider text-text-muted font-medium">Most Wickets</p>
          </div>
          {bowlersLoading ? (
            <Loading message="Loading..." />
          ) : bowlersWithRank.length === 0 ? (
            <p className="text-text-muted text-sm">No data</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-text-muted font-mono text-xs w-5 text-right">#1</span>
                <Link to={`/bowling/${encodeURIComponent(bowlersWithRank[0].player)}`} className="hover:underline flex-1 min-w-0">
                  <span className="text-xl font-heading font-bold text-accent-magenta stat-glow-magenta">
                    {bowlersWithRank[0].wickets}
                  </span>
                  <span className="text-text-secondary ml-2 text-sm">
                    {bowlersWithRank[0].player}
                  </span>
                  <span className="text-text-muted ml-1 text-xs">
                    ({bowlersWithRank[0].matches} mat)
                  </span>
                </Link>
              </div>

              {showTopWickets && bowlersWithRank.slice(1, 10).map((item, idx) => (
                <div key={item.player || idx} className="flex items-baseline gap-2 py-1.5 border-t border-[#1E1E2A]">
                  <span className="text-text-muted font-mono text-xs w-5 text-right">#{idx + 2}</span>
                  <Link to={`/bowling/${encodeURIComponent(item.player)}`} className="hover:underline flex-1 min-w-0">
                    <span className="font-mono font-bold text-accent-magenta text-sm">{item.wickets}</span>
                    <span className="text-text-secondary ml-2 text-xs">{item.player}</span>
                    <span className="text-text-muted ml-1 text-xs">({item.matches} mat)</span>
                  </Link>
                </div>
              ))}

              {bowlersWithRank.length > 1 && (
                <button
                  onClick={() => setShowTopWickets(!showTopWickets)}
                  className="text-accent-cyan text-xs mt-2 hover:underline cursor-pointer"
                >
                  {showTopWickets ? 'Collapse \u25B2' : 'View Top 10 \u25BC'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          CHARTS ROW: Most Wins + Title Winners
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Wins (All Teams) */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-accent-lime rounded-full" />
            <h2 className="text-xl font-heading font-bold text-text-primary">Most Wins (All Teams)</h2>
          </div>
          <div className="card">
            {mostWinsLoading ? (
              <Loading message="Loading team wins..." />
            ) : winsChartData.length === 0 ? (
              <p className="text-text-muted text-sm py-8 text-center">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(380, winsChartData.length * 36)}>
                <BarChart
                  data={winsChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fill: '#8888A0', fontSize: 11 }}
                    axisLine={{ stroke: '#2A2A3A' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="team"
                    width={60}
                    tick={{ fill: '#C8C8D8', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="rounded-lg px-3 py-2 text-xs shadow-xl border"
                          style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
                          <p className="text-text-primary font-semibold mb-0.5">{d.fullTeam}</p>
                          <p style={{ color: d.fill }}>
                            Wins: <span className="font-mono font-bold">{d.wins}</span>
                          </p>
                          <p className="text-text-secondary">
                            Matches: <span className="font-mono">{d.matches}</span> | Win%: <span className="font-mono">{formatDecimal(d.win_pct, 1)}%</span>
                          </p>
                        </div>
                      )
                    }}
                    cursor={{ fill: 'rgba(184,255,0,0.05)' }}
                  />
                  <Bar
                    dataKey="wins"
                    radius={[0, 4, 4, 0]}
                    barSize={22}
                    label={{
                      position: 'right',
                      fill: '#E8E8F0',
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                    }}
                  >
                    {winsChartData.map((entry, idx) => (
                      <rect key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* IPL Title Winners */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-accent-amber rounded-full" />
            <h2 className="text-xl font-heading font-bold text-text-primary">{tournament.shortName} Title Winners</h2>
          </div>
          <div className="card">
            {titleWinnersLoading ? (
              <Loading message="Loading title winners..." />
            ) : titleChartData.length === 0 ? (
              <p className="text-text-muted text-sm py-8 text-center">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(300, titleChartData.length * 44)}>
                <BarChart
                  data={titleChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fill: '#8888A0', fontSize: 11 }}
                    axisLine={{ stroke: '#2A2A3A' }}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="team"
                    width={60}
                    tick={{ fill: '#C8C8D8', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="rounded-lg px-3 py-2 text-xs shadow-xl border"
                          style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
                          <p className="text-text-primary font-semibold mb-0.5">{d.fullTeam}</p>
                          <p style={{ color: d.fill }}>
                            Titles: <span className="font-mono font-bold">{d.titles}</span>
                          </p>
                        </div>
                      )
                    }}
                    cursor={{ fill: 'rgba(255,184,0,0.05)' }}
                  />
                  <Bar
                    dataKey="titles"
                    radius={[0, 4, 4, 0]}
                    barSize={26}
                    label={{
                      position: 'right',
                      fill: '#E8E8F0',
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                    }}
                  >
                    {titleChartData.map((entry, idx) => (
                      <rect key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════
          TOP BATTERS: Chart + Table
          ═══════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-accent-lime rounded-full" />
            <h2 className="text-xl font-heading font-bold text-text-primary">Top Batters</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-mono">Sort by</span>
            <select value={batSort} onChange={e => setBatSort(e.target.value)}
              className="bg-bg-card border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-lime/50">
              {BAT_SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {battersLoading ? (
          <Loading message="Loading batting leaderboard..." />
        ) : (
          <>
            {/* Horizontal Bar Chart */}
            {batterChartData.length > 0 && (
              <div className="card mb-4">
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart
                    data={batterChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fill: '#8888A0', fontSize: 11 }}
                      axisLine={{ stroke: '#2A2A3A' }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: '#C8C8D8', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload
                        return (
                          <div className="rounded-lg px-3 py-2 text-xs shadow-xl border"
                            style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
                            <p className="text-text-primary font-semibold mb-0.5">{d.fullName}</p>
                            <p style={{ color: '#B8FF00' }}>
                              {batSortLabel}: <span className="font-mono font-bold">{['avg', 'sr', 'economy'].includes(batSort) ? formatDecimal(d.value) : formatNumber(d.value)}</span>
                            </p>
                            <p className="text-text-secondary">
                              Avg: <span className="font-mono">{formatDecimal(d.avg)}</span> | SR: <span className="font-mono">{formatDecimal(d.sr)}</span>
                            </p>
                          </div>
                        )
                      }}
                      cursor={{ fill: 'rgba(184,255,0,0.05)' }}
                    />
                    <Bar
                      dataKey="value"
                      radius={[0, 6, 6, 0]}
                      barSize={24}
                      label={{
                        position: 'right',
                        fill: '#E8E8F0',
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        formatter: (v) => ['avg', 'sr', 'economy'].includes(batSort) ? formatDecimal(v) : formatNumber(v),
                      }}
                    >
                      {batterChartData.map((_, idx) => (
                        <Cell key={idx} fill={BAT_BAR_COLORS[idx % BAT_BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <DataTable columns={battingColumns} data={battersWithRank} />
          </>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════
          TOP BOWLERS: Chart + Table
          ═══════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-accent-magenta rounded-full" />
            <h2 className="text-xl font-heading font-bold text-text-primary">Top Bowlers</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-mono">Sort by</span>
            <select value={bowlSort} onChange={e => setBowlSort(e.target.value)}
              className="bg-bg-card border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-magenta/50">
              {BOWL_SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {bowlersLoading ? (
          <Loading message="Loading bowling leaderboard..." />
        ) : (
          <>
            {/* Horizontal Bar Chart */}
            {bowlerChartData.length > 0 && (
              <div className="card mb-4">
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart
                    data={bowlerChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fill: '#8888A0', fontSize: 11 }}
                      axisLine={{ stroke: '#2A2A3A' }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: '#C8C8D8', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload
                        return (
                          <div className="rounded-lg px-3 py-2 text-xs shadow-xl border"
                            style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
                            <p className="text-text-primary font-semibold mb-0.5">{d.fullName}</p>
                            <p style={{ color: '#FF2D78' }}>
                              {bowlSortLabel}: <span className="font-mono font-bold">{['economy', 'avg', 'sr'].includes(bowlSort) ? formatDecimal(d.value) : d.value}</span>
                            </p>
                            <p className="text-text-secondary">
                              Econ: <span className="font-mono">{formatDecimal(d.economy)}</span>
                            </p>
                          </div>
                        )
                      }}
                      cursor={{ fill: 'rgba(255,45,120,0.05)' }}
                    />
                    <Bar
                      dataKey="value"
                      radius={[0, 6, 6, 0]}
                      barSize={24}
                      label={{
                        position: 'right',
                        fill: '#E8E8F0',
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        formatter: (v) => ['economy', 'avg', 'sr'].includes(bowlSort) ? formatDecimal(v) : v,
                      }}
                    >
                      {bowlerChartData.map((_, idx) => (
                        <Cell key={idx} fill={BOWL_BAR_COLORS[idx % BOWL_BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <DataTable columns={bowlingColumns} data={bowlersWithRank} />
          </>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════
          RECENT MATCHES with mini score bars
          ═══════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-6 bg-accent-cyan rounded-full" />
          <h2 className="text-xl font-heading font-bold text-text-primary">Recent Matches</h2>
        </div>
        {matchesLoading ? (
          <Loading message="Loading matches..." />
        ) : recentMatches.length === 0 ? (
          <p className="text-text-muted text-sm py-8 text-center">No matches found</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger-children">
            {recentMatches.map((match) => {
              // Score bar widths
              const t1Score = match.team1_score || 0
              const t2Score = match.team2_score || 0
              const maxScore = Math.max(t1Score, t2Score, 1)

              return (
                <Link
                  key={match.match_id}
                  to={`/matches/${match.match_id}`}
                  className="card group block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-text-muted text-xs font-mono">
                      {formatDate(match.date)}
                    </span>
                    {match.season && (
                      <span className="text-xs text-text-muted bg-bg-elevated px-2 py-0.5 rounded">
                        {match.season}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <TeamLogo team={match.team1} size={20} />
                    <p className="font-heading font-semibold text-text-primary text-sm">
                      {match.team1}
                      <span className="text-text-muted mx-2">vs</span>
                      {match.team2}
                    </p>
                    <TeamLogo team={match.team2} size={20} />
                  </div>

                  {/* Mini score bars */}
                  {(t1Score > 0 || t2Score > 0) && (
                    <div className="space-y-1.5 my-2">
                      <div className="flex items-center gap-2">
                        <span className="text-text-secondary text-xs w-8 text-right font-mono">{t1Score}</span>
                        <div className="flex-1 h-2 rounded-full bg-bg-elevated overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${(t1Score / maxScore) * 100}%`,
                              background: match.winner === match.team1 ? '#B8FF00' : '#8888A0',
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-text-secondary text-xs w-8 text-right font-mono">{t2Score}</span>
                        <div className="flex-1 h-2 rounded-full bg-bg-elevated overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${(t2Score / maxScore) * 100}%`,
                              background: match.winner === match.team2 ? '#B8FF00' : '#8888A0',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-accent-cyan text-xs mb-1">
                    {getMatchResult(match)}
                  </p>
                  {match.player_of_match && (
                    <p className="text-text-muted text-xs">
                      Player of Match:{' '}
                      <span className="text-accent-amber">{match.player_of_match}</span>
                    </p>
                  )}
                  {match.venue && (
                    <p className="text-text-muted text-xs mt-1 truncate">
                      {match.venue}{match.city ? `, ${match.city}` : ''}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
