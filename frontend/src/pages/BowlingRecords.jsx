import { useState, useRef, useCallback } from 'react'
import useUrlState from '../hooks/useUrlState'
import MakeCardButton from '../components/ui/MakeCardButton'
import { Link } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import { getBowlingLeaderboard, getSeasons, getTeams } from '../lib/api'
import SEO from '../components/SEO'
import DataTable from '../components/ui/DataTable'
import Select from '../components/ui/Select'
import Loading from '../components/ui/Loading'
import MultiSeasonSelect from '../components/ui/MultiSeasonSelect'
import { useTournament } from '../contexts/TournamentContext'
import { formatDecimal } from '../utils/format'
import PlayerAvatar from '../components/ui/PlayerAvatar'
import { exportAsImage, downloadImage } from '../utils/exportCard'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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

const SORT_OPTIONS = [
  { value: 'wickets', label: 'Wickets' },
  { value: 'avg', label: 'Average' },
  { value: 'economy', label: 'Economy' },
  { value: 'sr', label: 'Strike Rate' },
  { value: 'five_wickets', label: '5W Hauls' },
  { value: 'four_wickets', label: '4W Hauls' },
  { value: 'matches', label: 'Matches' },
]

const BAR_COLORS = [
  '#FF2D78', '#8B5CF6', '#00E5FF', '#FFB800', '#B8FF00',
  '#EF4444', '#22D3EE', '#F472B6', '#A78BFA', '#34D399',
  '#FB923C', '#FBBF24', '#60A5FA', '#E879F9', '#22C55E',
]

const rankAccent = (rank) => {
  if (rank === 1) return 'bg-amber-500/10 border-l-2 border-l-amber-400'
  if (rank === 2) return 'bg-gray-400/5 border-l-2 border-l-gray-400'
  if (rank === 3) return 'bg-amber-700/10 border-l-2 border-l-amber-700'
  return ''
}

