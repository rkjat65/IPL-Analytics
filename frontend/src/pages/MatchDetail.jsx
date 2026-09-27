import { useState, useMemo } from 'react'
import { useTournament } from '../contexts/TournamentContext'
import { useParams, Link } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useFetch } from '../hooks/useFetch'
import { getMatch, getWinProbability } from '../lib/api'
import SEO, { SITE_URL } from '../components/SEO'
import { breadcrumbSchema } from '../lib/breadcrumbs'
import Loading from '../components/ui/Loading'
import Badge from '../components/ui/Badge'
import { formatDate, formatDecimal } from '../utils/format'
import { getTeamColor, getTeamAbbr } from '../constants/teams'

const TABS = ['Scorecard', 'Manhattan', 'Worm', 'Partnerships', 'Win Probability']

function ChartTooltip({ active, payload, label, extra }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-lg px-3 py-2 shadow-lg">
      <p className="text-text-secondary text-xs font-mono mb-1">{extra || `Over ${label}`}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: <span className="font-mono font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  )
}

function ManhattanTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-lg px-3 py-2 shadow-lg">
      <p className="text-text-secondary text-xs font-mono mb-1">Over {label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: <span className="font-mono font-semibold">{entry.value} runs</span>
          {entry.payload[`wickets_${entry.dataKey.split('_')[1]}`] > 0 && (
            <span className="text-danger ml-1">
              ({entry.payload[`wickets_${entry.dataKey.split('_')[1]}`]}W)
            </span>
          )}
        </p>
      ))}
    </div>
  )
}

