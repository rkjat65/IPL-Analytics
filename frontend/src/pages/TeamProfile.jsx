import { Link, useParams } from 'react-router-dom'
import MakeCardButton from '../components/ui/MakeCardButton'
import { useTournament } from '../contexts/TournamentContext'
import { useFetch } from '../hooks/useFetch'
import { getTeamStats, getTeamSeasons, getTeamH2H, getTeams } from '../lib/api'
import SEO from '../components/SEO'
import { appUrl } from '../lib/site'
import { breadcrumbSchema } from '../lib/breadcrumbs'
import StatCard from '../components/ui/StatCard'
import DataTable from '../components/ui/DataTable'
import Loading from '../components/ui/Loading'
import { formatNumber, formatDecimal } from '../utils/format'
import { getTeamColor, getTeamAbbr, getTeamLogo } from '../constants/teams'
import TeamLogo from '../components/ui/TeamLogo'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#17211F] border border-[#2E3F39] rounded-lg px-3 py-2 shadow-lg">
      <p className="text-[#9AA69F] text-xs mb-1 font-mono">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color || '#F3F4EE' }}>
          {entry.name}: <span className="font-mono font-semibold">{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function TeamProfile() {
  const tournament = useTournament()
  const { teamName } = useParams()
  const decoded = decodeURIComponent(teamName)
  const color = getTeamColor(decoded)

  const { data: stats, loading: statsLoading, error: statsError } = useFetch(
    () => getTeamStats(decoded),
    [decoded]
  )

  const { data: seasons, loading: seasonsLoading } = useFetch(
    () => getTeamSeasons(decoded),
    [decoded]
  )

  const { data: h2h, loading: h2hLoading } = useFetch(
    () => getTeamH2H(decoded),
    [decoded]
  )

  const { data: teams } = useFetch(() => getTeams(), [])

  const canonicalPath = `/teams/${encodeURIComponent(decoded)}`
  const seoDescription = stats
    ? `${decoded} ${tournament.shortName} stats: ${formatNumber(stats.matches)} matches played, ${formatNumber(stats.wins)} wins, ${formatNumber(stats.losses)} losses${stats.titles ? `, and ${stats.titles} ${tournament.shortName} title${stats.titles > 1 ? 's' : ''}` : ''}. Explore ${decoded}'s season-by-season performance, head-to-head records, and franchise history on Crickrida.`
    : `${tournament.shortName} team profile, match records, season history, and head-to-head stats for ${decoded}.`

  const teamSchema = {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: decoded,
    url: `${appUrl(canonicalPath)}`,
    description: seoDescription,
    sport: 'Cricket',
    memberOf: {
      '@type': 'SportsOrganization',
      name: tournament.name,
      alternateName: tournament.shortName,
    },
  }

  const breadcrumbs = breadcrumbSchema([
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Teams', path: '/teams' },
    { name: decoded, path: canonicalPath },
  ])

  const seoEl = (
    <SEO
      title={`${decoded} — ${tournament.shortName} Team Profile, Stats & Records`}
      description={seoDescription}
      url={canonicalPath}
      type="profile"
      schema={[teamSchema, breadcrumbs]}
    />
  )

  if (statsError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        {seoEl}
        <p className="text-danger font-heading text-lg">Failed to load team profile</p>
        <p className="text-text-secondary text-sm">{statsError}</p>
      </div>
    )
  }

  const seasonColumns = [
    { key: 'season', label: 'Season' },
    { key: 'matches', label: 'Mat', align: 'right', render: (val) => <span className="font-mono">{val}</span> },
    { key: 'wins', label: 'W', align: 'right', render: (val) => <span className="font-mono text-accent-teal">{val}</span> },
    { key: 'losses', label: 'L', align: 'right', render: (val) => <span className="font-mono text-danger">{val}</span> },
    { key: 'ties', label: 'T', align: 'right', render: (val) => <span className="font-mono text-accent-amber">{val || 0}</span> },
    { key: 'no_results', label: 'NR', align: 'right', render: (val) => <span className="font-mono text-text-muted">{val || 0}</span> },
    {
      key: 'win_pct',
      label: 'Win%',
      align: 'right',
      render: (val) => <span className="font-mono font-semibold text-accent-brand">{formatDecimal(val, 1)}%</span>,
    },
  ]

  const h2hData = (h2h || []).slice().sort((a, b) => b.played - a.played)
  const h2hColumns = [
    {
      key: 'opponent',
      label: 'Opponent',
      render: (val) => (
        <div className="flex items-center gap-2">
          <TeamLogo team={val} size={22} />
          <Link to={`/teams/${encodeURIComponent(val)}`} className="text-accent-brand hover:underline">
            {val}
          </Link>
        </div>
      ),
    },
    { key: 'played', label: 'Played', align: 'right', render: (val) => <span className="font-mono">{val}</span> },
    { key: 'won', label: 'Won', align: 'right', render: (val) => <span className="font-mono text-accent-teal">{val}</span> },
    { key: 'lost', label: 'Lost', align: 'right', render: (val) => <span className="font-mono text-danger">{val}</span> },
    {
      key: 'win_pct',
      label: 'Win%',
      align: 'right',
      render: (val) => <span className="font-mono font-semibold text-accent-brand">{formatDecimal(val, 1)}%</span>,
    },
  ]

  // Pick a random other team for compare link
  const otherTeams = (teams || []).filter((t) => t !== decoded)

  return (
    <div className="space-y-8">
      {seoEl}
      {/* Header */}
      <div>
        <Link to="/teams" className="text-text-muted text-sm hover:text-accent-brand transition-colors mb-2 inline-block">
          &larr; All Teams
        </Link>
        <div className="flex items-center gap-4 mt-1">
          <TeamLogo team={decoded} size={56} />
          <div>
            <h1 className="text-3xl font-heading font-bold" style={{ color }}>
              {decoded}
            </h1>
            <div className="h-1 w-24 rounded-full mt-2" style={{ backgroundColor: color }} />
            <MakeCardButton className="mt-3" label="Make a form card" params={{ t: 'team_form', team: decoded }} />
          </div>
        </div>
      </div>

      {/* Stats Row */}
      {statsLoading ? (
        <Loading message="Loading team stats..." />
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <StatCard label="Matches" value={formatNumber(stats.matches)} color="cyan" />
          <StatCard label="Wins" value={formatNumber(stats.wins)} color="lime" />
          <StatCard label="Losses" value={formatNumber(stats.losses)} color="magenta" />
          {stats.ties > 0 && <StatCard label="Super Overs" value={formatNumber(stats.ties)} color="amber" />}
          {stats.no_results > 0 && <StatCard label="No Result" value={formatNumber(stats.no_results)} color="cyan" />}
          <StatCard label="Win %" value={`${formatDecimal(stats.win_pct, 1)}%`} color="cyan" />
          <StatCard label="Titles" value={stats.titles ?? '-'} color="amber" />
          <StatCard label="Avg Score" value={formatDecimal(stats.avg_score, 1)} color="lime" />
        </div>
      ) : null}

      {/* Season Record */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-6 rounded-full" style={{ backgroundColor: color }} />
          <h2 className="text-xl font-heading font-bold text-text-primary">Season Record</h2>
        </div>

        {/* Season Win/Loss Chart */}
        {!seasonsLoading && (seasons || []).length > 0 && (
          <div className="card mb-6">
            <h3 className="text-sm font-heading font-semibold text-text-secondary mb-3">Wins &amp; Losses by Season</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={seasons} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#22302B" />
                <XAxis
                  dataKey="season"
                  tick={{ fill: '#9AA69F', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: '#22302B' }}
                  tickLine={{ stroke: '#22302B' }}
                />
                <YAxis
                  tick={{ fill: '#9AA69F', fontSize: 12, fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: '#22302B' }}
                  tickLine={{ stroke: '#22302B' }}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#22302B' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="wins" stackId="wl" fill="#22C55E" name="Wins" radius={[0, 0, 0, 0]} />
                <Bar dataKey="losses" stackId="wl" fill="#EF4444" name="Losses" radius={[0, 0, 0, 0]} />
                <Bar dataKey="ties" stackId="wl" fill="#FFB800" name="Ties (SO)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="no_results" stackId="wl" fill="#6B7280" name="No Result" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Win % Trend Line */}
        {!seasonsLoading && (seasons || []).length > 1 && (
          <div className="card mb-6">
            <h3 className="text-sm font-heading font-semibold text-text-secondary mb-3">Win % Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={seasons} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="winPctGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#22302B" />
                <XAxis dataKey="season" tick={{ fill: '#9AA69F', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#22302B' }} tickLine={{ stroke: '#22302B' }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#9AA69F', fontSize: 11 }} axisLine={{ stroke: '#22302B' }} tickLine={{ stroke: '#22302B' }} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: color, strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="win_pct" stroke={color} strokeWidth={2} fill="url(#winPctGrad)" name="Win %" dot={{ fill: color, r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {seasonsLoading ? (
          <Loading message="Loading season records..." />
        ) : (
          <DataTable columns={seasonColumns} data={seasons || []} />
        )}
      </section>

      {/* Head-to-Head Matrix */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-6 rounded-full" style={{ backgroundColor: color }} />
          <h2 className="text-xl font-heading font-bold text-text-primary">Head-to-Head Record</h2>
        </div>

        {/* H2H Horizontal Bar Chart */}
        {!h2hLoading && h2hData.length > 0 && (
          <div className="card mb-6">
            <h3 className="text-sm font-heading font-semibold text-text-secondary mb-3">Wins vs Each Opponent</h3>
            <ResponsiveContainer width="100%" height={Math.max(250, h2hData.length * 32)}>
              <BarChart
                data={h2hData.map((h) => ({ name: getTeamAbbr(h.opponent), won: h.won, lost: h.lost, opponent: h.opponent })).reverse()}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#22302B" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: '#9AA69F', fontSize: 12, fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: '#22302B' }}
                  tickLine={{ stroke: '#22302B' }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={55}
                  tick={{ fill: '#9AA69F', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: '#22302B' }}
                  tickLine={{ stroke: '#22302B' }}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#22302B' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="won" stackId="h2h" fill="#22C55E" name="Won" radius={[0, 0, 0, 0]} barSize={16} />
                <Bar dataKey="lost" stackId="h2h" fill="#EF4444" name="Lost" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {h2hLoading ? (
          <Loading message="Loading head-to-head records..." />
        ) : (
          <DataTable columns={h2hColumns} data={h2hData} />
        )}
      </section>

      {/* Compare CTA */}
      {otherTeams.length > 0 && (
        <div className="card border-accent-brand/20">
          <p className="text-text-secondary text-sm mb-3">
            Compare {decoded} with another team
          </p>
          <Link
            to={`/h2h?team1=${encodeURIComponent(decoded)}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent-brand/10 text-accent-brand border border-accent-brand/20 rounded-md text-sm font-medium hover:bg-accent-brand/20 transition-colors"
          >
            Head to Head Comparison &rarr;
          </Link>
        </div>
      )}
    </div>
  )
}
