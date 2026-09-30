import { Link, useParams } from 'react-router-dom'
import { useTournament } from '../contexts/TournamentContext'
import { useFetch } from '../hooks/useFetch'
import { getVenueStats, getVenueTopPerformers } from '../lib/api'
import SEO from '../components/SEO'
import { appUrl } from '../lib/site'
import { breadcrumbSchema } from '../lib/breadcrumbs'
import StatCard from '../components/ui/StatCard'
import DataTable from '../components/ui/DataTable'
import Loading from '../components/ui/Loading'
import { formatDecimal } from '../utils/format'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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

export default function VenueProfile() {
  const tournament = useTournament()
  const { venueName } = useParams()
  const decoded = decodeURIComponent(venueName)

  const { data: stats, loading: statsLoading, error: statsError } = useFetch(
    () => getVenueStats(decoded),
    [decoded]
  )

  const { data: performers, loading: perfLoading } = useFetch(
    () => getVenueTopPerformers(decoded),
    [decoded]
  )

  const canonicalPath = `/venues/${encodeURIComponent(decoded)}`
  const seoDescription = stats?.stats
    ? `${decoded} ${tournament.shortName} venue stats: ${stats.stats.matches} matches hosted, average first-innings score of ${formatDecimal(stats.stats.avg_1st_innings, 1)}, and ${stats.stats.bat_first_win_pct ? `${formatDecimal(stats.stats.bat_first_win_pct, 1)}% bat-first win rate` : 'detailed chase vs defend records'}. See top run-scorers, top wicket-takers, and full ground analytics on Crickrida.`
    : `${tournament.shortName} venue analytics, match history, top performers, and ground records for ${decoded}.`

  const venueSchema = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: decoded,
    url: `${appUrl(canonicalPath)}`,
    description: seoDescription,
  }

  const breadcrumbs = breadcrumbSchema([
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Venues', path: '/venues' },
    { name: decoded, path: canonicalPath },
  ])

  const seoEl = (
    <SEO
      title={`${decoded} — ${tournament.shortName} Venue Stats, Records & Analytics`}
      description={seoDescription}
      url={canonicalPath}
      type="place"
      schema={[venueSchema, breadcrumbs]}
    />
  )

  if (statsError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        {seoEl}
        <p className="text-danger font-heading text-lg">Failed to load venue</p>
        <p className="text-text-secondary text-sm">{statsError}</p>
      </div>
    )
  }

  const batterColumns = [
    { key: 'rank', label: '#', align: 'center' },
    {
      key: 'player',
      label: 'Player',
      render: (val) => (
        <Link
          to={`/batting/${encodeURIComponent(val)}`}
          className="text-accent-brand hover:underline"
        >
          {val}
        </Link>
      ),
    },
    { key: 'runs', label: 'Runs', align: 'right', render: (val) => <span className="font-mono font-semibold text-accent-teal">{val}</span> },
    { key: 'matches', label: 'Mat', align: 'right', render: (val) => <span className="font-mono">{val}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (val) => <span className="font-mono">{val ? formatDecimal(val, 1) : '-'}</span> },
  ]

  const bowlerColumns = [
    { key: 'rank', label: '#', align: 'center' },
    {
      key: 'player',
      label: 'Player',
      render: (val) => (
        <Link
          to={`/bowling/${encodeURIComponent(val)}`}
          className="text-accent-brand hover:underline"
        >
          {val}
        </Link>
      ),
    },
    { key: 'wickets', label: 'Wkts', align: 'right', render: (val) => <span className="font-mono font-semibold text-accent-magenta">{val}</span> },
    { key: 'matches', label: 'Mat', align: 'right', render: (val) => <span className="font-mono">{val}</span> },
    { key: 'economy', label: 'Econ', align: 'right', render: (val) => <span className="font-mono">{val ? formatDecimal(val, 1) : '-'}</span> },
  ]

  const topBatters = (performers?.top_batters || []).slice(0, 5).map((b, i) => ({ ...b, rank: i + 1 }))
  const topBowlers = (performers?.top_bowlers || []).slice(0, 5).map((b, i) => ({ ...b, rank: i + 1 }))

  return (
    <div className="space-y-8">
      {seoEl}
      {/* Header */}
      <div>
        <Link to="/venues" className="text-text-muted text-sm hover:text-accent-brand transition-colors mb-2 inline-block">
          &larr; All Venues
        </Link>
        <h1 className="text-3xl font-heading font-bold text-text-primary">{decoded}</h1>
        <div className="h-1 w-24 bg-accent-brand rounded-full mt-2" />
      </div>

      {/* Stats Row */}
      {statsLoading ? (
        <Loading message="Loading venue stats..." />
      ) : stats?.stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Matches" value={stats.stats.matches} color="cyan" />
          <StatCard label="Avg 1st Inn" value={formatDecimal(stats.stats.avg_1st_innings, 1)} color="lime" />
          <StatCard label="Avg 2nd Inn" value={formatDecimal(stats.stats.avg_2nd_innings, 1)} color="magenta" />
          <StatCard
            label="Bat First Win%"
            value={stats.stats.bat_first_win_pct ? `${formatDecimal(stats.stats.bat_first_win_pct, 1)}%` : '-'}
            color="amber"
          />
          <StatCard label="Highest Total" value={stats.stats.highest_total ?? '-'} color="lime" />
        </div>
      ) : null}

      {/* Bat First vs Chase Win % Bar */}
      {!statsLoading && stats?.stats?.bat_first_win_pct != null && (
        <div className="card">
          <h3 className="text-sm font-heading font-semibold text-text-secondary mb-3">Bat First vs Chase Success</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-secondary font-mono w-20 text-right">Bat First</span>
            <div className="flex-1 h-8 bg-[#22302B] rounded-full overflow-hidden flex">
              <div
                className="h-full flex items-center justify-center text-xs font-mono font-semibold transition-all duration-500"
                style={{
                  width: `${stats.stats.bat_first_win_pct}%`,
                  backgroundColor: '#FFB800',
                  color: '#0C1210',
                  minWidth: stats.stats.bat_first_win_pct > 5 ? undefined : '2rem',
                }}
              >
                {formatDecimal(stats.stats.bat_first_win_pct, 1)}%
              </div>
              <div
                className="h-full flex items-center justify-center text-xs font-mono font-semibold transition-all duration-500"
                style={{
                  width: `${100 - stats.stats.bat_first_win_pct}%`,
                  backgroundColor: '#C3F23B',
                  color: '#0C1210',
                  minWidth: (100 - stats.stats.bat_first_win_pct) > 5 ? undefined : '2rem',
                }}
              >
                {formatDecimal(100 - stats.stats.bat_first_win_pct, 1)}%
              </div>
            </div>
            <span className="text-xs text-text-secondary font-mono w-20">Chase</span>
          </div>
        </div>
      )}

      {/* Top Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Batters */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-accent-teal rounded-full" />
            <h2 className="text-xl font-heading font-bold text-text-primary">Top Batters</h2>
          </div>
          {!perfLoading && topBatters.length > 0 && (
            <div className="card mb-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={topBatters.map((b) => ({ name: b.player, runs: b.runs }))}

                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#22302B" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#9AA69F', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#22302B' }} tickLine={{ stroke: '#22302B' }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#9AA69F', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#22302B' }} tickLine={{ stroke: '#22302B' }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#22302B' }} />
                  <Bar dataKey="runs" fill="#2DD4BF" name="Runs" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {perfLoading ? (
            <Loading message="Loading top batters..." />
          ) : (
            <DataTable columns={batterColumns} data={topBatters} />
          )}
        </section>

        {/* Top Bowlers */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-accent-magenta rounded-full" />
            <h2 className="text-xl font-heading font-bold text-text-primary">Top Bowlers</h2>
          </div>
          {!perfLoading && topBowlers.length > 0 && (
            <div className="card mb-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={topBowlers.map((b) => ({ name: b.player, wickets: b.wickets }))}

                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#22302B" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#9AA69F', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#22302B' }} tickLine={{ stroke: '#22302B' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#9AA69F', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#22302B' }} tickLine={{ stroke: '#22302B' }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#22302B' }} />
                  <Bar dataKey="wickets" fill="#FF2D78" name="Wickets" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {perfLoading ? (
            <Loading message="Loading top bowlers..." />
          ) : (
            <DataTable columns={bowlerColumns} data={topBowlers} />
          )}
        </section>
      </div>
    </div>
  )
}