export default function MatchDetail() {
  const tournament = useTournament()
  const { matchId } = useParams()
  const [activeTab, setActiveTab] = useState('Scorecard')

  const { data: matchData, loading, error } = useFetch(
    () => getMatch(matchId),
    [matchId]
  )

  const { data: winProbData } = useFetch(
    () => getWinProbability(matchId).catch(() => null),
    [matchId]
  )

  const match = matchData?.info
  const scorecards = matchData?.scorecards || []
  const oversData = matchData?.overs_data || []

  // Flatten scorecards into innings-level arrays for convenience
  const innings = scorecards.map((sc) => ({
    innings_number: sc.innings_number,
    batting_team: sc.batting_team,
    bowling_team: sc.bowling_team,
    total_runs: sc.total_runs,
    total_wickets: sc.total_wickets,
    total_balls: sc.total_balls,
  }))
  const batting = scorecards.flatMap((sc) => sc.batting || [])
  const bowling = scorecards.flatMap((sc) => (sc.bowling || []).map((b) => ({ ...b, runs: b.runs_conceded })))
  const partnerships = scorecards.flatMap((sc) => sc.partnerships || [])
  const fallOfWickets = scorecards.flatMap((sc) => sc.fall_of_wickets || [])
  const overs = oversData

  // Derive team colors
  const team1Color = match ? getTeamColor(match.team1) : '#00E5FF'
  const team2Color = match ? getTeamColor(match.team2) : '#FF00E5'

  // Build manhattan data
  const manhattanData = useMemo(() => {
    if (!overs.length) return []
    const overMap = {}
    for (let i = 1; i <= 20; i++) {
      overMap[i] = { over: i, runs_1: 0, runs_2: 0, wickets_1: 0, wickets_2: 0 }
    }
    overs.forEach((o) => {
      const key = o.innings_number === 1 ? '1' : '2'
      const overNum = o.over_number + 1 // API uses 0-indexed overs
      if (overMap[overNum]) {
        overMap[overNum][`runs_${key}`] = o.runs
        overMap[overNum][`wickets_${key}`] = o.wickets
      }
    })
    return Object.values(overMap)
  }, [overs])

  // Build worm data
  const wormData = useMemo(() => {
    if (!overs.length) return []
    const overMap = {}
    for (let i = 0; i <= 20; i++) {
      overMap[i] = { over: i }
    }
    overMap[0].cumulative_1 = 0
    overMap[0].cumulative_2 = 0
    overs.forEach((o) => {
      const key = o.innings_number === 1 ? '1' : '2'
      const overNum = o.over_number + 1 // API uses 0-indexed overs
      if (overMap[overNum]) {
        overMap[overNum][`cumulative_${key}`] = o.cumulative_runs
        if (o.wickets > 0) {
          overMap[overNum][`wicket_${key}`] = o.cumulative_runs
        }
      }
    })
    return Object.values(overMap)
  }, [overs])

  // Build partnership data
  const partnershipData = useMemo(() => {
    if (!partnerships.length) return []
    return partnerships.map((p, i) => ({
      ...p,
      batter1: p.pair ? p.pair.split(' & ')[0] : '',
      batter2: p.pair ? p.pair.split(' & ')[1] : '',
      label: `${getTeamAbbr(innings.find(inn => inn.innings_number === p.innings_number)?.batting_team || '')} - ${p.pair || ''}`,
      id: i,
    }))
  }, [partnerships, innings])

  // Win probability data
  const winProbChartData = useMemo(() => {
    const probabilities = winProbData?.probabilities
    if (!probabilities || !Array.isArray(probabilities) || !probabilities.length) return []
    return probabilities.map((d) => ({
      ...d,
      over: d.over_number,
      ball: d.ball_number,
      target: winProbData.target,
      total_runs: d.runs_scored,
      total_wickets: 10 - (d.wickets_in_hand || 0),
      ball_label: `${d.over_number}.${d.ball_number}`,
      win_prob: Math.round(d.win_probability * 100 * 10) / 10,
    }))
  }, [winProbData])

  if (loading) return <Loading message="Loading match details..." />

  if (error || !match) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-danger font-heading text-lg">Failed to load match</p>
        <p className="text-text-secondary text-sm">{error || 'Match not found'}</p>
        <Link to="/matches" className="text-accent-cyan hover:underline text-sm">
          Back to Matches
        </Link>
      </div>
    )
  }

  const canonicalPath = `/matches/${encodeURIComponent(matchId)}`
  const matchTitle = `${match.team1} vs ${match.team2}${match.season ? ` — ${tournament.shortName} ${match.season}` : ''}`
  const seoDescription = `${match.team1} vs ${match.team2}${match.venue ? ` at ${match.venue}` : ''}${match.date ? ` on ${formatDate(match.date)}` : ''}. ${
    match.winner
      ? `${match.winner} won by ${match.win_by_runs > 0 ? `${match.win_by_runs} runs` : `${match.win_by_wickets} wickets`}.`
      : (match.result || '')
  } Full scorecard, manhattan & worm charts, partnerships, and win-probability analysis on Crickrida.`

  const matchSchema = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: matchTitle,
    url: `${SITE_URL}${canonicalPath}`,
    description: seoDescription,
    sport: 'Cricket',
    startDate: match.date || undefined,
    location: match.venue
      ? { '@type': 'Place', name: `${match.venue}${match.city ? `, ${match.city}` : ''}` }
      : undefined,
    competitor: [
      { '@type': 'SportsTeam', name: match.team1 },
      { '@type': 'SportsTeam', name: match.team2 },
    ],
    ...(match.winner ? { winner: { '@type': 'SportsTeam', name: match.winner } } : {}),
  }

  const breadcrumbs = breadcrumbSchema([
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Matches', path: '/matches' },
    { name: matchTitle, path: canonicalPath },
  ])

  const seoEl = (
    <SEO
      title={matchTitle}
      description={seoDescription}
      url={canonicalPath}
      type="article"
      schema={[matchSchema, breadcrumbs]}
    />
  )

  const winnerColor = match.winner ? getTeamColor(match.winner) : null
  const resultText =
    !match.winner
      ? match.result || 'No Result'
      : match.win_by_runs > 0
      ? `${match.winner} won by ${match.win_by_runs} runs`
      : match.win_by_wickets > 0
      ? `${match.winner} won by ${match.win_by_wickets} wickets`
      : match.result || 'Result unknown'

  // Get innings info helper
  function getInningsScore(inningsNum) {
    const inn = innings.find((i) => i.innings_number === inningsNum)
    if (!inn) return null
    return inn
  }

  function renderScorecard() {
    return (
      <div className="space-y-8">
        {[1, 2].map((inningsNum) => {
          const inn = getInningsScore(inningsNum)
          if (!inn) return null

          const inningsBatting = batting
            .filter((b) => b.innings_number === inningsNum)
            .sort((a, b) => (a.position || 99) - (b.position || 99))
          const inningsBowling = bowling.filter((b) => b.innings_number === inningsNum)
          const inningsFow = fallOfWickets
            .filter((f) => f.innings_number === inningsNum)
            .sort((a, b) => a.wicket_number - b.wicket_number)

          const topScorer = inningsBatting.reduce((max, b) => (b.runs > (max?.runs || -1) ? b : max), null)
          const bestBowler = inningsBowling.reduce((max, b) => (b.wickets > (max?.wickets || -1) ? b : max), null)

          const teamColor = getTeamColor(inn.batting_team)
          const totalOvers = inn.total_balls ? `${Math.floor(inn.total_balls / 6)}${inn.total_balls % 6 ? '.' + (inn.total_balls % 6) : ''}` : '20'

          // Calculate extras from batting data
          const totalBattingRuns = inningsBatting.reduce((sum, b) => sum + (b.runs || 0), 0)
          const extras = (inn.total_runs || 0) - totalBattingRuns

          return (
            <div key={inningsNum} className="space-y-4 animate-in"
              style={{ animationDelay: `${(inningsNum - 1) * 150}ms` }}>
              {/* Innings Header */}
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 rounded-full" style={{ backgroundColor: teamColor }} />
                <div>
                  <h3 className="text-lg font-heading font-bold text-text-primary">
                    {inn.batting_team} Innings
                  </h3>
                  <p className="text-text-secondary text-sm font-mono">
                    {inn.total_runs}/{inn.total_wickets} ({totalOvers} ov)
                  </p>
                </div>
              </div>

              {/* Batting Table */}
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-bg-elevated border-b border-border-subtle">
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-left">Batter</th>
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-left">Dismissal</th>
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-right">R</th>
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-right">B</th>
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-right">4s</th>
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-right">6s</th>
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-right">SR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inningsBatting.map((b, i) => {
                      const isTopScorer = topScorer && b.batter === topScorer.batter
                      return (
                        <tr
                          key={b.batter + i}
                          className={`border-b border-border-subtle transition-colors hover:bg-bg-card-hover ${
                            i % 2 === 1 ? 'bg-bg-card/50' : ''
                          } ${isTopScorer ? 'bg-accent-cyan/5' : ''}`}
                        >
                          <td className="px-4 py-2.5 text-text-primary font-medium whitespace-nowrap">
                            <Link
                              to={`/batting/${encodeURIComponent(b.batter)}`}
                              className={`hover:underline ${isTopScorer ? 'text-accent-cyan' : ''}`}
                            >
                              {b.batter}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-text-secondary text-xs max-w-[200px] truncate">
                            {b.dismissal || 'not out'}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono font-semibold ${
                            isTopScorer ? 'text-accent-cyan' : 'text-text-primary'
                          }`}>
                            {b.runs}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{b.balls}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{b.fours}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{b.sixes}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                            {formatDecimal(b.strike_rate, 1)}
                          </td>
                        </tr>
                      )
                    })}
                    {/* Extras */}
                    {extras > 0 && (
                      <tr className="border-b border-border-subtle bg-bg-elevated/50">
                        <td className="px-4 py-2 text-text-muted text-xs" colSpan={2}>Extras</td>
                        <td className="px-4 py-2 text-right font-mono text-text-secondary text-xs">{extras}</td>
                        <td colSpan={4} />
                      </tr>
                    )}
                    {/* Total */}
                    <tr className="bg-bg-elevated font-semibold">
                      <td className="px-4 py-2.5 text-text-primary" colSpan={2}>Total</td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-primary">{inn.total_runs}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                        {inningsBatting.reduce((s, b) => s + (b.balls || 0), 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                        {inningsBatting.reduce((s, b) => s + (b.fours || 0), 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                        {inningsBatting.reduce((s, b) => s + (b.sixes || 0), 0)}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Bowling Table */}
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-bg-elevated border-b border-border-subtle">
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-left">Bowler</th>
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-right">O</th>
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-right">M</th>
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-right">R</th>
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-right">W</th>
                      <th className="px-4 py-2.5 font-medium text-text-muted text-xs uppercase tracking-wider text-right">Econ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inningsBowling.map((b, i) => {
                      const isBest = bestBowler && b.bowler === bestBowler.bowler
                      return (
                        <tr
                          key={b.bowler + i}
                          className={`border-b border-border-subtle transition-colors hover:bg-bg-card-hover ${
                            i % 2 === 1 ? 'bg-bg-card/50' : ''
                          } ${isBest ? 'bg-accent-magenta/5' : ''}`}
                        >
                          <td className="px-4 py-2.5 text-text-primary font-medium whitespace-nowrap">
                            <Link
                              to={`/bowling/${encodeURIComponent(b.bowler)}`}
                              className={`hover:underline ${isBest ? 'text-accent-magenta' : ''}`}
                            >
                              {b.bowler}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{b.overs}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{b.maidens}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{b.runs}</td>
                          <td className={`px-4 py-2.5 text-right font-mono font-semibold ${
                            isBest ? 'text-accent-magenta' : 'text-text-primary'
                          }`}>
                            {b.wickets}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                            {formatDecimal(b.economy, 1)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Fall of Wickets */}
              {inningsFow.length > 0 && (
                <div className="card">
                  <p className="text-xs uppercase tracking-wider text-text-muted font-medium mb-2">Fall of Wickets</p>
                  <p className="text-text-secondary text-sm font-mono leading-relaxed">
                    {inningsFow.map((f, i) => (
                      <span key={i}>
                        {i > 0 && <span className="text-text-muted">, </span>}
                        <span className="text-text-primary">{f.wicket_number}-{f.score}</span>
                        <span className="text-text-muted"> ({f.player_dismissed}, {f.over_ball} ov)</span>
                      </span>
                    ))}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  function renderManhattan() {
    if (!manhattanData.length) {
      return <p className="text-text-muted text-sm py-12 text-center">No over-by-over data available.</p>
    }

    const inn1 = getInningsScore(1)
    const inn2 = getInningsScore(2)
    const team1Name = inn1 ? getTeamAbbr(inn1.batting_team) : 'Inn 1'
    const team2Name = inn2 ? getTeamAbbr(inn2.batting_team) : 'Inn 2'
    const color1 = inn1 ? getTeamColor(inn1.batting_team) : team1Color
    const color2 = inn2 ? getTeamColor(inn2.batting_team) : team2Color

    return (
      <div className="card">
        <h3 className="text-lg font-heading font-bold text-text-primary mb-4">Manhattan Chart</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={manhattanData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" vertical={false} />
              <XAxis
                dataKey="over"
                tick={{ fill: '#8888A0', fontSize: 12 }}
                axisLine={{ stroke: '#1E1E2A' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#8888A0', fontSize: 12 }}
                axisLine={{ stroke: '#1E1E2A' }}
                tickLine={false}
              />
              <Tooltip content={<ManhattanTooltip />} />
              <Legend
                wrapperStyle={{ color: '#8888A0', fontSize: 12 }}
              />
              <Bar dataKey="runs_1" name={team1Name} fill={color1} radius={[2, 2, 0, 0]} />
              {inn2 && <Bar dataKey="runs_2" name={team2Name} fill={color2} radius={[2, 2, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  function renderWorm() {
    if (!wormData.length) {
      return <p className="text-text-muted text-sm py-12 text-center">No over-by-over data available.</p>
    }

    const inn1 = getInningsScore(1)
    const inn2 = getInningsScore(2)
    const team1Name = inn1 ? getTeamAbbr(inn1.batting_team) : 'Inn 1'
    const team2Name = inn2 ? getTeamAbbr(inn2.batting_team) : 'Inn 2'
    const color1 = inn1 ? getTeamColor(inn1.batting_team) : team1Color
    const color2 = inn2 ? getTeamColor(inn2.batting_team) : team2Color

    return (
      <div className="card">
        <h3 className="text-lg font-heading font-bold text-text-primary mb-4">Worm Chart</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={wormData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" vertical={false} />
              <XAxis
                dataKey="over"
                tick={{ fill: '#8888A0', fontSize: 12 }}
                axisLine={{ stroke: '#1E1E2A' }}
                tickLine={false}
                label={{ value: 'Over', position: 'insideBottomRight', offset: -5, fill: '#8888A0', fontSize: 12 }}
              />
              <YAxis
                tick={{ fill: '#8888A0', fontSize: 12 }}
                axisLine={{ stroke: '#1E1E2A' }}
                tickLine={false}
                label={{ value: 'Runs', angle: -90, position: 'insideLeft', fill: '#8888A0', fontSize: 12 }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ color: '#8888A0', fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="cumulative_1"
                name={team1Name}
                stroke={color1}
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
              {/* Wicket markers for innings 1 */}
              <Line
                type="monotone"
                dataKey="wicket_1"
                name={`${team1Name} Wickets`}
                stroke={color1}
                strokeWidth={0}
                dot={{ fill: color1, stroke: '#fff', strokeWidth: 2, r: 5 }}
                connectNulls={false}
                legendType="none"
              />
              {inn2 && (
                <>
                  <Line
                    type="monotone"
                    dataKey="cumulative_2"
                    name={team2Name}
                    stroke={color2}
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="wicket_2"
                    name={`${team2Name} Wickets`}
                    stroke={color2}
                    strokeWidth={0}
                    dot={{ fill: color2, stroke: '#fff', strokeWidth: 2, r: 5 }}
                    connectNulls={false}
                    legendType="none"
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  function renderPartnerships() {
    if (!partnershipData.length) {
      return <p className="text-text-muted text-sm py-12 text-center">No partnership data available.</p>
    }

    const inn1 = getInningsScore(1)
    const inn2 = getInningsScore(2)
    const color1 = inn1 ? getTeamColor(inn1.batting_team) : team1Color
    const color2 = inn2 ? getTeamColor(inn2.batting_team) : team2Color

    // Group by innings
    const inn1Partnerships = partnershipData.filter((p) => p.innings_number === 1)
    const inn2Partnerships = partnershipData.filter((p) => p.innings_number === 2)

    function renderPartnershipSection(pData, inningsNum, teamColor, teamName) {
      if (!pData.length) return null
      const maxRuns = Math.max(...partnershipData.map((p) => p.runs || 0), 1)

      return (
        <div className="space-y-3">
          <h4 className="text-sm font-heading font-semibold text-text-primary flex items-center gap-2">
            <span className="w-1 h-5 rounded-full" style={{ backgroundColor: teamColor }} />
            {teamName} Innings
          </h4>
          <div className="space-y-2">
            {pData.map((p, i) => {
              const widthPct = maxRuns > 0 ? Math.max((p.runs / maxRuns) * 100, 2) : 2
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-32 sm:w-44 text-right">
                    <span className="text-text-secondary text-xs font-mono truncate block">
                      {p.batter1} & {p.batter2}
                    </span>
                  </div>
                  <div className="flex-1 h-6 bg-bg-elevated rounded relative overflow-hidden">
                    <div
                      className="h-full rounded flex items-center justify-end pr-2 transition-all"
                      style={{ width: `${widthPct}%`, backgroundColor: teamColor + 'CC' }}
                    >
                      <span className="text-xs font-mono font-semibold text-white drop-shadow">
                        {p.runs}
                      </span>
                    </div>
                  </div>
                  <div className="w-20 text-xs text-text-muted font-mono">
                    {p.balls ? `${p.balls}b` : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <div className="card space-y-6">
        <h3 className="text-lg font-heading font-bold text-text-primary">Partnerships</h3>
        {renderPartnershipSection(inn1Partnerships, 1, color1, inn1 ? inn1.batting_team : 'Innings 1')}
        {renderPartnershipSection(inn2Partnerships, 2, color2, inn2 ? inn2.batting_team : 'Innings 2')}
      </div>
    )
  }

  function renderWinProbability() {
    if (!winProbChartData.length) {
      return <p className="text-text-muted text-sm py-12 text-center">Win probability data not available for this match.</p>
    }

    const inn2 = innings.find((i) => i.innings_number === 2)
    const battingTeam = inn2?.batting_team || ''
    const battingColor = getTeamColor(battingTeam)

    return (
      <div className="card">
        <h3 className="text-lg font-heading font-bold text-text-primary mb-1">Win Probability</h3>
        <p className="text-text-secondary text-xs mb-4">
          {getTeamAbbr(battingTeam)} batting in 2nd innings (chasing {winProbData?.target || '?'})
        </p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={winProbChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="winProbGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={battingColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={battingColor} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" vertical={false} />
              <XAxis
                dataKey="ball_label"
                tick={{ fill: '#8888A0', fontSize: 10 }}
                axisLine={{ stroke: '#1E1E2A' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#8888A0', fontSize: 12 }}
                axisLine={{ stroke: '#1E1E2A' }}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div className="bg-bg-elevated border border-border-subtle rounded-lg px-3 py-2 shadow-lg">
                      <p className="text-text-secondary text-xs font-mono mb-1">
                        Over {d.over}.{d.ball}
                      </p>
                      <p className="text-xs" style={{ color: battingColor }}>
                        {getTeamAbbr(battingTeam)} Win: <span className="font-mono font-semibold">{d.win_prob}%</span>
                      </p>
                      <p className="text-text-muted text-xs mt-1">
                        Score: {d.total_runs}/{d.total_wickets}
                        {d.runs_scored > 0 && <span className="text-accent-lime ml-1">+{d.runs_scored}</span>}
                      </p>
                    </div>
                  )
                }}
              />
              <ReferenceLine y={50} stroke="#8888A0" strokeDasharray="6 4" strokeOpacity={0.5} />
              <Area
                type="monotone"
                dataKey="win_prob"
                name={`${getTeamAbbr(battingTeam)} Win %`}
                stroke={battingColor}
                strokeWidth={2}
                fill="url(#winProbGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {seoEl}
      {/* Back link */}
      <Link to="/matches" className="text-text-muted hover:text-accent-cyan text-sm inline-flex items-center gap-1 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to Matches
      </Link>

      {/* Match Header */}
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-text-primary">
              <span style={{ color: team1Color }}>{getTeamAbbr(match.team1)}</span>
              <span className="text-text-muted mx-3">vs</span>
              <span style={{ color: team2Color }}>{getTeamAbbr(match.team2)}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-text-secondary text-sm">
              <span className="font-mono">{formatDate(match.date)}</span>
              {match.season && (
                <Badge text={`Season ${match.season}`} color="muted" />
              )}
            </div>
          </div>
          {/* Score summary */}
          <div className="flex items-center gap-4">
            {innings.map((inn) => (
              <div key={inn.innings_number} className="text-center">
                <p className="text-xs text-text-muted font-medium">
                  {getTeamAbbr(inn.batting_team)}
                </p>
                <p className="text-xl font-heading font-bold text-text-primary font-mono">
                  {inn.total_runs}/{inn.total_wickets}
                </p>
                <p className="text-xs text-text-muted font-mono">
                  ({inn.total_balls ? `${Math.floor(inn.total_balls / 6)}${inn.total_balls % 6 ? '.' + (inn.total_balls % 6) : ''}` : '20'} ov)
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Result Banner */}
        <div
          className="rounded-lg px-4 py-3 flex items-center gap-3"
          style={{
            backgroundColor: winnerColor ? winnerColor + '15' : 'rgba(136, 136, 160, 0.1)',
            borderLeft: `4px solid ${winnerColor || '#8888A0'}`,
          }}
        >
          <p className="text-text-primary font-heading font-semibold text-sm">
            {resultText}
          </p>
        </div>

        {/* Match Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          {match.venue && (
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wider mb-0.5">Venue</p>
              <p className="text-text-secondary">
                {match.venue}{match.city ? `, ${match.city}` : ''}
              </p>
            </div>
          )}
          {match.toss_winner && (
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wider mb-0.5">Toss</p>
              <p className="text-text-secondary">
                {match.toss_winner} chose to {match.toss_decision}
              </p>
            </div>
          )}
          {match.player_of_match && (
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wider mb-0.5">Player of Match</p>
              <p className="text-accent-amber font-medium">{match.player_of_match}</p>
            </div>
          )}
          {match.umpire1 && (
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wider mb-0.5">Umpires</p>
              <p className="text-text-secondary">
                {match.umpire1}{match.umpire2 ? `, ${match.umpire2}` : ''}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle pb-px">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-body whitespace-nowrap transition-colors relative ${
              activeTab === tab
                ? 'text-accent-cyan font-medium'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-cyan rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'Scorecard' && renderScorecard()}
        {activeTab === 'Manhattan' && renderManhattan()}
        {activeTab === 'Worm' && renderWorm()}
        {activeTab === 'Partnerships' && renderPartnerships()}
        {activeTab === 'Win Probability' && renderWinProbability()}
      </div>
    </div>
  )
}
