import { useState, useCallback } from 'react'
import { useTournament } from '../contexts/TournamentContext'
import { useFetch } from '../hooks/useFetch'
import { searchPlayers, getPlayerBatting } from '../lib/api'
import SEO from '../components/SEO'
import StatCard from '../components/ui/StatCard'
import Loading from '../components/ui/Loading'
import { formatNumber, formatDecimal } from '../utils/format'
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

const PLAYER_COLORS = ['#00E5FF', '#FF2D78', '#B8FF00', '#FFB800', '#8B5CF6']

const darkTooltipStyle = {
  contentStyle: { backgroundColor: '#111118', border: '1px solid #1E1E2A', borderRadius: 8, color: '#E8E8ED' },
  itemStyle: { color: '#E8E8ED' },
  labelStyle: { color: '#8888A0' },
}

export default function BattingCompare() {
  const tournament = useTournament()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedPlayers, setSelectedPlayers] = useState([])
  const [playerData, setPlayerData] = useState({})
  const [loadingPlayer, setLoadingPlayer] = useState(null)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const results = await searchPlayers(query.trim())
      setSearchResults(Array.isArray(results) ? results : [])
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [query])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
  }

  const addPlayer = useCallback(async (name) => {
    if (selectedPlayers.includes(name) || selectedPlayers.length >= 5) return
    setSelectedPlayers((prev) => [...prev, name])
    setSearchResults([])
    setQuery('')
    setLoadingPlayer(name)
    try {
      const data = await getPlayerBatting(name)
      setPlayerData((prev) => ({ ...prev, [name]: data }))
    } catch {
      setPlayerData((prev) => ({ ...prev, [name]: null }))
    } finally {
      setLoadingPlayer(null)
    }
  }, [selectedPlayers])

  const removePlayer = useCallback((name) => {
    setSelectedPlayers((prev) => prev.filter((p) => p !== name))
    setPlayerData((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }, [])

  // Build radar data for comparison
  const playersWithData = selectedPlayers.filter((p) => playerData[p]?.career)

  const radarData = (() => {
    if (playersWithData.length === 0) return []

    // Normalize metrics across players for radar
    const metrics = ['Average', 'Strike Rate', 'Boundary %', 'Dot %', 'Consistency']
    const rawValues = playersWithData.map((name) => {
      const c = playerData[name].career
      const totalBalls = c.innings > 0 ? (c.runs / (c.sr / 100)) : 0
      const boundaryPct = totalBalls > 0 ? ((c.fours * 4 + c.sixes * 6) / c.runs) * 100 : 0
      const consistency = c.innings > 0 ? ((c.fifties + c.hundreds) / c.innings) * 100 : 0
      return {
        average: c.avg || 0,
        sr: c.sr || 0,
        boundaryPct: isFinite(boundaryPct) ? boundaryPct : 0,
        dotPct: 0, // Not directly available from career stats
        consistency: isFinite(consistency) ? consistency : 0,
      }
    })

    // Find max for each metric for normalization
    const maxes = {
      average: Math.max(...rawValues.map((v) => v.average), 1),
      sr: Math.max(...rawValues.map((v) => v.sr), 1),
      boundaryPct: Math.max(...rawValues.map((v) => v.boundaryPct), 1),
      consistency: Math.max(...rawValues.map((v) => v.consistency), 1),
    }

    return metrics.map((metric, mi) => {
      const entry = { metric }
      playersWithData.forEach((name, pi) => {
        const raw = rawValues[pi]
        let val = 0
        if (mi === 0) val = (raw.average / maxes.average) * 100
        else if (mi === 1) val = (raw.sr / maxes.sr) * 100
        else if (mi === 2) val = (raw.boundaryPct / maxes.boundaryPct) * 100
        else if (mi === 3) val = 50 // Placeholder since dot% isn't in career stats
        else val = (raw.consistency / maxes.consistency) * 100
        entry[name] = Math.round(val)
      })
      return entry
    })
  })()

  // Phase comparison data
  const phaseCompareData = (() => {
    if (playersWithData.length === 0) return []
    const phases = ['Powerplay', 'Middle', 'Death']
    return phases.map((phase) => {
      const entry = { phase }
      playersWithData.forEach((name) => {
        const phaseArr = playerData[name]?.phase_stats || []
        const phaseEntry = phaseArr.find((p) => p.phase?.toLowerCase() === phase.toLowerCase())
        entry[name] = phaseEntry?.sr || 0
      })
      return entry
    })
  })()

  return (
    <div className="space-y-8">
      <SEO
        title={`${tournament.shortName} Batting Comparison Tool — Compare Player Stats Side by Side`}
        description={`Compare any ${tournament.shortName} batters side by side — runs, average, strike rate, centuries, and more — with radar charts and head-to-head visual breakdowns.`}
        url="/batting/compare"
      />
      {/* Header */}
      <div>
        <h1 className="text-3xl font-heading font-bold text-text-primary">Compare Batsmen</h1>
        <p className="text-text-secondary text-sm mt-1">Select 2-5 players to compare their batting statistics</p>
      </div>

      {/* Player Selector */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for a player..."
            className="flex-1 bg-bg-elevated border border-border-subtle rounded-md px-4 py-2 text-sm text-text-primary placeholder:text-text-muted font-body focus:outline-none focus:border-accent-cyan transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-4 py-2 bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 rounded-md text-sm font-medium hover:bg-accent-cyan/20 transition-colors disabled:opacity-50"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {searchResults.slice(0, 20).map((name) => (
              <button
                key={name}
                onClick={() => addPlayer(name)}
                disabled={selectedPlayers.includes(name) || selectedPlayers.length >= 5}
                className="px-3 py-1.5 bg-bg-elevated border border-border-subtle rounded-full text-xs text-text-primary hover:border-accent-cyan hover:text-accent-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + {name}
              </button>
            ))}
          </div>
        )}

        {/* Selected Players */}
        {selectedPlayers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedPlayers.map((name, i) => (
              <span
                key={name}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
                style={{
                  backgroundColor: `${PLAYER_COLORS[i]}15`,
                  borderColor: `${PLAYER_COLORS[i]}40`,
                  color: PLAYER_COLORS[i],
                }}
              >
                {name}
                <button
                  onClick={() => removePlayer(name)}
                  className="hover:opacity-70 transition-opacity"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}

        {loadingPlayer && (
          <p className="text-text-muted text-xs">Loading {loadingPlayer}...</p>
        )}
      </div>

      {/* Comparison Content */}
      {playersWithData.length >= 2 && (
        <>
          {/* Side-by-side Stats */}
          <section>
            <SectionHeader title="Career Comparison" color="lime" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {playersWithData.map((name, i) => {
                const c = playerData[name].career
                return (
                  <div key={name} className="card space-y-3" style={{ borderTop: `2px solid ${PLAYER_COLORS[i]}` }}>
                    <p className="font-heading font-bold text-sm text-text-primary truncate">{name}</p>
                    <div className="space-y-2 text-xs">
                      <StatRow label="Matches" value={c.matches} />
                      <StatRow label="Runs" value={formatNumber(c.runs)} highlight />
                      <StatRow label="Average" value={formatDecimal(c.avg)} />
                      <StatRow label="SR" value={formatDecimal(c.sr)} />
                      <StatRow label="Highest" value={c.highest || '-'} />
                      <StatRow label="50s / 100s" value={`${c.fifties ?? 0} / ${c.hundreds ?? 0}`} />
                      <StatRow label="4s / 6s" value={`${c.fours ?? 0} / ${c.sixes ?? 0}`} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Radar Chart */}
          <section>
            <SectionHeader title="Skill Comparison" color="cyan" />
            <div className="card">
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="#1E1E2A" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#8888A0', fontSize: 12 }} />
                  <PolarRadiusAxis tick={{ fill: '#555566', fontSize: 10 }} domain={[0, 100]} />
                  {playersWithData.map((name, i) => (
                    <Radar
                      key={name}
                      name={name}
                      dataKey={name}
                      stroke={PLAYER_COLORS[i]}
                      fill={PLAYER_COLORS[i]}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  ))}
                  <Tooltip {...darkTooltipStyle} />
                  <Legend
                    wrapperStyle={{ color: '#8888A0', fontSize: 12 }}
                    formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Phase Comparison */}
          {phaseCompareData.length > 0 && (
            <section>
              <SectionHeader title="Phase-wise Strike Rate" color="magenta" />
              <div className="card">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={phaseCompareData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                    <XAxis dataKey="phase" tick={{ fill: '#8888A0', fontSize: 12 }} axisLine={{ stroke: '#1E1E2A' }} />
                    <YAxis tick={{ fill: '#8888A0', fontSize: 12 }} axisLine={{ stroke: '#1E1E2A' }} />
                    <Tooltip {...darkTooltipStyle} />
                    <Legend
                      wrapperStyle={{ color: '#8888A0', fontSize: 12 }}
                      formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>}
                    />
                    {playersWithData.map((name, i) => (
                      <Bar key={name} dataKey={name} fill={PLAYER_COLORS[i]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </>
      )}

      {/* Empty state */}
      {playersWithData.length < 2 && selectedPlayers.length > 0 && !loadingPlayer && (
        <div className="text-center py-12">
          <p className="text-text-muted text-sm">
            {selectedPlayers.length === 1
              ? 'Add at least one more player to start comparing'
              : 'Loading player data...'}
          </p>
        </div>
      )}

      {selectedPlayers.length === 0 && (
        <div className="text-center py-16">
          <p className="text-text-muted text-sm">Search and select players above to begin comparison</p>
        </div>
      )}
    </div>
  )
}

function StatRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-text-muted">{label}</span>
      <span className={`font-mono ${highlight ? 'font-semibold text-accent-lime' : 'text-text-primary'}`}>{value}</span>
    </div>
  )
}

function SectionHeader({ title, color = 'cyan' }) {
  const colorMap = {
    cyan: 'bg-accent-cyan',
    magenta: 'bg-accent-magenta',
    lime: 'bg-accent-lime',
    amber: 'bg-accent-amber',
  }
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-1 h-6 ${colorMap[color] || colorMap.cyan} rounded-full`} />
      <h2 className="text-xl font-heading font-bold text-text-primary">{title}</h2>
    </div>
  )
}
