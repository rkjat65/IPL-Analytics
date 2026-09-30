import { useState } from 'react'
import MakeCardButton from '../components/ui/MakeCardButton'
import { useTournament } from '../contexts/TournamentContext'
import { useParams, useLocation, Link } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import {
  getPlayerBatting,
  getPlayerBowling,
  getPlayerBattingMatchups,
  getPlayerBowlingMatchups,
  getPlayerSplits,
} from '../lib/api'
import { BattingSplits, BowlingSplits } from '../components/profile/PlayerSplits'
import SEO from '../components/SEO'
import { appUrl } from '../lib/site'
import { breadcrumbSchema } from '../lib/breadcrumbs'
import StatCard from '../components/ui/StatCard'
import PlayerAvatar from '../components/ui/PlayerAvatar'
import DataTable from '../components/ui/DataTable'
import Loading from '../components/ui/Loading'
import { formatNumber, formatDecimal, formatDate } from '../utils/format'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from 'recharts'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#16161F] border border-[#2A2A3A] rounded-lg px-3 py-2 shadow-lg">
      <p className="text-[#8888A0] text-xs mb-1 font-mono">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color || '#E8E8ED' }}>
          {entry.name}: <span className="font-mono font-semibold">{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
        </p>
      ))}
    </div>
  )
}

const PHASE_COLORS = { Powerplay: '#00E5FF', Middle: '#FFB800', Death: '#FF2D78' }
const PIE_COLORS = ['#00E5FF', '#FF2D78', '#B8FF00', '#FFB800', '#8B5CF6', '#22C55E', '#EF4444', '#6366F1']

const darkTooltipStyle = {
  contentStyle: { backgroundColor: '#111118', border: '1px solid #1E1E2A', borderRadius: 8, color: '#E8E8ED' },
  itemStyle: { color: '#E8E8ED' },
  labelStyle: { color: '#8888A0' },
}