export default function BowlingRecords() {
  const tournament = useTournament()
  const chartRef = useRef(null)
  // Filters live in the URL so a filtered leaderboard can be shared
  const [season, setSeason] = useUrlState('season', '')
  const [team, setTeam] = useUrlState('team', '')
  const [sortBy, setSortBy] = useUrlState('sort', 'wickets')
  const [minBalls, setMinBalls] = useUrlState('min_balls', 0)
  const [downloading, setDownloading] = useState(false)

  const handleDownloadChart = useCallback(async () => {
    if (!chartRef.current) return
    setDownloading(true)
    try {
      const dataUrl = await exportAsImage(chartRef.current, 'crickrida-bowling-records', 'png')
      downloadImage(dataUrl, 'crickrida-bowling-records.png')
    } catch (err) { console.error(err) }
    finally { setDownloading(false) }
  }, [])

  const { data: seasons } = useFetch(() => getSeasons(), [])
  const { data: teams } = useFetch(() => getTeams(), [])

  const { data: bowlers, loading, error } = useFetch(
    () => getBowlingLeaderboard({ season, team, sort_by: sortBy, limit: 500, min_balls: minBalls || undefined }),
    [season, team, sortBy, minBalls]
  )

  const seasonOptions = [{ value: '', label: 'All Seasons' }, ...(seasons || []).map((s) => ({ value: s, label: s }))]
  const teamOptions = [{ value: '', label: 'All Teams' }, ...(teams || []).map((t) => ({ value: t, label: t }))]

  const columns = [
    {
      key: 'rank',
      label: '#',
      align: 'center',
      render: (val) => {
        const badges = { 1: 'text-amber-400', 2: 'text-gray-400', 3: 'text-amber-700' }
        return <span className={`font-mono font-bold ${badges[val] || 'text-text-muted'}`}>{val}</span>
      },
    },
    {
      key: 'player',
      label: 'Player',
      render: (val) => (
        <Link to={`/bowling/${encodeURIComponent(val)}`} className="flex items-center gap-2 text-accent-cyan hover:underline font-medium">
          <PlayerAvatar name={val} size={28} showBorder={false} />
          {val}
        </Link>
      ),
    },
    { key: 'matches', label: 'Mat', align: 'right', render: (val) => <span className="font-mono">{val}</span> },
    { key: 'innings', label: 'Inn', align: 'right', render: (val) => <span className="font-mono">{val}</span> },
    { key: 'overs', label: 'Overs', align: 'right', render: (val) => <span className="font-mono">{formatDecimal(val, 1)}</span> },
    {
      key: 'wickets',
      label: 'Wkts',
      align: 'right',
      render: (val) => <span className="font-mono font-semibold text-accent-magenta">{val}</span>,
    },
    { key: 'avg', label: 'Avg', align: 'right', render: (val) => <span className="font-mono">{formatDecimal(val)}</span> },
    { key: 'economy', label: 'Econ', align: 'right', render: (val) => <span className="font-mono">{formatDecimal(val)}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (val) => <span className="font-mono">{formatDecimal(val)}</span> },
    { key: 'best_figures', label: 'BBI', align: 'right', render: (val) => <span className="font-mono">{val || '-'}</span> },
    { key: 'four_w', label: '4W', align: 'right', render: (val) => <span className="font-mono">{val}</span> },
    { key: 'five_w', label: '5W', align: 'right', render: (val) => <span className="font-mono">{val}</span> },
  ]

  const dataWithRank = (Array.isArray(bowlers) ? bowlers : []).map((b, i) => ({
    ...b,
    rank: i + 1,
    _rowClass: rankAccent(i + 1),
  }))

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-danger font-heading text-lg">Failed to load bowling records</p>
        <p className="text-text-secondary text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SEO
        title={`${tournament.shortName} Bowling Records & Leaderboard`}
        description={`${tournament.name} bowling records: top wicket-takers, economy rates, bowling averages, and best figures across every ${tournament.competitionLabel.toLowerCase()}.`}
        url="/bowling"
      />
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold text-text-primary">Bowling Records</h1>
          <p className="text-text-secondary text-sm mt-1">Top wicket takers across {tournament.name} {tournament.competitionLabelPlural.toLowerCase()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/bowling/compare" className="inline-flex items-center rounded-lg border border-border-subtle px-3.5 py-2 text-xs font-semibold text-text-secondary hover:border-accent-cyan/40 hover:text-accent-cyan transition-colors">Compare bowlers</Link>
          <MakeCardButton label="Share the top 5" params={{ t: 'leaderboard', stat: 'wickets' }} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-text-secondary text-sm">{tournament.competitionLabel}</label>
          <MultiSeasonSelect seasons={seasons || []} value={season} onChange={setSeason} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-text-secondary text-sm">Team</label>
          <Select options={teamOptions} value={team} onChange={setTeam} placeholder="" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-text-secondary text-sm">Sort by</label>
          <Select options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} placeholder="" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-text-secondary text-sm">Min Balls</label>
          <Select
            options={[
              { value: 0, label: 'All' },
              { value: 50, label: '50+' },
              { value: 100, label: '100+' },
              { value: 200, label: '200+' },
              { value: 500, label: '500+' },
              { value: 1000, label: '1000+' },
            ]}
            value={minBalls}
            onChange={(v) => setMinBalls(Number(v))}
            placeholder=""
          />
        </div>
      </div>

      {/* Top 15 Bar Chart */}
      {!loading && dataWithRank.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-heading font-semibold text-text-secondary">
              Top 15 — {SORT_OPTIONS.find((o) => o.value === sortBy)?.label || sortBy}
            </h3>
            <button
              onClick={handleDownloadChart}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border-subtle text-text-secondary hover:text-accent-magenta hover:border-accent-magenta/40 transition-colors disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloading ? 'Saving...' : 'Download'}
            </button>
          </div>
          <div ref={chartRef} className="bg-bg-primary rounded-lg p-2">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={dataWithRank.slice(0, 15).map((b) => ({ name: b.player, value: (sortBy === 'five_wickets' ? b.five_w : sortBy === 'four_wickets' ? b.four_w : b[sortBy]) ?? 0 })).sort((a, b) => b.value - a.value)}
              layout="vertical"
              margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: '#8888A0', fontSize: 12, fontFamily: 'JetBrains Mono' }}
                axisLine={{ stroke: '#1E1E2A' }}
                tickLine={{ stroke: '#1E1E2A' }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: '#8888A0', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={{ stroke: '#1E1E2A' }}
                tickLine={{ stroke: '#1E1E2A' }}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#1E1E2A' }} />
              <Bar
                dataKey="value"
                name={SORT_OPTIONS.find((o) => o.value === sortBy)?.label || sortBy}
                radius={[0, 4, 4, 0]}
                barSize={18}
                label={{
                  position: 'right',
                  fill: '#E8E8F0',
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  formatter: (v) => typeof v === 'number' ? v.toLocaleString('en-IN') : v,
                }}
              >
                {dataWithRank.slice(0, 15).map((_, idx) => (
                  <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Loading message="Loading bowling leaderboard..." />
      ) : (
        <DataTable columns={columns} data={dataWithRank} />
      )}
    </div>
  )
}
