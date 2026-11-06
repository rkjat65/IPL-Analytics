import { Link } from 'react-router-dom'
import useUrlState from '../hooks/useUrlState'
import { useFetch } from '../hooks/useFetch'
import { getPhaseSummary, getOverProfile, getPhaseLeaders, getSeasons, getTeams, getVenues } from '../lib/api'
import SEO from '../components/SEO'
import { breadcrumbSchema } from '../lib/breadcrumbs'
import DataTable from '../components/ui/DataTable'
import Select from '../components/ui/Select'
import Loading from '../components/ui/Loading'
import MultiSeasonSelect from '../components/ui/MultiSeasonSelect'
import PlayerAvatar from '../components/ui/PlayerAvatar'
import { useTournament } from '../contexts/TournamentContext'
import { formatDecimal, formatNumber } from '../utils/format'
import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const PHASES = [
  { key: 'powerplay', label: 'Powerplay', overs: 'overs 1 to 6', color: '#00E5FF', text: 'text-accent-cyan' },
  { key: 'middle', label: 'Middle', overs: 'overs 7 to 15', color: '#FFB800', text: 'text-accent-amber' },
  { key: 'death', label: 'Death', overs: 'overs 16 to 20', color: '#FF2D78', text: 'text-accent-magenta' },
]
const AXIS = { fill: '#8888A0', fontSize: 11, fontFamily: 'JetBrains Mono' }
const LINE = { stroke: '#1E1E2A' }
const mono = (v) => <span className="font-mono">{v ?? '-'}</span>
const dec = (v) => <span className="font-mono">{v == null ? '-' : formatDecimal(v)}</span>
const pct = (v) => <span className="font-mono">{v == null ? '-' : `${v}%`}</span>
const phaseColor = (over) => (over <= 6 ? '#00E5FF' : over <= 15 ? '#FFB800' : '#FF2D78')

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#16161F] border border-[#2A2A3A] rounded-lg px-3 py-2 shadow-lg">
      <p className="text-[#8888A0] text-xs mb-1 font-mono">Over {label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color || '#E8E8ED' }}>
          {entry.name}: <span className="font-mono font-semibold">{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
        </p>
      ))}
    </div>
  )
}

function Section({ title, color = '#00E5FF', note, children }) {
  return (
    <section className="animate-in">
      <div className="flex items-baseline gap-3 mb-4">
        <div className="w-1 h-6 self-center rounded-full" style={{ background: color }} />
        <h2 className="text-xl font-heading font-bold text-text-primary">{title}</h2>
        {note && <span className="text-xs text-text-muted font-mono">{note}</span>}
      </div>
      {children}
    </section>
  )
}

function PhaseCard({ phase, row }) {
  if (!row) return null
  return (
    <div className="card animate-in" style={{ borderTop: `2px solid ${phase.color}` }}>
      <div className="flex items-baseline justify-between">
        <p className={`text-sm uppercase tracking-wider font-mono font-medium ${phase.text}`}>{phase.label}</p>
        <span className="text-[11px] text-text-muted font-mono">{phase.overs}</span>
      </div>
      <p className="text-4xl font-heading font-bold text-text-primary mt-2 leading-none">{formatDecimal(row.run_rate)}<span className="text-sm text-text-muted font-mono ml-2">runs per over</span></p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
        <div><dt className="text-[11px] text-text-muted font-mono uppercase">Runs per innings</dt><dd className="font-mono text-text-primary">{formatDecimal(row.avg_runs, 1)}</dd></div>
        <div><dt className="text-[11px] text-text-muted font-mono uppercase">Wickets per innings</dt><dd className="font-mono text-text-primary">{formatDecimal(row.avg_wickets)}</dd></div>
        <div><dt className="text-[11px] text-text-muted font-mono uppercase">Boundary balls</dt><dd className="font-mono text-text-primary">{row.boundary_pct}%</dd></div>
        <div><dt className="text-[11px] text-text-muted font-mono uppercase">Dot balls</dt><dd className="font-mono text-text-primary">{row.dot_pct}%</dd></div>
        <div><dt className="text-[11px] text-text-muted font-mono uppercase">Balls per wicket</dt><dd className="font-mono text-text-primary">{row.balls_per_wicket ?? '-'}</dd></div>
        <div><dt className="text-[11px] text-text-muted font-mono uppercase">Innings</dt><dd className="font-mono text-text-primary">{formatNumber(row.innings)}</dd></div>
      </dl>
    </div>
  )
}