export default function PlayerProfile() {
  const tournament = useTournament()
  const { playerName } = useParams()
  const location = useLocation()
  const fromBowling = location.pathname.startsWith('/bowling/')
  const decodedName = decodeURIComponent(playerName)

  const [activeTab, setActiveTab] = useState(fromBowling ? 'bowling' : 'batting')

  const { data: batting, loading: batLoad, error: batErr } = useFetch(
    () => getPlayerBatting(decodedName).catch(() => null),
    [decodedName]
  )
  const { data: bowling, loading: bowlLoad, error: bowlErr } = useFetch(
    () => getPlayerBowling(decodedName).catch(() => null),
    [decodedName]
  )
  const { data: batMatchups, loading: batMatchupsLoad } = useFetch(
    () => getPlayerBattingMatchups(decodedName).catch(() => null),
    [decodedName]
  )
  const { data: bowlMatchups, loading: bowlMatchupsLoad } = useFetch(
    () => getPlayerBowlingMatchups(decodedName).catch(() => null),
    [decodedName]
  )
  const { data: splits } = useFetch(
    () => getPlayerSplits(decodedName).catch(() => null),
    [decodedName]
  )

  const isLoading = batLoad || bowlLoad
  const hasBatting = batting?.career && batting.career.matches > 0
  const hasBowling = bowling?.career && bowling.career.matches > 0
  const identity = batting?.identity || bowling?.identity
  const displayName = identity?.name || decodedName
  const famousNames = identity?.famous_names || []

  // If the active tab has no data, switch to the other
  if (!isLoading && activeTab === 'batting' && !hasBatting && hasBowling) {
    setActiveTab('bowling')
  }
  if (!isLoading && activeTab === 'bowling' && !hasBowling && hasBatting) {
    setActiveTab('batting')
  }

  const canonicalPath = `/${fromBowling ? 'bowling' : 'batting'}/${encodeURIComponent(displayName)}`

  const seoDescriptionParts = []
  if (hasBatting) {
    const c = batting.career
    seoDescriptionParts.push(
      `${displayName} has scored ${formatNumber(c.runs)} runs in ${c.matches} ${tournament.shortName} matches at an average of ${formatDecimal(c.avg)} and strike rate of ${formatDecimal(c.sr)}.`
    )
  }
  if (hasBowling) {
    const c = bowling.career
    seoDescriptionParts.push(
      `As a bowler, ${displayName} has taken ${formatNumber(c.wickets)} wickets in ${c.matches} ${tournament.shortName} matches at an economy of ${formatDecimal(c.economy)}.`
    )
  }
  const seoDescription = seoDescriptionParts.length
    ? `${seoDescriptionParts.join(' ')} View full ${tournament.shortName} career stats, season-by-season records, and head-to-head matchups for ${displayName} on Crickrida.`
    : `${tournament.shortName} career statistics, batting and bowling records, and performance analysis for ${displayName}.`

  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: displayName,
    ...(famousNames.length ? { alternateName: famousNames } : {}),
    url: `${appUrl(canonicalPath)}`,
    description: seoDescription,
    ...(hasBatting || hasBowling
      ? {
          memberOf: {
            '@type': 'SportsOrganization',
            name: tournament.name,
            alternateName: tournament.shortName,
          },
        }
      : {}),
  }

  const breadcrumbs = breadcrumbSchema([
    { name: 'Dashboard', path: '/dashboard' },
    { name: fromBowling ? 'Bowling Records' : 'Batting Records', path: fromBowling ? '/bowling' : '/batting' },
    { name: displayName, path: canonicalPath },
  ])

  const seoEl = (
    <SEO
      title={`${displayName} — ${tournament.shortName} Stats, Records & Career Profile`}
      description={seoDescription}
      url={canonicalPath}
      type="profile"
      schema={[personSchema, breadcrumbs]}
    />
  )

  if (isLoading) return (<>{seoEl}<Loading message={`Loading ${decodedName}'s profile...`} /></>)

  if (!hasBatting && !hasBowling) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        {seoEl}
        <p className="text-danger font-heading text-lg">Player not found</p>
        <p className="text-text-secondary text-sm">No batting or bowling data for {decodedName}</p>
        <Link to="/batting" className="text-accent-cyan hover:underline text-sm">Back to Batting Records</Link>
      </div>
    )
  }

  const tabs = []
  if (hasBatting) tabs.push('batting')
  if (hasBowling) tabs.push('bowling')

  return (
    <div className="space-y-8">
      {seoEl}
      {/* Player Header */}
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <PlayerAvatar name={displayName} size={72} shape="circle" />
          <Link
            to="/image-credits"
            className="text-[10px] font-mono text-text-muted hover:text-accent-cyan hover:underline"
          >
            Image credits
          </Link>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-heading font-bold text-text-primary">{displayName}</h1>
          <p className="text-text-secondary text-sm mt-1">Career statistics and performance analysis</p>
          {famousNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3" aria-label="Famous names">
              <span className="text-xs font-mono uppercase tracking-wider text-text-muted">Also known as</span>
              {famousNames.map((name) => (
                <span key={name} className="rounded-full border border-accent-cyan/25 bg-accent-cyan/10 px-2.5 py-1 text-xs font-medium text-accent-cyan">
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
        <MakeCardButton params={{ t: 'player', player: displayName, type: fromBowling || !hasBatting ? 'bowling' : 'batting' }} />
      </div>

      {/* Tab Switcher */}
      {tabs.length > 1 && (
        <div className="flex gap-1 bg-bg-elevated rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-bg-card text-accent-cyan shadow-glow-cyan'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Batting Tab */}
      {activeTab === 'batting' && hasBatting && (
        <BattingTab batting={batting} matchups={batMatchups} matchupsLoading={batMatchupsLoad} splits={splits?.batting} />
      )}

      {/* Bowling Tab */}
      {activeTab === 'bowling' && hasBowling && (
        <BowlingTab bowling={bowling} matchups={bowlMatchups} matchupsLoading={bowlMatchupsLoad} splits={splits?.bowling} />
      )}
    </div>
  )
}

/* ===================== BATTING TAB ===================== */
function BattingTab({ batting, matchups, matchupsLoading, splits }) {
  const c = batting.career

  // Season columns
  const seasonCols = [
    { key: 'season', label: 'Season' },
    { key: 'innings', label: 'Inn', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono font-semibold text-accent-lime">{v}</span> },
    { key: 'avg', label: 'Avg', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
    { key: 'highest', label: 'HS', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'fours', label: '4s', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'sixes', label: '6s', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
  ]

  const vsTeamCols = [
    { key: 'opponent', label: 'Team' },
    { key: 'innings', label: 'Inn', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono font-semibold text-accent-lime">{v}</span> },
    { key: 'avg', label: 'Avg', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
  ]

  const recentCols = [
    { key: 'date', label: 'Date', render: (v) => <span className="font-mono text-text-secondary text-xs">{formatDate(v)}</span> },
    { key: 'opponent', label: 'vs' },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono font-semibold text-accent-lime">{v}</span> },
    { key: 'balls', label: 'Balls', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'fours', label: '4s', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'sixes', label: '6s', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
  ]

  const matchupCols = [
    { key: 'bowler', label: 'Bowler', render: (v) => <Link to={`/bowling/${encodeURIComponent(v)}`} className="text-accent-cyan hover:underline">{v}</Link> },
    { key: 'balls', label: 'Balls', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'dots', label: 'Dots', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'fours', label: '4s', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'sixes', label: '6s', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'dismissals', label: 'Outs', align: 'right', render: (v) => <span className="font-mono text-danger">{v}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
  ]

  const phaseData = (batting.phase_stats || []).map((p) => ({
    ...p,
    phase: p.phase || 'Unknown',
  }))

  const recent10 = (batting.recent_form || []).slice(0, 10)
  const matchupData = Array.isArray(matchups) ? matchups : []

  return (
    <div className="space-y-8">
      {/* Career Stats */}
      <Section title="Career Statistics" color="lime">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
          <StatCard label="Matches" value={formatNumber(c.matches)} color="cyan" />
          <StatCard label="Innings" value={formatNumber(c.innings)} color="cyan" />
          <StatCard label="Runs" value={formatNumber(c.runs)} color="lime" />
          <StatCard label="Average" value={formatDecimal(c.avg)} color="amber" />
          <StatCard label="Strike Rate" value={formatDecimal(c.sr)} color="magenta" />
          <StatCard label="Highest" value={c.highest || '-'} color="lime" />
          <StatCard label="50s" value={c.fifties ?? '-'} color="amber" />
          <StatCard label="100s" value={c.hundreds ?? '-'} color="magenta" />
        </div>
      </Section>

      {/* Season Runs Trend */}
      {batting.seasons?.length > 1 && (
        <Section title="Season Runs Trend" color="lime">
          <div className="card">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={batting.seasons} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="limeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#B8FF00" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#B8FF00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                <XAxis dataKey="season" tick={{ fill: '#8888A0', fontSize: 12, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#1E1E2A' }} tickLine={{ stroke: '#1E1E2A' }} />
                <YAxis tick={{ fill: '#8888A0', fontSize: 12, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#1E1E2A' }} tickLine={{ stroke: '#1E1E2A' }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ color: '#8888A0', fontSize: 12 }} formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>} />
                <Area type="monotone" dataKey="runs" stroke="#B8FF00" strokeWidth={2} fill="url(#limeGradient)" name="Runs" dot={{ r: 4, fill: '#B8FF00', stroke: '#0A0A0F', strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* Phase Performance */}
      {phaseData.length > 0 && (
        <Section title="Phase Performance" color="cyan">
          <div className="card">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={phaseData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                <XAxis dataKey="phase" tick={{ fill: '#8888A0', fontSize: 12 }} axisLine={{ stroke: '#1E1E2A' }} />
                <YAxis yAxisId="runs" tick={{ fill: '#8888A0', fontSize: 12 }} axisLine={{ stroke: '#1E1E2A' }} />
                <YAxis yAxisId="sr" orientation="right" tick={{ fill: '#8888A0', fontSize: 12 }} axisLine={{ stroke: '#1E1E2A' }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ color: '#8888A0', fontSize: 12 }} formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>} />
                <Bar yAxisId="runs" dataKey="runs" fill="#B8FF00" name="Runs" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#B8FF00', fontSize: 10, fontFamily: 'monospace' }} />
                <Bar yAxisId="sr" dataKey="sr" fill="#00E5FF" name="Strike Rate" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#00E5FF', fontSize: 10, fontFamily: 'monospace' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* Season Breakdown */}
      {batting.seasons?.length > 0 && (
        <Section title="Season Breakdown" color="lime">
          <DataTable columns={seasonCols} data={batting.seasons} />
        </Section>
      )}

      {/* vs Teams */}
      {batting.vs_teams?.length > 0 && (
        <Section title="vs Teams" color="amber">
          <DataTable columns={vsTeamCols} data={batting.vs_teams} />
        </Section>
      )}

      {/* Recent Form */}
      {recent10.length > 0 && (
        <Section title="Recent Form (Last 10 Innings)" color="cyan">
          <DataTable columns={recentCols} data={recent10} />
        </Section>
      )}

      {/* Position, venue, over and dismissal splits */}
      <BattingSplits splits={splits} />

      {/* Matchups */}
      <Section title="Top Matchups vs Bowlers" color="magenta">
        {matchupsLoading ? (
          <Loading message="Loading matchups..." />
        ) : matchupData.length > 0 ? (
          <DataTable columns={matchupCols} data={matchupData} />
        ) : (
          <p className="text-text-muted text-sm py-4 text-center">No matchup data available</p>
        )}
      </Section>
    </div>
  )
}

/* ===================== BOWLING TAB ===================== */
function BowlingTab({ bowling, matchups, matchupsLoading, splits }) {
  const c = bowling.career

  const seasonCols = [
    { key: 'season', label: 'Season' },
    { key: 'innings', label: 'Inn', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'wickets', label: 'Wkts', align: 'right', render: (v) => <span className="font-mono font-semibold text-accent-magenta">{v}</span> },
    { key: 'avg', label: 'Avg', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
    { key: 'economy', label: 'Econ', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
  ]

  const vsTeamCols = [
    { key: 'opponent', label: 'Team' },
    { key: 'innings', label: 'Inn', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'wickets', label: 'Wkts', align: 'right', render: (v) => <span className="font-mono font-semibold text-accent-magenta">{v}</span> },
    { key: 'avg', label: 'Avg', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
    { key: 'economy', label: 'Econ', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
  ]

  const matchupCols = [
    { key: 'batter', label: 'Batter', render: (v) => <Link to={`/batting/${encodeURIComponent(v)}`} className="text-accent-cyan hover:underline">{v}</Link> },
    { key: 'balls', label: 'Balls', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'dots', label: 'Dots', align: 'right', render: (v) => <span className="font-mono">{v}</span> },
    { key: 'wickets', label: 'Wkts', align: 'right', render: (v) => <span className="font-mono text-accent-magenta">{v}</span> },
    { key: 'economy', label: 'Econ', align: 'right', render: (v) => <span className="font-mono">{formatDecimal(v)}</span> },
  ]

  const phaseData = (bowling.phase_stats || []).map((p) => ({
    ...p,
    phase: p.phase || 'Unknown',
  }))

  const dismissalData = (bowling.dismissal_types || []).map((d) => ({
    name: d.dismissal_kind,
    value: d.count,
  }))
  const matchupData = Array.isArray(matchups) ? matchups : []

  return (
    <div className="space-y-8">
      {/* Career Stats */}
      <Section title="Career Statistics" color="magenta">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
          <StatCard label="Matches" value={formatNumber(c.matches)} color="cyan" />
          <StatCard label="Innings" value={formatNumber(c.innings)} color="cyan" />
          <StatCard label="Overs" value={formatDecimal(c.overs, 1)} color="cyan" />
          <StatCard label="Wickets" value={formatNumber(c.wickets)} color="magenta" />
          <StatCard label="Average" value={formatDecimal(c.avg)} color="amber" />
          <StatCard label="Economy" value={formatDecimal(c.economy)} color="lime" />
          <StatCard label="Strike Rate" value={formatDecimal(c.sr)} color="amber" />
          <StatCard label="BBI" value={c.best_figures || '-'} color="magenta" />
        </div>
      </Section>

      {/* Season Wickets Trend */}
      {bowling.seasons?.length > 1 && (
        <Section title="Season Wickets Trend" color="magenta">
          <div className="card">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={bowling.seasons} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="magentaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF2D78" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#FF2D78" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                <XAxis dataKey="season" tick={{ fill: '#8888A0', fontSize: 12, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#1E1E2A' }} tickLine={{ stroke: '#1E1E2A' }} />
                <YAxis tick={{ fill: '#8888A0', fontSize: 12, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#1E1E2A' }} tickLine={{ stroke: '#1E1E2A' }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ color: '#8888A0', fontSize: 12 }} formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>} />
                <Area type="monotone" dataKey="wickets" stroke="#FF2D78" strokeWidth={2} fill="url(#magentaGradient)" name="Wickets" dot={{ r: 4, fill: '#FF2D78', stroke: '#0A0A0F', strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* Phase Performance */}
      {phaseData.length > 0 && (
        <Section title="Phase Performance" color="cyan">
          <div className="card">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={phaseData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                <XAxis dataKey="phase" tick={{ fill: '#8888A0', fontSize: 12 }} axisLine={{ stroke: '#1E1E2A' }} />
                <YAxis yAxisId="econ" tick={{ fill: '#8888A0', fontSize: 12 }} axisLine={{ stroke: '#1E1E2A' }} />
                <YAxis yAxisId="wkts" orientation="right" tick={{ fill: '#8888A0', fontSize: 12 }} axisLine={{ stroke: '#1E1E2A' }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ color: '#8888A0', fontSize: 12 }} formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>} />
                <Bar yAxisId="econ" dataKey="economy" fill="#FFB800" name="Economy" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#FFB800', fontSize: 10, fontFamily: 'monospace' }} />
                <Bar yAxisId="wkts" dataKey="wickets" fill="#FF2D78" name="Wickets" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#FF2D78', fontSize: 10, fontFamily: 'monospace' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* Dismissal Types */}
      {dismissalData.length > 0 && (
        <Section title="Dismissal Types" color="magenta">
          <div className="card flex justify-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={dismissalData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name }) => `${name}`}
                >
                  {dismissalData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ color: '#8888A0', fontSize: 12 }}
                  formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* Season Breakdown */}
      {bowling.seasons?.length > 0 && (
        <Section title="Season Breakdown" color="magenta">
          <DataTable columns={seasonCols} data={bowling.seasons} />
        </Section>
      )}

      {/* vs Teams */}
      {bowling.vs_teams?.length > 0 && (
        <Section title="vs Teams" color="amber">
          <DataTable columns={vsTeamCols} data={bowling.vs_teams} />
        </Section>
      )}

      {/* Over and venue splits */}
      <BowlingSplits splits={splits} />

      {/* Matchups */}
      <Section title="Top Matchups vs Batters" color="lime">
        {matchupsLoading ? (
          <Loading message="Loading matchups..." />
        ) : matchupData.length > 0 ? (
          <DataTable columns={matchupCols} data={matchupData} />
        ) : (
          <p className="text-text-muted text-sm py-4 text-center">No matchup data available</p>
        )}
      </Section>
    </div>
  )
}

/* ===================== SECTION HELPER ===================== */
function Section({ title, color = 'cyan', children }) {
  const colorMap = {
    cyan: 'bg-accent-cyan',
    magenta: 'bg-accent-magenta',
    lime: 'bg-accent-lime',
    amber: 'bg-accent-amber',
  }
  return (
    <section className="animate-in">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-1 h-6 ${colorMap[color] || colorMap.cyan} rounded-full`} />
        <h2 className="text-xl font-heading font-bold text-text-primary">{title}</h2>
      </div>
      {children}
    </section>
  )
}
