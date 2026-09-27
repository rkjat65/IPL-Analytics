import { useState, useCallback, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import { useFetch } from '../hooks/useFetch'
import {
  getSeasons,
  getInningsDNA,
  getSixEvolution,
  getBattingMatrix,
  getBowlingMatrix,
  getChaseAnalysis,
  getDismissalTypes,
  getPhaseDominance,
  getCapWinners,
} from '../lib/api'
import { getTeamColor, getTeamAbbr } from '../constants/teams'
import {
  BarChart, Bar, Cell,
  AreaChart, Area,
  ScatterChart, Scatter, ZAxis,
  PieChart, Pie,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend, ReferenceLine,
} from 'recharts'
import Loading from '../components/ui/Loading'
import MultiSeasonSelect from '../components/ui/MultiSeasonSelect'
import { useTournament } from '../contexts/TournamentContext'
import { formatNumber, formatDecimal } from '../utils/format'

/* ── Player Avatar Helpers ─────────────────────────────── */
const AVATAR_BASE = 'https://ui-avatars.com/api/'
function playerAvatarUrl(name, size = 28) {
  const initials = (name || '??').split(' ').map(w => w[0]).join('').slice(0, 2)
  return `${AVATAR_BASE}?name=${encodeURIComponent(initials)}&size=${size}&background=16161F&color=00E5FF&bold=true&font-size=0.45`
}
function realPlayerImageUrl(name) {
  return `/api/players/${encodeURIComponent(name)}/image`
}

/* ── Draw Animation Hook (line grows slowly for recording) ── */
function useDrawAnimation(defaultDuration = 3000) {
  const [animKey, setAnimKey] = useState(0)
  const [animating, setAnimating] = useState(false)

  const triggerDraw = useCallback(() => {
    setAnimKey(k => k + 1)
    setAnimating(true)
    setTimeout(() => setAnimating(false), defaultDuration + 500)
  }, [defaultDuration])

  return { animKey, animating, triggerDraw, duration: defaultDuration }
}

/* ── Player Reveal Animation Hook (one-by-one for matrix) ── */
function usePlayerReveal(totalPlayers) {
  const [revealCount, setRevealCount] = useState(totalPlayers)
  const [revealing, setRevealing] = useState(false)
  const timerRef = useRef(null)

  const startReveal = useCallback(() => {
    setRevealCount(0)
    setRevealing(true)
  }, [])

  useEffect(() => {
    if (!revealing) return
    if (revealCount >= totalPlayers) {
      setRevealing(false)
      return
    }
    timerRef.current = setTimeout(() => {
      setRevealCount(c => c + 1)
    }, 400) // 400ms per player
    return () => clearTimeout(timerRef.current)
  }, [revealing, revealCount, totalPlayers])

  const reset = useCallback(() => {
    setRevealing(false)
    setRevealCount(totalPlayers)
    clearTimeout(timerRef.current)
  }, [totalPlayers])

  return { revealCount, revealing, startReveal, reset }
}

/* ── Draw Animation Button ─────────────────────── */
function DrawAnimationBtn({ drawer }) {
  return (
    <button onClick={drawer.triggerDraw} disabled={drawer.animating}
      title="Animate chart draw (for recording)"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all
        ${drawer.animating
          ? 'bg-accent-magenta/20 border border-accent-magenta/40 text-accent-magenta cursor-wait'
          : 'bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/20 cursor-pointer'}`}>
      {drawer.animating ? (
        <>
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="10" /></svg>
          Drawing...
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          Animate Draw
        </>
      )}
    </button>
  )
}

/* ── Player Reveal Button ─────────────────────── */
function PlayerRevealBtn({ revealer }) {
  return (
    <button onClick={revealer.revealing ? revealer.reset : revealer.startReveal}
      title={revealer.revealing ? 'Show all players' : 'Reveal players one by one (for recording)'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all
        ${revealer.revealing
          ? 'bg-accent-amber/20 border border-accent-amber/40 text-accent-amber'
          : 'bg-accent-magenta/10 border border-accent-magenta/30 text-accent-magenta hover:bg-accent-magenta/20 cursor-pointer'}`}>
      {revealer.revealing ? (
        <>
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
          Show All
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="12" cy="8" r="4" /><path d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7" /></svg>
          Reveal Players
        </>
      )}
    </button>
  )
}

/* ── Zoom Controls ─────────────────────── */
function ZoomControls({ zoom, setZoom }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} title="Zoom out"
        className="w-7 h-7 flex items-center justify-center rounded bg-bg-card border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent-cyan/40 transition-all text-sm font-bold">
        −
      </button>
      <span className="text-[10px] text-text-muted font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
      <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} title="Zoom in"
        className="w-7 h-7 flex items-center justify-center rounded bg-bg-card border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent-cyan/40 transition-all text-sm font-bold">
        +
      </button>
      {zoom !== 1 && (
        <button onClick={() => setZoom(1)} title="Reset zoom"
          className="px-2 py-1 rounded text-[10px] bg-bg-card border border-border-subtle text-text-muted hover:text-text-primary transition-all">
          Reset
        </button>
      )}
    </div>
  )
}

