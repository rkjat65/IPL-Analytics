import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTournament } from '../contexts/TournamentContext'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import Loading from '../components/ui/Loading'
import SEO from '../components/SEO'
import PlayerAvatar from '../components/ui/PlayerAvatar'
import { getPlayerImpact, searchPlayers } from '../lib/api'

/* ── Colors (Neon Noir) ──────────────────────────────────── */
const C = {
  bg: '#0C1210',
  card: '#121a17',
  cardAlt: '#111916',
  cyan: '#C3F23B',
  magenta: '#FF2D78',
  lime: '#2DD4BF',
  amber: '#FFB800',
  text: '#F0F0F5',
  secondary: '#AEB8B2',
  muted: '#60607A',
}

const ROLE_COLORS = {
  Batsman: C.cyan,
  Bowler: C.magenta,
  'All-Rounder': C.lime,
}

const METRIC_COLORS = [C.cyan, C.magenta, C.lime, C.amber, '#8B5CF6', '#EC4899']

/* ── Impact label thresholds ─────────────────────────────── */
function getImpactStyle(score) {
  if (score >= 85) return { label: 'Elite', color: C.lime }
  if (score >= 70) return { label: 'High Impact', color: C.cyan }
  if (score >= 50) return { label: 'Above Average', color: C.amber }
  if (score >= 35) return { label: 'Average', color: '#FF6B6B' }
  return { label: 'Below Average', color: C.magenta }
}

/* ── Score color for the gauge ───────────────────────────── */
function getScoreColor(score) {
  if (score >= 85) return C.lime
  if (score >= 70) return C.cyan
  if (score >= 50) return C.amber
  if (score >= 35) return '#FF6B6B'
  return C.magenta
}

/* ── Normalize arbitrary metric values to 0-100 for radar ─ */
function normalizeMetrics(metrics, role) {
  const norms = {
    // Batting norms
    batting_avg: { min: 0, max: 45 },
    strike_rate: { min: 80, max: 170 },
    boundary_pct: { min: 0, max: 30 },
    dot_pct: { min: 50, max: 15, invert: true }, // lower is better
    death_sr: { min: 0, max: 200 },
    powerplay_sr: { min: 0, max: 200 },
    win_contribution: { min: 0, max: 100 },
    // Bowling norms
    economy: { min: 12, max: 5, invert: true }, // lower is better
    dot_ball_pct: { min: 0, max: 55 },
    death_economy: { min: 14, max: 6, invert: true },
    powerplay_wicket_pct: { min: 0, max: 50 },
    wickets_per_match: { min: 0, max: 3.5 },
    // All-rounder prefixed
    bat_batting_avg: { min: 0, max: 45 },
    bat_strike_rate: { min: 80, max: 170 },
    bat_boundary_pct: { min: 0, max: 30 },
    bat_dot_pct: { min: 50, max: 15, invert: true },
    bat_death_sr: { min: 0, max: 200 },
    bat_powerplay_sr: { min: 0, max: 200 },
    bat_win_contribution: { min: 0, max: 100 },
    bowl_economy: { min: 12, max: 5, invert: true },
    bowl_dot_ball_pct: { min: 0, max: 55 },
    bowl_death_economy: { min: 14, max: 6, invert: true },
    bowl_powerplay_wicket_pct: { min: 0, max: 50 },
    bowl_wickets_per_match: { min: 0, max: 3.5 },
    bowl_win_contribution: { min: 0, max: 100 },
  }

  return Object.entries(metrics).map(([key, val]) => {
    const norm = norms[key]
    let normalized = val
    if (norm) {
      if (norm.invert) {
        normalized = Math.max(0, Math.min(100, ((norm.min - val) / (norm.min - norm.max)) * 100))
      } else {
        normalized = Math.max(0, Math.min(100, ((val - norm.min) / (norm.max - norm.min)) * 100))
      }
    }

    // Pretty label
    const prettyKey = key
      .replace(/^bat_/, 'Bat ')
      .replace(/^bowl_/, 'Bowl ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/Pct$/, '%')
      .replace(/Sr$/, 'SR')

    return {
      metric: prettyKey,
      value: Math.round(normalized),
      raw: val,
      key,
      fullMark: 100,
    }
  })
}

/* ── Metric display formatting ───────────────────────────── */
function formatMetricValue(key, val) {
  if (key.includes('economy') || key.includes('wickets_per_match')) return val.toFixed(2)
  if (key.includes('pct') || key.includes('contribution') || key.includes('sr') || key.includes('SR')) return val.toFixed(1)
  return typeof val === 'number' ? val.toFixed(1) : val
}

function metricUnit(key) {
  if (key.includes('pct') || key.includes('contribution')) return '%'
  if (key.includes('sr') || key.includes('SR')) return ''
  if (key.includes('economy')) return ' RPO'
  return ''
}

/* ── Circular Gauge ──────────────────────────────────────── */
function ImpactGauge({ score, size = 260 }) {
  const color = getScoreColor(score)
  const data = [{ name: 'Impact', value: Math.min(score, 100), fill: color }]

  return (
    <div className="relative" style={{ width: size, height: size / 2 + 60 }}>
      <ResponsiveContainer width="100%" height={size / 2 + 20}>
        <RadialBarChart
          cx="50%" cy="90%"
          innerRadius="55%" outerRadius="85%"
          startAngle={180} endAngle={0}
          data={data} barSize={16}
        >
          <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#1D2925' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute left-0 right-0 text-center" style={{ bottom: 0 }}>
        <span className="text-5xl font-heading font-bold font-mono" style={{ color }}>
          {score.toFixed(1)}
        </span>
        <span className="text-lg ml-1" style={{ color: C.muted }}>/100</span>
      </div>
    </div>
  )
}

/* ── Custom Radar Tooltip ────────────────────────────────── */
function RadarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-xl border"
      style={{ background: '#17211F', borderColor: '#2E3F39' }}>
      <p style={{ color: C.text }} className="font-semibold">{d.metric}</p>
      <p style={{ color: C.secondary }}>
        Normalized: <span className="font-mono font-bold" style={{ color: C.cyan }}>{d.value}</span>/100
      </p>
      <p style={{ color: C.muted }}>
        Raw: <span className="font-mono">{typeof d.raw === 'number' ? d.raw.toFixed(2) : d.raw}</span>
      </p>
    </div>
  )
}