function playerCol(bowler) {
  return { key: 'player', label: 'Player', render: (v) => (
    <Link to={`/${bowler ? 'bowling' : 'batting'}/${encodeURIComponent(v)}`} className="flex items-center gap-2 text-accent-cyan hover:underline font-medium whitespace-nowrap">
      <PlayerAvatar name={v} size={26} showBorder={false} />{v}
    </Link>
  ) }
}

export default function Phases() {
  const tournament = useTournament()
  const [season, setSeason] = useUrlState('season', '')
  const [team, setTeam] = useUrlState('team', '')
  const [venue, setVenue] = useUrlState('venue', '')
  const [innings, setInnings] = useUrlState('innings', '')
  const [phase, setPhase] = useUrlState('phase', 'death')
  const [minBalls, setMinBalls] = useUrlState('min_balls', 120)

  const { data: seasons } = useFetch(() => getSeasons(), [])
  const { data: teams } = useFetch(() => getTeams(), [])
  const { data: venues } = useFetch(() => getVenues(), [])
  const { data: summary, loading: summaryLoading, error } = useFetch(() => getPhaseSummary({ season, team, venue }), [season, team, venue])
  const { data: overs, loading: oversLoading } = useFetch(() => getOverProfile({ season, team, venue, innings: innings || undefined }), [season, team, venue, innings])
  const { data: leaders, loading: leadersLoading } = useFetch(() => getPhaseLeaders({ phase, season, team, venue, min_balls: minBalls || 120, limit: 15 }), [phase, season, team, venue, minBalls])

  const teamOptions = [{ value: '', label: 'All teams (batting)' }, ...(teams || []).map((t) => ({ value: t, label: t }))]
  const venueOptions = [{ value: '', label: 'All venues' }, ...(venues || []).map((v) => ({ value: v.venue, label: v.venue }))]
  const inningsOptions = [{ value: '', label: 'Both innings' }, { value: '1', label: 'Batting first' }, { value: '2', label: 'Chasing' }]
  const current = PHASES.find((p) => p.key === phase) || PHASES[2]
  const phaseRows = Object.fromEntries((summary?.phases || []).map((r) => [r.phase, r]))
  const byInnings = summary?.by_innings || []

  const batterCols = [
    playerCol(false),
    { key: 'innings', label: 'Inn', align: 'right', render: mono },
    { key: 'balls', label: 'Balls', align: 'right', render: mono },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono font-semibold text-accent-lime">{v}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: dec },
    { key: 'avg', label: 'Avg', align: 'right', render: dec },
    { key: 'boundary_pct', label: 'Boundary %', align: 'right', render: pct },
    { key: 'dot_pct', label: 'Dot %', align: 'right', render: pct },
    { key: 'sixes', label: '6s', align: 'right', render: mono },
  ]
  const bowlerCols = [
    playerCol(true),
    { key: 'innings', label: 'Inn', align: 'right', render: mono },
    { key: 'balls', label: 'Balls', align: 'right', render: mono },
    { key: 'wickets', label: 'Wkts', align: 'right', render: (v) => <span className="font-mono font-semibold text-accent-magenta">{v}</span> },
    { key: 'economy', label: 'Econ', align: 'right', render: dec },
    { key: 'avg', label: 'Avg', align: 'right', render: dec },
    { key: 'sr', label: 'SR', align: 'right', render: dec },
    { key: 'dot_pct', label: 'Dot %', align: 'right', render: pct },
  ]
  const venueCols = [
    { key: 'venue', label: 'Venue', render: (v) => <Link to={`/venues/${encodeURIComponent(v)}`} className="text-accent-cyan hover:underline">{v}</Link> },
    { key: 'matches', label: 'Mat', align: 'right', render: mono },
    { key: 'powerplay_rr', label: 'PP RR', align: 'right', render: (v) => <span className="font-mono text-accent-cyan">{formatDecimal(v)}</span> },
    { key: 'middle_rr', label: 'Middle RR', align: 'right', render: (v) => <span className="font-mono text-accent-amber">{formatDecimal(v)}</span> },
    { key: 'death_rr', label: 'Death RR', align: 'right', render: (v) => <span className="font-mono text-accent-magenta">{formatDecimal(v)}</span> },
    { key: 'powerplay_wkts', label: 'PP wkts', align: 'right', render: dec },
    { key: 'middle_wkts', label: 'Mid wkts', align: 'right', render: dec },
    { key: 'death_wkts', label: 'Death wkts', align: 'right', render: dec },
  ]

  const title = `${tournament.shortName} Phase Analytics: Powerplay, Middle and Death Overs`
  const description = `How ${tournament.shortName} innings are built: run rate, wickets, boundary and dot-ball rates for the powerplay, middle and death overs, over by over, with the best batters and bowlers in each phase.`

  return (
    <div className="space-y-8">
      <SEO title={title} description={description} url="/phases"
        schema={breadcrumbSchema([{ name: 'Dashboard', path: '/dashboard' }, { name: 'Phases', path: '/phases' }])} />

      <div>
        <h1 className="text-3xl font-heading font-bold text-text-primary">Phase Analytics</h1>
        <p className="text-text-secondary text-sm mt-1">How an innings is built, from the first over to the last. Filter by {tournament.competitionLabel.toLowerCase()}, batting team and venue.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <MultiSeasonSelect seasons={seasons || []} value={season} onChange={setSeason} />
        <Select options={teamOptions} value={team} onChange={setTeam} placeholder="" />
        <Select options={venueOptions} value={venue} onChange={setVenue} placeholder="" className="max-w-[260px]" />
        {(season || team || venue) && (
          <button type="button" onClick={() => { setSeason(''); setTeam(''); setVenue('') }} className="text-xs text-text-muted hover:text-text-primary underline">Clear filters</button>
        )}
      </div>

      {error ? (
        <div className="card text-center py-10">
          <p className="text-danger font-heading">Could not load phase analytics</p>
          <p className="text-text-secondary text-sm mt-1">{error}</p>
        </div>
      ) : summaryLoading && !summary ? (
        <Loading message="Reading every over..." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PHASES.map((p) => <PhaseCard key={p.key} phase={p} row={phaseRows[p.key]} />)}
          </div>

          <Section title="Over by Over" color="#B8FF00" note="average runs in each over, and how often it falls">
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <Select options={inningsOptions} value={innings} onChange={setInnings} placeholder="" />
                <span className="text-xs text-text-muted font-mono">{overs?.[0]?.innings ? `${formatNumber(overs[0].innings)} innings` : ''}</span>
              </div>
              {oversLoading && !overs ? <Loading message="Loading overs..." /> : (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={overs || []} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                    <XAxis dataKey="over" tick={AXIS} axisLine={LINE} tickLine={LINE} />
                    <YAxis yAxisId="runs" tick={AXIS} axisLine={LINE} tickLine={LINE} />
                    <YAxis yAxisId="wkts" orientation="right" tick={AXIS} axisLine={LINE} tickLine={LINE} domain={[0, 1]} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>} />
                    <Bar yAxisId="runs" dataKey="avg_runs" name="Runs per innings" radius={[3, 3, 0, 0]}>
                      {(overs || []).map((r) => <Cell key={r.over} fill={phaseColor(r.over)} fillOpacity={0.85} />)}
                    </Bar>
                    <Line yAxisId="wkts" type="monotone" dataKey="avg_wickets" name="Wickets per innings" stroke="#E8E8ED" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              <p className="text-[11px] text-text-muted font-mono mt-2">Bars: powerplay cyan, middle amber, death magenta. Later overs are averaged over the innings that reached them.</p>
            </div>
          </Section>

          {byInnings.length > 0 && (
            <Section title="Batting First versus Chasing" color="#FFB800">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PHASES.map((p) => {
                  const first = byInnings.find((r) => r.phase === p.key && r.innings_number === 1)
                  const second = byInnings.find((r) => r.phase === p.key && r.innings_number === 2)
                  return (
                    <div key={p.key} className="card">
                      <p className={`text-xs uppercase tracking-wider font-mono ${p.text}`}>{p.label}</p>
                      <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                        {[['Batting first', first], ['Chasing', second]].map(([label, row]) => (
                          <div key={label}>
                            <p className="text-[11px] text-text-muted font-mono uppercase">{label}</p>
                            <p className="font-heading font-bold text-2xl text-text-primary">{row ? formatDecimal(row.run_rate) : '-'}</p>
                            <p className="text-xs text-text-secondary font-mono">{row ? `${formatDecimal(row.avg_wickets)} wkts · ${row.dot_pct}% dots` : ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {(summary?.toss?.length > 0 || summary?.chase) && (
            <Section title="Toss and the Chase" color="#00E5FF">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {summary.chase && (
                  <>
                    <div className="card"><p className="text-[11px] uppercase tracking-wider text-text-muted font-mono">Chasing side wins</p><p className="text-3xl font-heading font-bold text-accent-lime mt-1">{summary.chase.chase_win_pct}%</p><p className="text-xs text-text-secondary font-mono">{formatNumber(summary.chase.chases_won)} of {formatNumber(summary.chase.matches)} results</p></div>
                    <div className="card"><p className="text-[11px] uppercase tracking-wider text-text-muted font-mono">Average first innings</p><p className="text-3xl font-heading font-bold text-accent-cyan mt-1">{summary.chase.avg_first_innings}</p><p className="text-xs text-text-secondary font-mono">defended totals average {summary.chase.avg_defended ?? '-'}</p></div>
                  </>
                )}
                {summary.toss.map((t) => (
                  <div key={t.decision} className="card">
                    <p className="text-[11px] uppercase tracking-wider text-text-muted font-mono">Won toss, chose to {t.decision}</p>
                    <p className="text-3xl font-heading font-bold text-accent-amber mt-1">{t.toss_win_pct}%</p>
                    <p className="text-xs text-text-secondary font-mono">won {formatNumber(t.toss_winner_wins)} of {formatNumber(t.matches)}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title={`${current.label} Leaders`} color={current.color} note={`at least ${minBalls || 120} balls in the phase`}>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {PHASES.map((p) => (
                <button key={p.key} type="button" onClick={() => setPhase(p.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-colors ${
                    p.key === current.key ? `${p.text} bg-bg-elevated` : 'border-border-subtle text-text-muted hover:text-text-primary'}`}
                  style={p.key === current.key ? { borderColor: p.color } : undefined}>
                  {p.label}
                </button>
              ))}
              <label className="flex items-center gap-2 text-xs text-text-secondary font-mono">
                Min balls
                <input type="number" min={6} max={2000} step={30} value={minBalls} onChange={(e) => setMinBalls(Number(e.target.value) || 120)}
                  className="w-20 bg-bg-card border border-border-subtle rounded-md px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-cyan" />
              </label>
            </div>
            {leadersLoading && !leaders ? <Loading message="Ranking players..." /> : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-heading font-semibold text-accent-lime mb-2">Batters</h3>
                  <DataTable columns={batterCols} data={(leaders?.batters || []).map((r) => ({ ...r, id: r.player }))} pageSize={15} />
                </div>
                <div>
                  <h3 className="text-sm font-heading font-semibold text-accent-magenta mb-2">Bowlers</h3>
                  <DataTable columns={bowlerCols} data={(leaders?.bowlers || []).map((r) => ({ ...r, id: r.player }))} pageSize={15} />
                </div>
              </div>
            )}
          </Section>

          {summary?.venues?.length > 0 && (
            <Section title="Venues by Phase" color="#8B5CF6" note="run rate and wickets per innings in each phase">
              <DataTable columns={venueCols} data={summary.venues.map((r) => ({ ...r, id: r.venue }))} pageSize={15} />
            </Section>
          )}
        </>
      )}
    </div>
  )
}
