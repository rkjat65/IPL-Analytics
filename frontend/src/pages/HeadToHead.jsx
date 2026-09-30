import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import SEO from '../components/SEO'
import { useFetch } from '../hooks/useFetch'
import { getTeams, compareTeams } from '../lib/api'
import Loading from '../components/ui/Loading'
import { formatNumber, formatDecimal, formatDate } from '../utils/format'
import { getTeamColor, getTeamAbbr } from '../constants/teams'
import { useTournament } from '../contexts/TournamentContext'
import TeamLogo from '../components/ui/TeamLogo'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  AreaChart, Area,
} from 'recharts'

/* ── Neon Tooltip ─────────────────────────────────────────── */
function NeonTooltip({ children }) {
  return (
    <div className="bg-[#16161F] border border-[#2A2A3A] rounded-lg px-3 py-2 shadow-lg text-xs">
      {children}
    </div>
  )
}

/* ── Section Header ───────────────────────────────────────── */
function SectionHeader({ title, accentColor = 'bg-accent-cyan' }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-1 h-6 ${accentColor} rounded-full`} />
      <h2 className="text-xl font-heading font-bold text-text-primary">{title}</h2>
    </div>
  )
}

/* ── Visual Stat Row ──────────────────────────────────────── */
function VisualStatRow({ label, val1, val2, color1, color2, higherIsBetter = true, isDecimal = false }) {
  const n1 = parseFloat(val1) || 0
  const n2 = parseFloat(val2) || 0
  const maxVal = Math.max(n1, n2, 1)
  const pct1 = (n1 / maxVal) * 100
  const pct2 = (n2 / maxVal) * 100
  const better1 = higherIsBetter ? n1 > n2 : n1 < n2
  const better2 = higherIsBetter ? n2 > n1 : n2 < n1
  const display1 = isDecimal ? formatDecimal(n1, 1) : formatNumber(n1)
  const display2 = isDecimal ? formatDecimal(n2, 1) : formatNumber(n2)

  return (
    <div className="py-3 border-b border-[#1E1E2A] last:border-b-0">
      <p className="text-center text-xs text-text-muted uppercase tracking-wider mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        {/* Team 1 bar (right-aligned, grows left) */}
        <div className="flex items-center gap-2">
          <span className={`font-mono text-sm font-bold min-w-[50px] text-right ${better1 ? 'text-accent-lime' : 'text-text-primary'}`}>
            {display1}
          </span>
          <div className="flex-1 h-3 rounded-full bg-[#1A1A24] overflow-hidden flex justify-end">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct1}%`, backgroundColor: color1, opacity: better1 ? 1 : 0.5 }}
            />
          </div>
        </div>
        {/* Team 2 bar (left-aligned, grows right) */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-3 rounded-full bg-[#1A1A24] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct2}%`, backgroundColor: color2, opacity: better2 ? 1 : 0.5 }}
            />
          </div>
          <span className={`font-mono text-sm font-bold min-w-[50px] text-left ${better2 ? 'text-accent-lime' : 'text-text-primary'}`}>
            {display2}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Custom label for last data point on area chart ──────── */
function CumulativeEndLabel({ viewBox, value, fill }) {
  if (!viewBox) return null
  return (
    <text x={viewBox.x} y={viewBox.y - 10} fill={fill} fontSize={13} fontWeight="bold" textAnchor="middle" fontFamily="monospace">
      {value}
    </text>
  )
}

export default function HeadToHead() {
  const tournament = useTournament()
  const [searchParams, setSearchParams] = useSearchParams()
  const [team1, setTeam1] = useState(searchParams.get('team1') || '')
  const [team2, setTeam2] = useState(searchParams.get('team2') || '')

  const { data: teams } = useFetch(() => getTeams(), [])

  const bothSelected = team1 && team2 && team1 !== team2

  const { data: comparison, loading: compLoading, error: compError } = useFetch(
    () => (bothSelected ? compareTeams(team1, team2) : Promise.resolve(null)),
    [team1, team2]
  )

  useEffect(() => {
    const params = new URLSearchParams()
    if (team1) params.set('team1', team1)
    if (team2) params.set('team2', team2)
    setSearchParams(params, { replace: true })
  }, [team1, team2])

  const teamOptions = (teams || []).map((t) => ({ value: t, label: t }))
  const color1 = getTeamColor(team1)
  const color2 = getTeamColor(team2)
  const abbr1 = getTeamAbbr(team1)
  const abbr2 = getTeamAbbr(team2)

  const selectClass =
    'bg-[#111118] border border-[#1E1E2A] rounded-lg px-4 py-3 text-sm text-text-primary font-body focus:outline-none focus:border-accent-cyan transition-colors appearance-none cursor-pointer pr-8 w-full'
  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238888A0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
  }

  const h2h = comparison?.head_to_head
  const t1Stats = comparison?.team1
  const t2Stats = comparison?.team2
  const seasonH2H = comparison?.season_wise_h2h
  const recentMatches = comparison?.recent_matches
  const tossStats = comparison?.toss_stats
  const avgH2HScores = comparison?.avg_h2h_scores

  // H2H wins
  const t1Wins = h2h?.team1_wins ?? 0
  const t2Wins = h2h?.team2_wins ?? 0
  const totalH2H = t1Wins + t2Wins || 1
  const t1WinPct = ((t1Wins / totalH2H) * 100).toFixed(1)
  const t2WinPct = ((t2Wins / totalH2H) * 100).toFixed(1)

  /* ── Win Streak Analysis data ──────────────────────────── */
  const streakData = useMemo(() => {
    if (!recentMatches || recentMatches.length === 0) return { dots: [], streak: null }
    // Take last 10 matches (recentMatches is typically most-recent-first)
    const last10 = recentMatches.slice(0, 10)
    const dots = last10.map((m) => {
      const year = m.date ? new Date(m.date).getFullYear() : (m.season || '?')
      let dotColor = '#555568' // gray for no result
      if (m.winner === team1) dotColor = color1
      else if (m.winner === team2) dotColor = color2
      return { winner: m.winner, color: dotColor, year: String(year) }
    })

    // Current streak: count consecutive wins by the same team from most recent
    let streakTeam = null
    let streakCount = 0
    for (const m of last10) {
      if (!m.winner || (m.winner !== team1 && m.winner !== team2)) break
      if (streakTeam === null) {
        streakTeam = m.winner
        streakCount = 1
      } else if (m.winner === streakTeam) {
        streakCount++
      } else {
        break
      }
    }

    return {
      dots,
      streak: streakTeam && streakCount > 1
        ? { team: streakTeam, count: streakCount, color: streakTeam === team1 ? color1 : color2, abbr: streakTeam === team1 ? abbr1 : abbr2 }
        : null,
    }
  }, [recentMatches, team1, team2, color1, color2, abbr1, abbr2])

  /* ── Cumulative H2H chart data ─────────────────────────── */
  const cumulativeData = useMemo(() => {
    if (!seasonH2H) return []
    let cum1 = 0, cum2 = 0
    return seasonH2H.map(s => {
      cum1 += s.team1_wins || 0
      cum2 += s.team2_wins || 0
      return { season: String(s.season), [abbr1]: cum1, [abbr2]: cum2 }
    })
  }, [seasonH2H, abbr1, abbr2])

  /* ── Toss donut data ─────────────────────────────────────── */
  const tossDonutData = useMemo(() => {
    if (!tossStats) return []
    return [
      { name: abbr1 + ' Toss', value: tossStats.team1_toss_wins || 0, color: color1 },
      { name: abbr2 + ' Toss', value: tossStats.team2_toss_wins || 0, color: color2 },
    ].filter((d) => d.value > 0)
  }, [tossStats, abbr1, abbr2, color1, color2])

  const tossDecisionData = useMemo(() => {
    if (!tossStats) return []
    return [
      { name: 'Bat First Wins', value: tossStats.bat_first_wins || 0, color: '#FFB800' },
      { name: 'Chase Wins', value: tossStats.chase_wins || 0, color: '#00F0FF' },
    ].filter((d) => d.value > 0)
  }, [tossStats])

  /* ── Swap handler ────────────────────────────────────────── */
  const handleSwap = () => {
    setTeam1(team2)
    setTeam2(team1)
  }

  return (
    <div className="space-y-8">
      <SEO
        title={`${tournament.shortName} Head-to-Head — Team Rivalry Stats`}
        description={`Compare any two ${tournament.name} teams: all-time win-loss records, venue breakdowns, recent form, and historical matchups.`}
        url="/h2h"
      />
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-heading font-bold text-text-primary">Head to Head</h1>
        <p className="text-text-secondary text-sm mt-1">Deep-dive comparison between two {tournament.shortName} teams</p>
      </div>

      {/* ═══════════════════════════════════════════════════════
          TEAM SELECTORS
          ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
        <div>
          <label className="text-text-secondary text-sm font-body block mb-2">Team 1</label>
          <div className="relative">
            {team1 && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                <TeamLogo team={team1} size={20} />
              </div>
            )}
            <select
              value={team1}
              onChange={(e) => setTeam1(e.target.value)}
              className={selectClass}
              style={{ ...selectStyle, paddingLeft: team1 ? '2.25rem' : '1rem' }}
            >
              <option value="">Select Team</option>
              {teamOptions
                .filter((t) => t.value !== team2)
                .map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
          </div>
        </div>

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          disabled={!bothSelected}
          className="hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-[#111118] border border-[#1E1E2A] text-text-muted hover:text-accent-cyan hover:border-accent-cyan transition-colors disabled:opacity-30 disabled:cursor-not-allowed mb-0.5"
          title="Swap teams"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>

        <div>
          <label className="text-text-secondary text-sm font-body block mb-2">Team 2</label>
          <div className="relative">
            {team2 && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                <TeamLogo team={team2} size={20} />
              </div>
            )}
            <select
              value={team2}
              onChange={(e) => setTeam2(e.target.value)}
              className={selectClass}
              style={{ ...selectStyle, paddingLeft: team2 ? '2.25rem' : '1rem' }}
            >
              <option value="">Select Team</option>
              {teamOptions
                .filter((t) => t.value !== team1)
                .map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Mobile swap button */}
      {bothSelected && (
        <div className="flex md:hidden justify-center -mt-4">
          <button
            onClick={handleSwap}
            className="flex items-center gap-2 text-xs text-text-muted hover:text-accent-cyan transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            Swap teams
          </button>
        </div>
      )}

      {/* Empty state */}
      {!bothSelected && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-16 h-16 rounded-full bg-[#111118] border border-[#1E1E2A] flex items-center justify-center mb-2">
            <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
            </svg>
          </div>
          <p className="text-text-muted text-sm">Select two different teams to compare their stats</p>
        </div>
      )}

      {bothSelected && compLoading && <Loading message="Analyzing head-to-head records..." />}

      {bothSelected && compError && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-danger font-heading text-lg">Failed to load comparison</p>
          <p className="text-text-secondary text-sm">{compError}</p>
        </div>
      )}

      {bothSelected && comparison && !compLoading && (
        <>
          {/* ═══════════════════════════════════════════════════
              1. H2H RECORD HERO
              ═══════════════════════════════════════════════════ */}
          {h2h && (
            <div className="bg-[#111118] border border-[#1E1E2A] rounded-2xl p-6 md:p-8">
              {/* Team names + abbreviations */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-3">
                    <TeamLogo team={team1} size={40} />
                    <span
                      className="text-4xl md:text-5xl font-heading font-black tracking-tight"
                      style={{ color: color1 }}
                    >
                      {abbr1}
                    </span>
                  </div>
                  <span className="text-text-muted text-xs mt-1 max-w-[140px] truncate">{team1}</span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-text-muted text-xs uppercase tracking-widest">Head to Head</span>
                  <span className="font-mono text-text-secondary text-sm">
                    {h2h.played ?? totalH2H} matches
                  </span>
                </div>

                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-3">
                    <span
                      className="text-4xl md:text-5xl font-heading font-black tracking-tight"
                      style={{ color: color2 }}
                    >
                      {abbr2}
                    </span>
                    <TeamLogo team={team2} size={40} />
                  </div>
                  <span className="text-text-muted text-xs mt-1 max-w-[140px] truncate text-right">{team2}</span>
                </div>
              </div>

              {/* Win counts */}
              <div className="flex items-end justify-between mb-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-3xl md:text-4xl font-black" style={{ color: color1 }}>
                    {t1Wins}
                  </span>
                  <span className="text-text-muted text-xs">wins</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-text-muted text-xs">wins</span>
                  <span className="font-mono text-3xl md:text-4xl font-black" style={{ color: color2 }}>
                    {t2Wins}
                  </span>
                </div>
              </div>

              {/* Split bar */}
              <div className="relative">
                <div className="flex h-5 rounded-full overflow-hidden gap-[2px]">
                  <div
                    className="rounded-l-full transition-all duration-700 ease-out"
                    style={{
                      width: `${(t1Wins / totalH2H) * 100}%`,
                      backgroundColor: color1,
                      boxShadow: `0 0 20px ${color1}40`,
                    }}
                  />
                  <div
                    className="rounded-r-full transition-all duration-700 ease-out"
                    style={{
                      width: `${(t2Wins / totalH2H) * 100}%`,
                      backgroundColor: color2,
                      boxShadow: `0 0 20px ${color2}40`,
                    }}
                  />
                </div>
                {/* Percentage labels below bar */}
                <div className="flex justify-between mt-2">
                  <span className="font-mono text-sm font-bold" style={{ color: color1 }}>{t1WinPct}%</span>
                  <span className="font-mono text-sm font-bold" style={{ color: color2 }}>{t2WinPct}%</span>
                </div>
              </div>

              {/* Quick verdict */}
              {t1Wins !== t2Wins && (
                <p className="text-center text-text-secondary text-sm mt-4">
                  <span className="font-semibold" style={{ color: t1Wins > t2Wins ? color1 : color2 }}>
                    {t1Wins > t2Wins ? team1 : team2}
                  </span>
                  {' '}leads the head-to-head by{' '}
                  <span className="font-mono font-bold text-text-primary">
                    {Math.abs(t1Wins - t2Wins)}
                  </span>
                  {' '}{Math.abs(t1Wins - t2Wins) === 1 ? 'win' : 'wins'}
                </p>
              )}
              {t1Wins === t2Wins && t1Wins > 0 && (
                <p className="text-center text-text-secondary text-sm mt-4">
                  The rivalry is <span className="font-semibold text-accent-amber">perfectly balanced</span>
                </p>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════
              2. WIN STREAK ANALYSIS + AVG H2H SCORES
              ═══════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Win Streak Analysis */}
            {streakData.dots.length > 0 && (
              <section>
                <SectionHeader title="Win Streak Analysis" accentColor="bg-accent-magenta" />
                <div className="bg-[#111118] border border-[#1E1E2A] rounded-2xl p-6 flex flex-col justify-center h-[calc(100%-2.5rem)]">
                  <p className="text-text-muted text-xs uppercase tracking-wider text-center mb-5">Last {streakData.dots.length} Encounters</p>

                  {/* Dot row */}
                  <div className="flex items-center justify-center gap-3 mb-2">
                    {streakData.dots.map((dot, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-1.5">
                        <div
                          className="w-8 h-8 rounded-full border-2 transition-all duration-500 flex items-center justify-center"
                          style={{
                            backgroundColor: dot.color + '25',
                            borderColor: dot.color,
                            boxShadow: dot.color !== '#555568' ? `0 0 10px ${dot.color}30` : 'none',
                          }}
                        >
                          <span className="text-[9px] font-bold font-mono" style={{ color: dot.color }}>
                            {dot.winner === team1 ? abbr1 : dot.winner === team2 ? abbr2 : '-'}
                          </span>
                        </div>
                        <span className="text-[10px] text-text-muted font-mono">{dot.year}</span>
                      </div>
                    ))}
                  </div>

                  {/* Legend */}
                  <div className="flex justify-center gap-5 mt-4 mb-4">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color1 }} />
                      <span className="text-text-secondary">{abbr1} win</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color2 }} />
                      <span className="text-text-secondary">{abbr2} win</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="w-3 h-3 rounded-full bg-[#555568]" />
                      <span className="text-text-secondary">No result</span>
                    </div>
                  </div>

                  {/* Current streak */}
                  <div className="text-center pt-4 border-t border-[#1E1E2A]">
                    {streakData.streak ? (
                      <p className="text-sm">
                        <span className="text-text-muted uppercase tracking-wider text-xs">Current Streak: </span>
                        <span className="font-heading font-bold" style={{ color: streakData.streak.color }}>
                          {streakData.streak.abbr}
                        </span>
                        <span className="font-mono font-bold text-accent-lime ml-1">
                          {streakData.streak.count} wins in a row
                        </span>
                      </p>
                    ) : (
                      <p className="text-text-muted text-sm">No active winning streak</p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Average H2H Scores */}
            {avgH2HScores ? (
              <section>
                <SectionHeader title="Average H2H Scores" accentColor="bg-accent-amber" />
                <div className="bg-[#111118] border border-[#1E1E2A] rounded-2xl p-6 flex flex-col justify-center h-[calc(100%-2.5rem)]">
                  <div className="space-y-8">
                    {/* Team 1 avg score */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-heading font-bold" style={{ color: color1 }}>{abbr1}</span>
                        <span className="font-mono text-2xl font-black text-text-primary">
                          {formatDecimal(avgH2HScores.team1_avg, 1)}
                        </span>
                      </div>
                      <div className="h-4 rounded-full bg-[#1A1A24] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${(avgH2HScores.team1_avg / Math.max(avgH2HScores.team1_avg, avgH2HScores.team2_avg, 1)) * 100}%`,
                            backgroundColor: color1,
                            boxShadow: `0 0 12px ${color1}40`,
                          }}
                        />
                      </div>
                    </div>
                    {/* Team 2 avg score */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-heading font-bold" style={{ color: color2 }}>{abbr2}</span>
                        <span className="font-mono text-2xl font-black text-text-primary">
                          {formatDecimal(avgH2HScores.team2_avg, 1)}
                        </span>
                      </div>
                      <div className="h-4 rounded-full bg-[#1A1A24] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${(avgH2HScores.team2_avg / Math.max(avgH2HScores.team1_avg, avgH2HScores.team2_avg, 1)) * 100}%`,
                            backgroundColor: color2,
                            boxShadow: `0 0 12px ${color2}40`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Difference callout */}
                    {avgH2HScores.team1_avg !== avgH2HScores.team2_avg && (
                      <div className="text-center pt-4 border-t border-[#1E1E2A]">
                        <span className="text-text-muted text-xs uppercase tracking-wider">Score Advantage</span>
                        <p className="mt-1">
                          <span className="font-heading font-bold" style={{
                            color: avgH2HScores.team1_avg > avgH2HScores.team2_avg ? color1 : color2,
                          }}>
                            {avgH2HScores.team1_avg > avgH2HScores.team2_avg ? abbr1 : abbr2}
                          </span>
                          <span className="text-text-secondary text-sm"> by </span>
                          <span className="font-mono font-bold text-accent-lime">
                            {formatDecimal(Math.abs(avgH2HScores.team1_avg - avgH2HScores.team2_avg), 1)}
                          </span>
                          <span className="text-text-secondary text-sm"> runs on average</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            ) : (
              /* Fallback: if no avg_h2h_scores, show the side-by-side stats here */
              t1Stats && t2Stats && (
                <section>
                  <SectionHeader title="Team Overview" accentColor="bg-accent-amber" />
                  <div className="bg-[#111118] border border-[#1E1E2A] rounded-2xl p-6 flex flex-col justify-center h-[calc(100%-2.5rem)]">
                    <div className="grid grid-cols-2 gap-6">
                      {[
                        { label: 'Win %', v1: t1Stats.win_pct, v2: t2Stats.win_pct, dec: true },
                        { label: 'Avg Score', v1: t1Stats.avg_score, v2: t2Stats.avg_score, dec: true },
                        { label: 'Highest', v1: t1Stats.highest_total, v2: t2Stats.highest_total },
                        { label: 'Matches', v1: t1Stats.matches, v2: t2Stats.matches },
                      ].map((item) => (
                        <div key={item.label} className="text-center">
                          <p className="text-text-muted text-xs uppercase tracking-wider mb-2">{item.label}</p>
                          <div className="flex justify-center gap-4">
                            <span className="font-mono font-bold" style={{ color: color1 }}>
                              {item.dec ? formatDecimal(item.v1, 1) : formatNumber(item.v1)}
                            </span>
                            <span className="text-text-muted">/</span>
                            <span className="font-mono font-bold" style={{ color: color2 }}>
                              {item.dec ? formatDecimal(item.v2, 1) : formatNumber(item.v2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )
            )}
          </div>

          {/* ═══════════════════════════════════════════════════
              3. CUMULATIVE H2H WINS OVER SEASONS
              ═══════════════════════════════════════════════════ */}
          {cumulativeData.length > 0 && (
            <section>
              <SectionHeader title={`Cumulative H2H Wins Over ${tournament.competitionLabelPlural}`} accentColor="bg-accent-cyan" />
              <div className="bg-[#111118] border border-[#1E1E2A] rounded-2xl p-4">
                <ResponsiveContainer width="100%" height={340}>
                  <AreaChart data={cumulativeData} margin={{ top: 25, right: 30, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color1} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color1} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color2} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color2} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="season"
                      tick={{ fill: '#8888A0', fontSize: 11 }}
                      axisLine={{ stroke: '#1E1E2A' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: '#8888A0', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      label={{ value: 'Cumulative Wins', angle: -90, position: 'insideLeft', fill: '#8888A0', fontSize: 11, dx: -5 }}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <NeonTooltip>
                            <p className="text-text-primary font-semibold mb-1">{tournament.competitionLabel} {label}</p>
                            {payload.map((p, i) => (
                              <p key={i} style={{ color: p.stroke }}>
                                {p.name}: <span className="font-mono font-bold">{p.value} wins</span>
                              </p>
                            ))}
                          </NeonTooltip>
                        )
                      }}
                      cursor={{ stroke: '#2A2A3A' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                    <Area
                      type="monotone"
                      dataKey={abbr1}
                      stroke={color1}
                      strokeWidth={2.5}
                      fill="url(#grad1)"
                      fillOpacity={1}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                      label={({ index, x, y, value }) => {
                        if (index === cumulativeData.length - 1) {
                          return (
                            <text x={x} y={y - 12} fill={color1} fontSize={13} fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                              {value}
                            </text>
                          )
                        }
                        return null
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey={abbr2}
                      stroke={color2}
                      strokeWidth={2.5}
                      fill="url(#grad2)"
                      fillOpacity={1}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                      label={({ index, x, y, value }) => {
                        if (index === cumulativeData.length - 1) {
                          return (
                            <text x={x} y={y - 12} fill={color2} fontSize={13} fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                              {value}
                            </text>
                          )
                        }
                        return null
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════════════
              4. TOSS IMPACT
              ═══════════════════════════════════════════════════ */}
          {tossStats && (tossDonutData.length > 0 || tossDecisionData.length > 0) && (
            <section>
              <SectionHeader title="Toss Impact" accentColor="bg-accent-lime" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Toss Wins Donut */}
                {tossDonutData.length > 0 && (
                  <div className="bg-[#111118] border border-[#1E1E2A] rounded-2xl p-4">
                    <p className="text-center text-text-secondary text-sm mb-2">Toss Wins in H2H</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={tossDonutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="none"
                        >
                          {tossDonutData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload
                            return (
                              <NeonTooltip>
                                <p style={{ color: d.color }} className="font-semibold">
                                  {d.name}: <span className="font-mono font-bold">{d.value}</span>
                                </p>
                              </NeonTooltip>
                            )
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-6">
                      {tossDonutData.map((d) => (
                        <div key={d.name} className="flex items-center gap-2 text-sm">
                          <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                          <span className="text-text-secondary">{d.name}</span>
                          <span className="font-mono text-text-primary font-semibold">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bat First vs Chase Wins */}
                {tossDecisionData.length > 0 && (
                  <div className="bg-[#111118] border border-[#1E1E2A] rounded-2xl p-4">
                    <p className="text-center text-text-secondary text-sm mb-2">Batting First vs Chasing Wins</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={tossDecisionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="none"
                          label={({ name, value, percent }) =>
                            `${(percent * 100).toFixed(0)}%`
                          }
                        >
                          {tossDecisionData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload
                            return (
                              <NeonTooltip>
                                <p style={{ color: d.color }} className="font-semibold">
                                  {d.name}: <span className="font-mono font-bold">{d.value}</span>
                                </p>
                              </NeonTooltip>
                            )
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-6">
                      {tossDecisionData.map((d) => (
                        <div key={d.name} className="flex items-center gap-2 text-sm">
                          <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                          <span className="text-text-secondary">{d.name}</span>
                          <span className="font-mono text-text-primary font-semibold">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════════════
              5. SIDE-BY-SIDE STATS WITH VISUAL BARS
              ═══════════════════════════════════════════════════ */}
          {t1Stats && t2Stats && (
            <section>
              <SectionHeader title="Team Comparison" accentColor="bg-accent-cyan" />
              <div className="bg-[#111118] border border-[#1E1E2A] rounded-2xl p-6">
                {/* Column headers */}
                <div className="grid grid-cols-2 gap-3 mb-2 pb-3 border-b border-[#1E1E2A]">
                  <div className="flex items-center gap-2">
                    <TeamLogo team={team1} size={24} />
                    <span className="font-heading font-bold text-sm" style={{ color: color1 }}>{team1}</span>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <span className="font-heading font-bold text-sm" style={{ color: color2 }}>{team2}</span>
                    <TeamLogo team={team2} size={24} />
                  </div>
                </div>

                <VisualStatRow label="Matches Played" val1={t1Stats.matches} val2={t2Stats.matches} color1={color1} color2={color2} />
                <VisualStatRow label="Wins" val1={t1Stats.wins} val2={t2Stats.wins} color1={color1} color2={color2} />
                {t1Stats.losses !== undefined && (
                  <VisualStatRow label="Losses" val1={t1Stats.losses} val2={t2Stats.losses} color1={color1} color2={color2} higherIsBetter={false} />
                )}
                <VisualStatRow label="Win %" val1={t1Stats.win_pct} val2={t2Stats.win_pct} color1={color1} color2={color2} isDecimal />
                <VisualStatRow label="Avg Score" val1={t1Stats.avg_score} val2={t2Stats.avg_score} color1={color1} color2={color2} isDecimal />
                <VisualStatRow label="Highest Total" val1={t1Stats.highest_total} val2={t2Stats.highest_total} color1={color1} color2={color2} />
                {t1Stats.lowest_total !== undefined && (
                  <VisualStatRow label="Lowest Total" val1={t1Stats.lowest_total} val2={t2Stats.lowest_total} color1={color1} color2={color2} higherIsBetter={false} />
                )}
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════════════
              6. RECENT H2H MATCHES
              ═══════════════════════════════════════════════════ */}
          {recentMatches && recentMatches.length > 0 && (
            <section>
              <SectionHeader title="Recent Encounters" accentColor="bg-accent-magenta" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recentMatches.map((match, idx) => {
                  const isT1Winner = match.winner === team1
                  const isT2Winner = match.winner === team2
                  const winnerColor = isT1Winner ? color1 : isT2Winner ? color2 : '#8888A0'

                  return (
                    <div
                      key={idx}
                      className="bg-[#111118] border rounded-2xl p-5 transition-all hover:border-[#2A2A3A]"
                      style={{ borderColor: '#1E1E2A' }}
                    >
                      {/* Date + Season */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-text-muted text-xs font-mono">
                          {formatDate(match.date)}
                        </span>
                        {match.season && (
                          <span className="text-xs text-text-muted bg-[#1A1A24] px-2 py-0.5 rounded-full">
                            {match.season}
                          </span>
                        )}
                      </div>

                      {/* Scores */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex flex-col items-start">
                          <div className="flex items-center gap-1.5">
                            <TeamLogo team={team1} size={20} />
                            <span className="font-heading font-bold text-sm" style={{ color: color1 }}>{abbr1}</span>
                          </div>
                          <span className={`font-mono text-xl font-black ${isT1Winner ? 'text-text-primary' : 'text-text-muted'}`}>
                            {match.team1_score ?? '-'}
                          </span>
                        </div>

                        <div className="flex flex-col items-center">
                          <span className="text-text-muted text-xs">vs</span>
                        </div>

                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1.5">
                            <span className="font-heading font-bold text-sm" style={{ color: color2 }}>{abbr2}</span>
                            <TeamLogo team={team2} size={20} />
                          </div>
                          <span className={`font-mono text-xl font-black ${isT2Winner ? 'text-text-primary' : 'text-text-muted'}`}>
                            {match.team2_score ?? '-'}
                          </span>
                        </div>
                      </div>

                      {/* Winner + margin */}
                      <div
                        className="text-center text-xs font-semibold rounded-lg py-1.5 mb-2"
                        style={{
                          backgroundColor: winnerColor + '15',
                          color: winnerColor,
                          border: `1px solid ${winnerColor}30`,
                        }}
                      >
                        {match.winner
                          ? `${match.winner === team1 ? abbr1 : abbr2} won${match.margin ? ` by ${match.margin}` : ''}`
                          : 'No result'}
                      </div>

                      {/* Venue */}
                      {match.venue && (
                        <p className="text-text-muted text-xs text-center truncate mt-1">
                          {match.venue}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