/* ── Main Page Component ─────────────────────────────────── */
export default function PlayerImpactPage() {
  const tournament = useTournament()
  const [searchInput, setSearchInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  // Debounced player search for suggestions
  useEffect(() => {
    if (!searchInput.trim() || searchInput.trim().length < 2) {
      setSuggestions([])
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      searchPlayers(searchInput.trim())
        .then(res => {
          const list = Array.isArray(res) ? res : res?.players || []
          setSuggestions(list.slice(0, 8))
          setShowSuggestions(true)
        })
        .catch(() => setSuggestions([]))
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchInput])

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch impact data
  const fetchImpact = useCallback((playerName) => {
    if (!playerName) return
    setLoading(true)
    setError(null)
    setData(null)
    getPlayerImpact(playerName)
      .then(d => { setData(d); setError(null) })
      .catch(e => { setError(e.message || 'Failed to fetch player impact'); setData(null) })
      .finally(() => setLoading(false))
  }, [])

  const handleSelect = (name) => {
    const playerName = typeof name === 'string' ? name : name?.name || name?.player || ''
    setSelectedPlayer(playerName)
    setSearchInput(playerName)
    setShowSuggestions(false)
    fetchImpact(playerName)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (searchInput.trim()) {
      handleSelect(searchInput.trim())
    }
  }

  const radarData = useMemo(() => {
    if (!data?.metrics) return []
    return normalizeMetrics(data.metrics, data.role)
  }, [data])

  const impactStyle = data ? getImpactStyle(data.impact_score) : null
  const roleColor = data ? (ROLE_COLORS[data.role] || C.cyan) : C.cyan

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      <SEO
        title={`${tournament.shortName} Player Impact Index — Batting, Bowling & All-Rounder Ratings`}
        description={`Analyze any ${tournament.shortName} player's match impact with advanced batting, bowling, and all-rounder metrics powered by statistical models — go beyond raw stats to see who really wins matches.`}
        url="/player-impact"
      />

      {/* Page Header */}
      <div className="mb-8">
        <div className="relative overflow-hidden rounded-2xl border p-8"
          style={{
            background: 'linear-gradient(135deg, #C3F23B08, #FF2D7806, #2DD4BF08)',
            borderColor: '#1E1E2E',
          }}>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at top right, #C3F23B08, transparent 60%)' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at bottom left, #FF2D7808, transparent 60%)' }} />
          <div className="relative">
            <h1 className="text-3xl md:text-4xl font-heading font-bold mb-2" style={{ color: C.text }}>
              Player Impact Index
            </h1>
            <p className="text-sm max-w-xl" style={{ color: C.secondary }}>
              Comprehensive impact analysis for batsmen, bowlers, and all-rounders.
              Search any player to see their unified impact score and detailed metrics.
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="rounded-2xl p-6 mb-8 border relative"
        style={{ background: C.card, borderColor: '#1E1E2E' }} ref={searchRef}>
        <form onSubmit={handleSubmit} className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <label className="text-xs uppercase tracking-wider font-heading block mb-1.5"
              style={{ color: C.muted }}>
              Search Player
            </label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="e.g. Virat Kohli, Jasprit Bumrah, Ravindra Jadeja..."
              className="w-full rounded-lg px-4 py-3 text-sm font-body focus:outline-none transition-all"
              style={{
                background: C.bg,
                border: `1px solid #2E3F39`,
                color: C.text,
              }}
            />

            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-2xl border"
                style={{ background: '#17211F', borderColor: '#2E3F39' }}>
                {suggestions.map((s, i) => {
                  const name = typeof s === 'string' ? s : s?.name || s?.player || ''
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelect(name)}
                      className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors hover:bg-white/5"
                      style={{ color: C.text }}
                    >
                      <PlayerAvatar name={name} size={28} showBorder={false} />
                      <span>{name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={!searchInput.trim()}
            className="px-8 py-3 rounded-lg font-heading font-semibold text-sm transition-all
                       disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${C.cyan}, ${C.cyan}CC)`,
              color: C.bg,
              boxShadow: searchInput.trim() ? `0 4px 20px ${C.cyan}30` : 'none',
            }}
          >
            Analyze
          </button>
        </form>
      </div>

      {/* Loading / Error / Empty */}
      {loading && <Loading message={`Analyzing ${selectedPlayer}...`} />}

      {error && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="text-4xl">!</span>
          <p className="text-red-400 text-sm font-body">{error}</p>
          <button
            onClick={() => fetchImpact(selectedPlayer)}
            className="mt-2 px-4 py-2 text-xs font-heading font-semibold rounded-lg transition-all"
            style={{ background: `${C.cyan}15`, color: C.cyan, border: `1px solid ${C.cyan}40` }}
          >
            Retry
          </button>
        </div>
      )}

      {!selectedPlayer && !loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-5xl opacity-40">&#x1F3CF;</span>
          <p className="text-sm font-body" style={{ color: C.muted }}>
            Search for a player to see their impact analysis
          </p>
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <div className="space-y-6">
          {/* Top Row: Avatar + Score + Role + Label */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Impact Score Card */}
            <div className="rounded-2xl p-6 border relative overflow-hidden lg:col-span-1"
              style={{ background: C.card, borderColor: '#1E1E2E', boxShadow: `0 0 40px ${roleColor}08` }}>
              <div className="absolute inset-0 pointer-events-none rounded-2xl"
                style={{ background: `radial-gradient(ellipse at top, ${roleColor}08, transparent 70%)` }} />
              <div className="relative flex flex-col items-center">
                {/* Player avatar */}
                <div className="mb-4">
                  <PlayerAvatar name={data.player} size={80} />
                </div>
                <h2 className="text-xl font-heading font-bold mb-1" style={{ color: C.text }}>
                  {data.player}
                </h2>
                {/* Role badge */}
                <span className="px-3 py-1 rounded-full text-xs font-heading font-bold uppercase tracking-wider mb-5"
                  style={{
                    background: `${roleColor}18`,
                    color: roleColor,
                    border: `1px solid ${roleColor}40`,
                  }}>
                  {data.role}
                </span>
                {/* Gauge */}
                <ImpactGauge score={data.impact_score} size={260} />
                {/* Label badge */}
                {impactStyle && (
                  <div className="mt-4 px-5 py-1.5 rounded-full text-xs font-heading font-bold uppercase tracking-wider"
                    style={{
                      background: `${impactStyle.color}18`,
                      color: impactStyle.color,
                      border: `1px solid ${impactStyle.color}40`,
                    }}>
                    {impactStyle.label}
                  </div>
                )}

                {/* All-rounder sub-scores */}
                {data.role === 'All-Rounder' && data.batting_score != null && (
                  <div className="flex gap-4 mt-5 w-full justify-center">
                    <div className="text-center px-4 py-2 rounded-xl" style={{ background: `${C.cyan}10`, border: `1px solid ${C.cyan}20` }}>
                      <p className="text-lg font-mono font-bold" style={{ color: C.cyan }}>{data.batting_score}</p>
                      <p className="text-[10px] uppercase" style={{ color: C.muted }}>Batting</p>
                    </div>
                    <div className="text-center px-4 py-2 rounded-xl" style={{ background: `${C.magenta}10`, border: `1px solid ${C.magenta}20` }}>
                      <p className="text-lg font-mono font-bold" style={{ color: C.magenta }}>{data.bowling_score}</p>
                      <p className="text-[10px] uppercase" style={{ color: C.muted }}>Bowling</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Radar Chart */}
            <div className="rounded-2xl p-6 border relative overflow-hidden lg:col-span-2"
              style={{ background: C.card, borderColor: '#1E1E2E', boxShadow: `0 0 40px ${C.magenta}08` }}>
              <div className="absolute inset-0 pointer-events-none rounded-2xl"
                style={{ background: `radial-gradient(ellipse at bottom right, ${C.magenta}06, transparent 70%)` }} />
              <div className="relative">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-6 rounded-full" style={{ background: C.magenta }} />
                  <h2 className="text-lg font-heading font-bold" style={{ color: C.text }}>
                    Performance Radar
                  </h2>
                </div>

                {radarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={360}>
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                      <PolarGrid stroke="#2E3F39" />
                      <PolarAngleAxis
                        dataKey="metric"
                        tick={{ fill: C.secondary, fontSize: 11 }}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={{ fill: C.muted, fontSize: 10 }}
                        axisLine={false}
                      />
                      <Radar
                        name="Impact"
                        dataKey="value"
                        stroke={roleColor}
                        fill={roleColor}
                        fillOpacity={0.2}
                        strokeWidth={2}
                      />
                      <Tooltip content={<RadarTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[360px]">
                    <p style={{ color: C.muted }} className="text-sm">No metrics available</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-6 rounded-full" style={{ background: C.amber }} />
              <h2 className="text-lg font-heading font-bold" style={{ color: C.text }}>
                Detailed Metrics
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Object.entries(data.metrics).map(([key, val], i) => {
                const color = METRIC_COLORS[i % METRIC_COLORS.length]
                const prettyKey = key
                  .replace(/^bat_/, 'Bat ')
                  .replace(/^bowl_/, 'Bowl ')
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, c => c.toUpperCase())

                return (
                  <div key={key}
                    className="rounded-xl p-4 border transition-transform hover:scale-[1.02]"
                    style={{
                      background: C.cardAlt,
                      borderColor: `${color}20`,
                      boxShadow: `0 0 20px ${color}06`,
                    }}>
                    <p className="text-[11px] uppercase tracking-wider mb-2 truncate" style={{ color: C.muted }}>
                      {prettyKey}
                    </p>
                    <p className="text-2xl font-mono font-bold" style={{ color }}>
                      {formatMetricValue(key, val)}
                      <span className="text-xs ml-0.5" style={{ color: C.muted }}>
                        {metricUnit(key)}
                      </span>
                    </p>
                    {/* Mini bar */}
                    <div className="mt-3 w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#1D2925' }}>
                      <div className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${Math.min(radarData.find(r => r.key === key)?.value ?? 50, 100)}%`,
                          background: `linear-gradient(90deg, ${color}88, ${color})`,
                        }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Summary */}
          {data.summary && (
            <div className="rounded-2xl p-5 border"
              style={{
                background: `linear-gradient(135deg, ${roleColor}08, ${C.card})`,
                borderColor: `${roleColor}20`,
              }}>
              <p className="text-sm leading-relaxed" style={{ color: C.secondary }}>
                {data.summary}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