/* ── Live Data Overlay (shows current values during animation) ── */
function AnimDataOverlay({ data, dataKey, label, color, visible }) {
  if (!visible || !data?.length) return null
  const last = data[data.length - 1]
  const val = last?.[dataKey]
  return (
    <div className="absolute top-3 right-3 rounded-lg px-3 py-2 border animate-pulse z-10"
      style={{ background: '#16161FDD', borderColor: color + '40' }}>
      <p className="text-[10px] text-text-muted">{label}</p>
      <p className="font-mono font-bold text-lg" style={{ color }}>{typeof val === 'number' ? val.toFixed(1) : val}</p>
    </div>
  )
}

const DISMISS_COLORS = ['#FF2D78', '#00E5FF', '#B8FF00', '#FFB800', '#8B5CF6', '#22D3EE', '#F472B6', '#34D399']

export default function Charts() {
  const tournament = useTournament()
  const [season, setSeason] = useState('')

  const { data: seasons } = useFetch(() => getSeasons(), [])

  // Draw animation hooks
  const dnaDrawer = useDrawAnimation(3000)
  const sixDrawer = useDrawAnimation(3000)

  // Zoom state for charts
  const [dnaZoom, setDnaZoom] = useState(1)
  const [sixZoom, setSixZoom] = useState(1)
  const [batMatrixZoom, setBatMatrixZoom] = useState(1)
  const [bowlMatrixZoom, setBowlMatrixZoom] = useState(1)

  const { data: inningsDNA, loading: dnaLoading } = useFetch(() => getInningsDNA(season), [season])
  const { data: sixEvolution, loading: sixEvoLoading } = useFetch(() => getSixEvolution(), [])
  const { data: battingMatrix, loading: matrixLoading } = useFetch(() => getBattingMatrix(season, season ? 10 : 20), [season])
  const { data: bowlingMatrix, loading: bowlMatrixLoading } = useFetch(() => getBowlingMatrix(season, season ? 10 : 20), [season])
  const { data: chaseAnalysis, loading: chaseLoading } = useFetch(() => getChaseAnalysis(season), [season])
  const { data: dismissalTypes, loading: dismissalLoading } = useFetch(() => getDismissalTypes(season), [season])
  const { data: phaseDominance, loading: phaseLoading } = useFetch(() => getPhaseDominance(season), [season])
  const { data: capWinners, loading: capLoading } = useFetch(() => getCapWinners(), [])

  // Prepare matrix data outside render for reveal hooks
  const batMatrixData = (battingMatrix || [])
    .filter(b => b.avg && b.sr && b.runs > 0)
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 25)
    .map(b => ({ ...b, name: b.player, shortName: b.player?.length > 12 ? b.player.slice(0, 11) + '\u2026' : b.player }))

  const bowlMatrixData = (bowlingMatrix || [])
    .filter(b => b.avg && b.economy && b.wickets > 0)
    .sort((a, b) => b.wickets - a.wickets)
    .slice(0, 25)
    .map(b => ({ ...b, name: b.player, shortName: b.player?.length > 12 ? b.player.slice(0, 11) + '\u2026' : b.player }))

  // Player reveal hooks
  const batRevealer = usePlayerReveal(Math.min(10, batMatrixData.length))
  const bowlRevealer = usePlayerReveal(Math.min(10, bowlMatrixData.length))

  return (
    <div className="space-y-8">
      <SEO
        title={`${tournament.shortName} Charts & Insights — Visual Analytics`}
        description={`Deep visual analytics for ${tournament.name}: phase run rates, dismissals, toss impact, scoring trends, and batting and bowling performance.`}
        url="/charts"
      />

      {/* Page Header + Season Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-text-primary">
            Insights
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Deep visual analytics that reveal the hidden patterns of {tournament.shortName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-text-secondary text-sm font-body">{tournament.competitionLabel}</label>
          <MultiSeasonSelect seasons={seasons || []} value={season} onChange={setSeason} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          1. INNINGS DNA — The Shape of a T20 Innings
          ═══════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #00E5FF, #FF2D78)' }} />
          <h2 className="text-xl font-heading font-bold text-text-primary">Innings DNA</h2>
        </div>
        <p className="text-text-muted text-xs mb-2 ml-5">Average runs scored per over — the signature shape of a T20 innings</p>
        <div className="flex items-center gap-3 ml-5">
          <DrawAnimationBtn drawer={dnaDrawer} />
          <ZoomControls zoom={dnaZoom} setZoom={setDnaZoom} />
        </div>
        <div className="card mt-3 relative overflow-x-auto">
          {dnaDrawer.animating && <AnimDataOverlay data={inningsDNA} dataKey="avg_runs" label="Peak Avg Runs" color="#00E5FF" visible={true} />}
          {dnaLoading ? <Loading message="Decoding innings DNA..." /> :
           !inningsDNA?.length ? <p className="text-text-muted text-sm py-8 text-center">No data</p> : (
            <div style={{ width: `${Math.max(100, dnaZoom * 100)}%`, minWidth: '100%' }}>
            <ResponsiveContainer key={`dna-${dnaDrawer.animKey}`} width="100%" height={Math.round(360 * Math.min(dnaZoom, 1.5))}>
              <AreaChart data={inningsDNA} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="chartDnaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00E5FF" stopOpacity={0.6} />
                    <stop offset="50%" stopColor="#8B5CF6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#FF2D78" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="chartSixGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFB800" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#FFB800" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                <XAxis dataKey="over_num" tick={{ fill: '#8888A0', fontSize: 11 }} axisLine={{ stroke: '#2A2A3A' }} tickLine={false}
                  label={{ value: 'Over', position: 'insideBottom', offset: -2, fill: '#8888A0', fontSize: 10 }} />
                <YAxis tick={{ fill: '#8888A0', fontSize: 11 }} axisLine={false} tickLine={false}
                  label={{ value: 'Avg Runs', angle: -90, position: 'insideLeft', fill: '#8888A0', fontSize: 10 }} />
                <ReferenceLine x={6} stroke="#2A2A3A" strokeDasharray="5 5" label={{ value: 'Powerplay', fill: '#00E5FF', fontSize: 9, position: 'top' }} />
                <ReferenceLine x={15} stroke="#2A2A3A" strokeDasharray="5 5" label={{ value: 'Death', fill: '#FF2D78', fontSize: 9, position: 'top' }} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="rounded-lg px-3 py-2 text-xs shadow-xl border" style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
                      <p className="text-text-primary font-semibold mb-1">Over {label}</p>
                      <p style={{ color: '#00E5FF' }}>Avg Runs: <span className="font-mono font-bold">{d?.avg_runs}</span></p>
                      <p style={{ color: '#FFB800' }}>Sixes/over: <span className="font-mono font-bold">{d?.sixes_per_over}</span></p>
                      <p style={{ color: '#B8FF00' }}>Fours/over: <span className="font-mono font-bold">{d?.fours_per_over}</span></p>
                      <p className="text-text-muted">Dot%: <span className="font-mono">{d?.dot_pct}%</span></p>
                      <p style={{ color: '#FF2D78' }}>Avg Wkts: <span className="font-mono">{d?.avg_wickets}</span></p>
                    </div>
                  )
                }} />
                <Area type="monotone" dataKey="avg_runs" stroke="#00E5FF" strokeWidth={2.5} fill="url(#chartDnaGradient)" name="Avg Runs"
                  isAnimationActive={true} animationDuration={dnaDrawer.duration} animationBegin={0} animationEasing="ease-in-out"
                  dot={{ fill: '#00E5FF', r: 2, stroke: '#0A0A0F', strokeWidth: 1 }}
                  label={dnaDrawer.animating ? false : { position: 'top', fill: '#00E5FF', fontSize: 9, fontFamily: 'monospace', formatter: v => v?.toFixed(1) }} />
                <Area type="monotone" dataKey="sixes_per_over" stroke="#FFB800" strokeWidth={1.5} fill="url(#chartSixGradient)" name="Sixes"
                  isAnimationActive={true} animationDuration={dnaDrawer.duration} animationBegin={300} animationEasing="ease-in-out" />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          2. SIX EVOLUTION + CHASE ANALYSIS
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Six Evolution */}
        <section>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-6 bg-accent-amber rounded-full" />
            <h2 className="text-xl font-heading font-bold text-text-primary">The Six Evolution</h2>
          </div>
          <p className="text-text-muted text-xs mb-2 ml-5">Sixes per match across seasons — the game is transforming</p>
          <div className="flex items-center gap-3 ml-5">
            <DrawAnimationBtn drawer={sixDrawer} />
            <ZoomControls zoom={sixZoom} setZoom={setSixZoom} />
          </div>
          <div className="card mt-3 relative overflow-x-auto">
            {sixDrawer.animating && <AnimDataOverlay data={sixEvolution} dataKey="sixes_per_match" label="Latest Sixes/Match" color="#FFB800" visible={true} />}
            {sixEvoLoading ? <Loading message="Loading evolution..." /> :
             !sixEvolution?.length ? <p className="text-text-muted text-sm py-8 text-center">No data</p> : (
              <div style={{ width: `${Math.max(100, sixZoom * 100)}%`, minWidth: '100%' }}>
              <ResponsiveContainer key={`six-${sixDrawer.animKey}`} width="100%" height={Math.round(320 * Math.min(sixZoom, 1.5))}>
                <AreaChart data={sixEvolution} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="chartSixEvoGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FFB800" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#FFB800" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                  <XAxis dataKey="season" tick={{ fill: '#8888A0', fontSize: 10 }} axisLine={{ stroke: '#2A2A3A' }} tickLine={false} />
                  <YAxis tick={{ fill: '#8888A0', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="rounded-lg px-3 py-2 text-xs shadow-xl border" style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
                        <p className="text-text-primary font-semibold mb-1">{tournament.shortName} {d?.season}</p>
                        <p style={{ color: '#FFB800' }}>Sixes/match: <span className="font-mono font-bold">{d?.sixes_per_match}</span></p>
                        <p style={{ color: '#B8FF00' }}>Fours/match: <span className="font-mono font-bold">{d?.fours_per_match}</span></p>
                        <p className="text-text-muted">Total sixes: <span className="font-mono">{formatNumber(d?.total_sixes)}</span></p>
                        <p className="text-text-muted">Avg score: <span className="font-mono">{d?.avg_innings_score}</span></p>
                        <p className="text-text-muted">Matches: <span className="font-mono">{d?.matches}</span></p>
                      </div>
                    )
                  }} />
                  <Area type="monotone" dataKey="sixes_per_match" stroke="#FFB800" strokeWidth={2.5} fill="url(#chartSixEvoGrad)" name="Sixes/Match"
                    dot={{ fill: '#FFB800', r: 3, stroke: '#0A0A0F', strokeWidth: 2 }}
                    activeDot={{ fill: '#FFB800', r: 5, stroke: '#0A0A0F', strokeWidth: 2 }}
                    isAnimationActive={true} animationDuration={sixDrawer.duration} animationBegin={0} animationEasing="ease-in-out"
                    label={{ position: 'top', fill: '#FFB800', fontSize: 9, fontFamily: 'monospace', formatter: v => v?.toFixed(1) }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* Chase Analysis */}
        <section>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-6 bg-accent-lime rounded-full" />
            <h2 className="text-xl font-heading font-bold text-text-primary">The Chasing Game</h2>
          </div>
          <p className="text-text-muted text-xs mb-4 ml-5">Win % when chasing by target score range</p>
          <div className="card">
            {chaseLoading ? <Loading message="Analyzing chases..." /> :
             !chaseAnalysis?.length ? <p className="text-text-muted text-sm py-8 text-center">No data</p> : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chaseAnalysis} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                  <XAxis dataKey="target_range" tick={{ fill: '#8888A0', fontSize: 11 }} axisLine={{ stroke: '#2A2A3A' }} tickLine={false} />
                  <YAxis tick={{ fill: '#8888A0', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]}
                    label={{ value: 'Chase Win %', angle: -90, position: 'insideLeft', fill: '#8888A0', fontSize: 10 }} />
                  <ReferenceLine y={50} stroke="#8888A0" strokeDasharray="3 3" label={{ value: '50%', fill: '#8888A0', fontSize: 9, position: 'right' }} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="rounded-lg px-3 py-2 text-xs shadow-xl border" style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
                        <p className="text-text-primary font-semibold mb-1">Target: {d?.target_range}</p>
                        <p style={{ color: d?.chase_win_pct >= 50 ? '#B8FF00' : '#FF2D78' }}>
                          Chase Win%: <span className="font-mono font-bold">{d?.chase_win_pct}%</span>
                        </p>
                        <p className="text-text-muted">Chases: <span className="font-mono">{d?.total_chases}</span></p>
                        <p className="text-text-muted">Won: <span className="font-mono">{d?.chase_wins}</span></p>
                        <p className="text-text-muted">Avg target: <span className="font-mono">{d?.avg_target}</span></p>
                      </div>
                    )
                  }} />
                  <Bar dataKey="chase_win_pct" radius={[6, 6, 0, 0]} barSize={40}
                    label={{ position: 'top', fill: '#E8E8F0', fontSize: 11, fontWeight: 700, fontFamily: 'monospace', formatter: (v) => `${v}%` }}
                  >
                    {(chaseAnalysis || []).map((entry, idx) => (
                      <Cell key={idx} fill={entry.chase_win_pct >= 50 ? '#B8FF00' : entry.chase_win_pct >= 35 ? '#FFB800' : '#FF2D78'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════
          3. BATTING IMPACT MATRIX (Scatter) + DISMISSAL PIE
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Batting Impact Matrix — takes 2 cols */}
        <section className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #B8FF00, #00E5FF)' }} />
            <h2 className="text-xl font-heading font-bold text-text-primary">Batting Impact Matrix</h2>
          </div>
          <p className="text-text-muted text-xs mb-2 ml-5">Strike Rate vs Average — bubble size = total runs. Top-right = legends</p>
          <div className="flex items-center gap-3 ml-5">
            <PlayerRevealBtn revealer={batRevealer} />
            <ZoomControls zoom={batMatrixZoom} setZoom={setBatMatrixZoom} />
          </div>
          <div className="card mt-3 overflow-x-auto">
            {matrixLoading ? <Loading message="Plotting batting matrix..." /> :
             !batMatrixData.length ? <p className="text-text-muted text-sm py-8 text-center">No data</p> : (() => {
              const visibleData = batMatrixData.slice(0, batRevealer.revealCount)
              const maxRuns = Math.max(...batMatrixData.map(d => d.runs))
              const runsThreshold = [...batMatrixData].sort((a, b) => b.runs - a.runs)[Math.min(7, batMatrixData.length - 1)]?.runs || 0
              const avgAvg = batMatrixData.reduce((s, d) => s + d.avg, 0) / batMatrixData.length
              const avgSR = batMatrixData.reduce((s, d) => s + d.sr, 0) / batMatrixData.length
              const chartH = Math.round(440 * Math.min(batMatrixZoom, 1.5))
              return (
                <>
                <div style={{ width: `${Math.max(100, batMatrixZoom * 100)}%`, minWidth: '100%' }}>
                <ResponsiveContainer width="100%" height={chartH}>
                  <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                    <XAxis dataKey="avg" type="number" name="Average" domain={[20, 'auto']}
                      tick={{ fill: '#8888A0', fontSize: 11 }} axisLine={{ stroke: '#2A2A3A' }} tickLine={false}
                      label={{ value: 'Batting Average', position: 'insideBottom', offset: -10, fill: '#8888A0', fontSize: 11 }} />
                    <YAxis dataKey="sr" type="number" name="Strike Rate" domain={[100, 'auto']}
                      tick={{ fill: '#8888A0', fontSize: 11 }} axisLine={false} tickLine={false}
                      label={{ value: 'Strike Rate', angle: -90, position: 'insideLeft', fill: '#8888A0', fontSize: 11 }} />
                    <ZAxis dataKey="runs" range={[40, 400]} name="Runs" />
                    <ReferenceLine x={avgAvg} stroke="#2A2A3A" strokeDasharray="4 4" />
                    <ReferenceLine y={avgSR} stroke="#2A2A3A" strokeDasharray="4 4" />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0]?.payload
                      return (
                        <div className="rounded-lg px-3 py-2 text-xs shadow-xl border" style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
                          <div className="flex items-center gap-2 mb-1">
                            <img src={realPlayerImageUrl(d?.player)} alt="" className="w-6 h-6 rounded-full border border-border-subtle object-cover"
                              onError={(e) => { e.target.src = playerAvatarUrl(d?.player, 24) }} />
                            <p className="text-text-primary font-semibold">{d?.player}</p>
                          </div>
                          <p style={{ color: '#B8FF00' }}>Runs: <span className="font-mono font-bold">{formatNumber(d?.runs)}</span></p>
                          <p style={{ color: '#00E5FF' }}>Average: <span className="font-mono font-bold">{formatDecimal(d?.avg)}</span></p>
                          <p style={{ color: '#FFB800' }}>SR: <span className="font-mono font-bold">{formatDecimal(d?.sr)}</span></p>
                          <p className="text-text-muted">Innings: <span className="font-mono">{d?.innings}</span> | 6s: <span className="font-mono">{d?.sixes}</span> | 4s: <span className="font-mono">{d?.fours}</span></p>
                        </div>
                      )
                    }} cursor={{ strokeDasharray: '3 3', stroke: '#8888A0' }} />
                    <Scatter data={visibleData} isAnimationActive={batRevealer.revealing} animationDuration={300} shape={(props) => {
                      const { cx, cy, payload } = props
                      const r = 5 + (payload.runs / maxRuns) * 18
                      const isElite = payload.avg >= 30 && payload.sr >= 135
                      const showLabel = payload.runs >= runsThreshold
                      const clipId = `bat-clip-${payload.player?.replace(/[^a-zA-Z0-9]/g, '')}`
                      return (
                        <g>
                          <circle cx={cx} cy={cy} r={r + 2}
                            fill="none"
                            stroke={isElite ? '#B8FF00' : payload.sr >= 140 ? '#FFB800' : payload.avg >= 30 ? '#00E5FF' : '#8B5CF6'}
                            strokeWidth={isElite ? 2.5 : 1.5}
                            strokeOpacity={0.9}
                          />
                          <defs>
                            <clipPath id={clipId}>
                              <circle cx={cx} cy={cy} r={r} />
                            </clipPath>
                          </defs>
                          <image
                            href={realPlayerImageUrl(payload.player)}
                            x={cx - r} y={cy - r}
                            width={r * 2} height={r * 2}
                            clipPath={`url(#${clipId})`}
                            preserveAspectRatio="xMidYMid slice"
                            onError={(e) => { e.target.setAttribute('href', playerAvatarUrl(payload.player, Math.round(r * 3))) }}
                          />
                          {showLabel && (
                            <text x={cx} y={cy - r - 7} textAnchor="middle" fill="#E8E8F0" fontSize={10} fontWeight={600} fontFamily="monospace">
                              {payload.shortName}
                            </text>
                          )}
                        </g>
                      )
                    }} />
                  </ScatterChart>
                </ResponsiveContainer>
                </div>
                {/* Player reveal counter */}
                {batRevealer.revealing && (
                  <div className="text-center mt-2">
                    <span className="text-accent-amber font-mono text-sm font-bold animate-pulse">
                      {batRevealer.revealCount} / {Math.min(10, batMatrixData.length)} players
                    </span>
                    {batRevealer.revealCount > 0 && (
                      <span className="ml-3 text-text-primary text-xs font-semibold">
                        {batMatrixData[batRevealer.revealCount - 1]?.player}
                      </span>
                    )}
                  </div>
                )}
                </>
              )
            })()}
          </div>
          <div className="flex flex-wrap gap-4 mt-3 ml-5">
            <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#B8FF00' }} /> Elite (Avg 30+ & SR 135+)
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#FFB800' }} /> Power Hitter (SR 140+)
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#00E5FF' }} /> Consistent (Avg 30+)
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#8B5CF6' }} /> Others
            </span>
          </div>
        </section>

        {/* Dismissal Types Donut */}
        <section>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-6 bg-accent-magenta rounded-full" />
            <h2 className="text-xl font-heading font-bold text-text-primary">How They Fall</h2>
          </div>
          <p className="text-text-muted text-xs mb-4 ml-5">Dismissal type breakdown</p>
          <div className="card">
            {dismissalLoading ? <Loading message="Loading dismissals..." /> :
             !dismissalTypes?.length ? <p className="text-text-muted text-sm py-8 text-center">No data</p> : (() => {
              const total = dismissalTypes.reduce((s, d) => s + d.count, 0)
              return (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={dismissalTypes} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                        dataKey="count" nameKey="type" stroke="#0A0A0F" strokeWidth={2} paddingAngle={2}
                        label={({ type, pct, cx, cy, midAngle, outerRadius: or }) => {
                          if (pct < 5) return null
                          const RADIAN = Math.PI / 180
                          const radius = or + 18
                          const x = cx + radius * Math.cos(-midAngle * RADIAN)
                          const y = cy + radius * Math.sin(-midAngle * RADIAN)
                          return (
                            <text x={x} y={y} fill="#C8C8D8" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight={600}>
                              {type} {pct}%
                            </text>
                          )
                        }}
                        labelLine={false}
                      >
                        {dismissalTypes.map((_, idx) => (
                          <Cell key={idx} fill={DISMISS_COLORS[idx % DISMISS_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0]?.payload
                        return (
                          <div className="rounded-lg px-3 py-2 text-xs shadow-xl border" style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
                            <p className="text-text-primary font-semibold">{d?.type}</p>
                            <p style={{ color: payload[0]?.color }}>Count: <span className="font-mono font-bold">{formatNumber(d?.count)}</span></p>
                            <p className="text-text-muted">{d?.pct}% of all dismissals</p>
                          </div>
                        )
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 justify-center">
                    {dismissalTypes.map((d, idx) => (
                      <span key={d.type} className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: DISMISS_COLORS[idx % DISMISS_COLORS.length] }} />
                        {d.type} <span className="font-mono text-text-muted">{d.pct}%</span>
                      </span>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════
          3b. BOWLING IMPACT MATRIX (Scatter)
          ═══════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #FF2D78, #8B5CF6)' }} />
          <h2 className="text-xl font-heading font-bold text-text-primary">Bowling Impact Matrix</h2>
        </div>
        <p className="text-text-muted text-xs mb-2 ml-5">Economy vs Bowling Average — bubble size = wickets. Bottom-left = elite</p>
        <div className="flex items-center gap-3 ml-5">
          <PlayerRevealBtn revealer={bowlRevealer} />
          <ZoomControls zoom={bowlMatrixZoom} setZoom={setBowlMatrixZoom} />
        </div>
        <div className="card mt-3 overflow-x-auto">
          {bowlMatrixLoading ? <Loading message="Plotting bowling matrix..." /> :
           !bowlMatrixData.length ? <p className="text-text-muted text-sm py-8 text-center">No data</p> : (() => {
            const visibleData = bowlMatrixData.slice(0, bowlRevealer.revealCount)
            const maxWickets = Math.max(...bowlMatrixData.map(d => d.wickets))
            const wicketsThreshold = [...bowlMatrixData].sort((a, b) => b.wickets - a.wickets)[Math.min(7, bowlMatrixData.length - 1)]?.wickets || 0
            const avgAvg = bowlMatrixData.reduce((s, d) => s + d.avg, 0) / bowlMatrixData.length
            const avgEcon = bowlMatrixData.reduce((s, d) => s + d.economy, 0) / bowlMatrixData.length
            const chartH = Math.round(440 * Math.min(bowlMatrixZoom, 1.5))
            return (
              <>
              <div style={{ width: `${Math.max(100, bowlMatrixZoom * 100)}%`, minWidth: '100%' }}>
              <ResponsiveContainer width="100%" height={chartH}>
                <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                  <XAxis dataKey="avg" type="number" name="Bowling Average" domain={[10, 'auto']}
                    tick={{ fill: '#8888A0', fontSize: 11 }} axisLine={{ stroke: '#2A2A3A' }} tickLine={false}
                    label={{ value: 'Bowling Average', position: 'insideBottom', offset: -10, fill: '#8888A0', fontSize: 11 }} />
                  <YAxis dataKey="economy" type="number" name="Economy" domain={[5, 'auto']}
                    tick={{ fill: '#8888A0', fontSize: 11 }} axisLine={false} tickLine={false}
                    label={{ value: 'Economy Rate', angle: -90, position: 'insideLeft', fill: '#8888A0', fontSize: 11 }} />
                  <ZAxis dataKey="wickets" range={[40, 400]} name="Wickets" />
                  <ReferenceLine x={avgAvg} stroke="#2A2A3A" strokeDasharray="4 4" />
                  <ReferenceLine y={avgEcon} stroke="#2A2A3A" strokeDasharray="4 4" />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="rounded-lg px-3 py-2 text-xs shadow-xl border" style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <img src={realPlayerImageUrl(d?.player)} alt="" className="w-6 h-6 rounded-full border border-border-subtle object-cover"
                            onError={(e) => { e.target.src = playerAvatarUrl(d?.player, 24) }} />
                          <p className="text-text-primary font-semibold">{d?.player}</p>
                        </div>
                        <p style={{ color: '#FF2D78' }}>Wickets: <span className="font-mono font-bold">{formatNumber(d?.wickets)}</span></p>
                        <p style={{ color: '#00E5FF' }}>Average: <span className="font-mono font-bold">{formatDecimal(d?.avg)}</span></p>
                        <p style={{ color: '#FFB800' }}>Economy: <span className="font-mono font-bold">{formatDecimal(d?.economy)}</span></p>
                        <p className="text-text-muted">Innings: <span className="font-mono">{d?.innings}</span> | Dot%: <span className="font-mono">{d?.dot_pct}%</span></p>
                      </div>
                    )
                  }} cursor={{ strokeDasharray: '3 3', stroke: '#8888A0' }} />
                  <Scatter data={visibleData} isAnimationActive={bowlRevealer.revealing} animationDuration={300} shape={(props) => {
                    const { cx, cy, payload } = props
                    const r = 5 + (payload.wickets / maxWickets) * 18
                    const isElite = payload.avg <= 22 && payload.economy <= 7.5
                    const showLabel = payload.wickets >= wicketsThreshold
                    const clipId = `bowl-clip-${payload.player?.replace(/[^a-zA-Z0-9]/g, '')}`
                    return (
                      <g>
                        <circle cx={cx} cy={cy} r={r + 2}
                          fill="none"
                          stroke={isElite ? '#FF2D78' : payload.economy <= 7 ? '#B8FF00' : payload.avg <= 20 ? '#00E5FF' : '#8B5CF6'}
                          strokeWidth={isElite ? 2.5 : 1.5}
                          strokeOpacity={0.9}
                        />
                        <defs>
                          <clipPath id={clipId}>
                            <circle cx={cx} cy={cy} r={r} />
                          </clipPath>
                        </defs>
                        <image
                          href={realPlayerImageUrl(payload.player)}
                          x={cx - r} y={cy - r}
                          width={r * 2} height={r * 2}
                          clipPath={`url(#${clipId})`}
                          preserveAspectRatio="xMidYMid slice"
                          onError={(e) => { e.target.setAttribute('href', playerAvatarUrl(payload.player, Math.round(r * 3))) }}
                        />
                        {showLabel && (
                          <text x={cx} y={cy - r - 7} textAnchor="middle" fill="#E8E8F0" fontSize={10} fontWeight={600} fontFamily="monospace">
                            {payload.shortName}
                          </text>
                        )}
                      </g>
                    )
                  }} />
                </ScatterChart>
              </ResponsiveContainer>
              </div>
              {/* Player reveal counter */}
              {bowlRevealer.revealing && (
                <div className="text-center mt-2">
                  <span className="text-accent-amber font-mono text-sm font-bold animate-pulse">
                    {bowlRevealer.revealCount} / {Math.min(10, bowlMatrixData.length)} players
                  </span>
                  {bowlRevealer.revealCount > 0 && (
                    <span className="ml-3 text-text-primary text-xs font-semibold">
                      {bowlMatrixData[bowlRevealer.revealCount - 1]?.player}
                    </span>
                  )}
                </div>
              )}
              </>
            )
          })()}
        </div>
        <div className="flex flex-wrap gap-4 mt-3 ml-5">
          <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#FF2D78' }} /> Elite (Avg &le;22 & Econ &le;7.5)
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#B8FF00' }} /> Economical (Econ &le;7)
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#00E5FF' }} /> Wicket-taker (Avg &le;20)
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#8B5CF6' }} /> Others
          </span>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          4. PHASE DOMINANCE — Team Run Rates by Phase
          ═══════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(to bottom, #B8FF00, #FFB800, #FF2D78)' }} />
          <h2 className="text-xl font-heading font-bold text-text-primary">Phase Dominance</h2>
        </div>
        <p className="text-text-muted text-xs mb-4 ml-5">Team run rates across powerplay, middle, and death overs — reveals batting DNA</p>
        <div className="card">
          {phaseLoading ? <Loading message="Analyzing phase dominance..." /> :
           !phaseDominance?.length ? <p className="text-text-muted text-sm py-8 text-center">No data</p> : (() => {
            const phaseData = phaseDominance
              .filter(d => d.powerplay && d.middle && d.death)
              .map(d => ({ ...d, team: getTeamAbbr(d.team), fullTeam: d.team, fill: getTeamColor(d.team) }))
            return (
              <ResponsiveContainer width="100%" height={Math.max(380, phaseData.length * 36)}>
                <BarChart data={phaseData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                  <XAxis type="number" tick={{ fill: '#8888A0', fontSize: 11 }} axisLine={{ stroke: '#2A2A3A' }} tickLine={false}
                    label={{ value: 'Run Rate', position: 'insideBottom', offset: -2, fill: '#8888A0', fontSize: 10 }} />
                  <YAxis type="category" dataKey="team" width={50} tick={{ fill: '#C8C8D8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="rounded-lg px-3 py-2 text-xs shadow-xl border" style={{ background: '#16161F', borderColor: '#2A2A3A' }}>
                        <p className="text-text-primary font-semibold mb-1">{d?.fullTeam}</p>
                        <p style={{ color: '#00E5FF' }}>Powerplay (1-6): <span className="font-mono font-bold">{d?.powerplay}</span></p>
                        <p style={{ color: '#B8FF00' }}>Middle (7-15): <span className="font-mono font-bold">{d?.middle}</span></p>
                        <p style={{ color: '#FF2D78' }}>Death (16-20): <span className="font-mono font-bold">{d?.death}</span></p>
                      </div>
                    )
                  }} />
                  <Legend wrapperStyle={{ color: '#8888A0', fontSize: 11, paddingTop: 10 }} />
                  <Bar dataKey="powerplay" name="Powerplay (Overs 1-6)" fill="#00E5FF" fillOpacity={0.9} barSize={10} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="middle" name="Middle (Overs 7-15)" fill="#B8FF00" fillOpacity={0.9} barSize={10} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="death" name="Death (Overs 16-20)" fill="#FF2D78" fillOpacity={0.9} barSize={10} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          })()}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          5. ORANGE CAP & PURPLE CAP WINNERS
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orange Cap */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 rounded-full" style={{ background: '#FF8C00' }} />
            <h2 className="text-xl font-heading font-bold" style={{ color: '#FF8C00' }}>{tournament.awards.batting} Winners</h2>
          </div>
          <div className="card">
            {capLoading ? <Loading message={`Loading ${tournament.awards.batting}...`} /> :
             !capWinners?.orange_cap?.length ? <p className="text-text-muted text-sm py-4 text-center">No data</p> : (
              <div className="divide-y divide-border-subtle">
                {[...capWinners.orange_cap].reverse().map((c) => (
                  <div key={c.season} className="flex items-center justify-between py-2.5 px-1 hover:bg-bg-card/50 transition-colors rounded">
                    <div className="flex items-center gap-3">
                      <span className="text-text-muted text-xs font-mono w-14">{c.season}</span>
                      <Link to={`/batting/${encodeURIComponent(c.player)}`}
                        className="text-sm font-medium text-accent-cyan hover:text-white hover:underline transition-colors">
                        {c.player}
                      </Link>
                    </div>
                    <span className="font-mono font-bold text-sm" style={{ color: '#FF8C00' }}>
                      {c.value.toLocaleString()} runs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Purple Cap */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 rounded-full" style={{ background: '#8B5CF6' }} />
            <h2 className="text-xl font-heading font-bold" style={{ color: '#8B5CF6' }}>{tournament.awards.bowling} Winners</h2>
          </div>
          <div className="card">
            {capLoading ? <Loading message={`Loading ${tournament.awards.bowling}...`} /> :
             !capWinners?.purple_cap?.length ? <p className="text-text-muted text-sm py-4 text-center">No data</p> : (
              <div className="divide-y divide-border-subtle">
                {[...capWinners.purple_cap].reverse().map((c) => (
                  <div key={c.season} className="flex items-center justify-between py-2.5 px-1 hover:bg-bg-card/50 transition-colors rounded">
                    <div className="flex items-center gap-3">
                      <span className="text-text-muted text-xs font-mono w-14">{c.season}</span>
                      <Link to={`/bowling/${encodeURIComponent(c.player)}`}
                        className="text-sm font-medium text-accent-cyan hover:text-white hover:underline transition-colors">
                        {c.player}
                      </Link>
                    </div>
                    <span className="font-mono font-bold text-sm" style={{ color: '#8B5CF6' }}>
                      {c.value} wkts
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
