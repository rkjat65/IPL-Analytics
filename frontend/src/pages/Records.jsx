import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import useUrlState from '../hooks/useUrlState'
import { useFetch } from '../hooks/useFetch'
import {
  getInningsRecords, getTeamRecords, getPartnershipRecords, getSpecialRecords, getDuelRecords,
  getRecordsSummary, getSeasons, getTeams, getVenues,
} from '../lib/api'
import SEO from '../components/SEO'
import { breadcrumbSchema } from '../lib/breadcrumbs'
import DataTable from '../components/ui/DataTable'
import Select from '../components/ui/Select'
import Loading from '../components/ui/Loading'
import MultiSeasonSelect from '../components/ui/MultiSeasonSelect'
import PlayerAvatar from '../components/ui/PlayerAvatar'
import TeamLogo from '../components/ui/TeamLogo'
import { useTournament } from '../contexts/TournamentContext'
import { formatNumber, formatDecimal, formatDate } from '../utils/format'

// Every record list the hub can show, grouped the way fans look for them.
const GROUPS = [
  { key: 'batting', label: 'Batting', color: 'lime', kinds: [
    { key: 'highest_scores', label: 'Highest scores' },
    { key: 'fastest_fifties', label: 'Fastest fifties' },
    { key: 'fastest_hundreds', label: 'Fastest hundreds' },
    { key: 'most_sixes', label: 'Most sixes in an innings' },
  ] },
  { key: 'bowling', label: 'Bowling', color: 'magenta', kinds: [
    { key: 'best_bowling', label: 'Best figures' },
    { key: 'best_economy', label: 'Best economy (4 overs)' },
    { key: 'most_expensive', label: 'Most expensive over' },
    { key: 'most_conceded', label: 'Most runs conceded' },
  ] },
  { key: 'team', label: 'Team', color: 'cyan', kinds: [
    { key: 'highest_totals', label: 'Highest totals' },
    { key: 'lowest_totals', label: 'Lowest totals' },
    { key: 'highest_chases', label: 'Highest successful chases' },
    { key: 'biggest_wins_runs', label: 'Biggest wins by runs' },
    { key: 'biggest_wins_wickets', label: 'Biggest wins by wickets' },
    { key: 'narrowest_wins', label: 'Narrowest wins by runs' },
  ] },
  { key: 'partnerships', label: 'Partnerships', color: 'amber', kinds: [
    { key: 'any', label: 'Any wicket' },
    ...Array.from({ length: 10 }, (_, i) => ({ key: String(i + 1), label: `${i + 1}${['st', 'nd', 'rd'][i] || 'th'} wicket` })),
  ] },
  { key: 'special', label: 'Special', color: 'cyan', kinds: [
    { key: 'hat_tricks', label: 'Hat-tricks' },
    { key: 'most_awards', label: 'Player of the match awards' },
    { key: 'most_ducks', label: 'Most ducks' },
    { key: 'super_overs', label: 'Super overs' },
    { key: 'ties', label: 'Tied matches' },
  ] },
  { key: 'duels', label: 'Duels', color: 'magenta', kinds: [
    { key: 'balls', label: 'Most balls faced' },
    { key: 'outs', label: 'Most dismissals' },
    { key: 'sr', label: 'Batter on top (strike rate)' },
    { key: 'dominance', label: 'Batter dominance' },
  ] },
]

const mono = (val) => <span className="font-mono">{val ?? '-'}</span>
const strong = (val, cls = 'text-accent-teal') => <span className={`font-mono font-semibold ${cls}`}>{val ?? '-'}</span>

function PlayerLink({ name, bowler = false }) {
  if (!name) return '-'
  return (
    <Link to={`/${bowler ? 'bowling' : 'batting'}/${encodeURIComponent(name)}`} className="flex items-center gap-2 text-accent-brand hover:underline font-medium whitespace-nowrap">
      <PlayerAvatar name={name} size={26} showBorder={false} />
      {name}
    </Link>
  )
}

function Team({ name }) {
  if (!name) return '-'
  return (
    <Link to={`/teams/${encodeURIComponent(name)}`} className="flex items-center gap-2 text-text-primary hover:text-accent-brand whitespace-nowrap">
      <TeamLogo team={name} size={20} />
      <span className="text-sm">{name}</span>
    </Link>
  )
}

function MatchLink({ row, label }) {
  return (
    <Link to={`/matches/${row.match_id}`} className="text-text-secondary hover:text-accent-brand text-xs whitespace-nowrap">
      {label || `${row.season} · ${formatDate(row.date)}`}
    </Link>
  )
}

const RANK = { key: 'rank', label: '#', align: 'center', render: (val) => <span className={`font-mono font-bold ${{ 1: 'text-amber-400', 2: 'text-gray-400', 3: 'text-amber-700' }[val] || 'text-text-muted'}`}>{val}</span> }
const CONTEXT = [
  { key: 'opponent', label: 'Opponent', render: (val) => <Team name={val} /> },
  { key: 'venue', label: 'Venue', render: (val) => <Link to={`/venues/${encodeURIComponent(val)}`} className="text-text-secondary hover:text-accent-brand text-xs">{val}</Link> },
  { key: 'match_id', label: 'Match', render: (_, row) => <MatchLink row={row} /> },
]

function columnsFor(group, kind) {
  const player = { key: 'player', label: 'Player', render: (val) => <PlayerLink name={val} bowler={group === 'bowling'} /> }
  const team = { key: 'team', label: 'Team', render: (val) => <Team name={val} /> }
  if (group === 'batting') {
    if (kind.startsWith('fastest')) {
      return [RANK, player, { key: 'balls', label: 'Balls', align: 'right', render: (v) => strong(v) },
        { key: 'runs', label: 'Final', align: 'right', render: (v, r) => mono(`${v}${r.balls_faced ? ` (${r.balls_faced})` : ''}`) },
        { key: 'fours', label: '4s', align: 'right', render: mono }, { key: 'sixes', label: '6s', align: 'right', render: mono }, team, ...CONTEXT]
    }
    return [RANK, player,
      { key: 'runs', label: 'Runs', align: 'right', render: (v, r) => strong(`${v}${r.not_out ? '*' : ''}`) },
      { key: 'balls', label: 'Balls', align: 'right', render: mono }, { key: 'sr', label: 'SR', align: 'right', render: (v) => mono(formatDecimal(v)) },
      { key: 'fours', label: '4s', align: 'right', render: mono }, { key: 'sixes', label: '6s', align: 'right', render: (v) => kind === 'most_sixes' ? strong(v) : mono(v) },
      team, ...CONTEXT]
  }
  if (group === 'bowling') {
    if (kind === 'most_expensive') {
      return [RANK, player, { key: 'conceded', label: 'Runs', align: 'right', render: (v) => strong(v, 'text-accent-magenta') },
        { key: 'over', label: 'Over', align: 'right', render: mono }, { key: 'fours', label: '4s', align: 'right', render: mono },
        { key: 'sixes', label: '6s', align: 'right', render: mono }, { key: 'balls', label: 'Balls', align: 'right', render: mono }, team, ...CONTEXT]
    }
    return [RANK, player,
      { key: 'wickets', label: 'Figures', align: 'right', render: (v, r) => strong(`${v}/${r.conceded}`, 'text-accent-magenta') },
      { key: 'overs', label: 'Overs', align: 'right', render: mono }, { key: 'economy', label: 'Econ', align: 'right', render: (v) => mono(formatDecimal(v)) },
      { key: 'dots', label: 'Dots', align: 'right', render: mono }, { key: 'sixes', label: '6s', align: 'right', render: mono }, team, ...CONTEXT]
  }
  if (group === 'team') {
    if (kind.startsWith('biggest') || kind === 'narrowest_wins') {
      const byWickets = kind === 'biggest_wins_wickets'
      return [RANK, { key: 'team', label: 'Winner', render: (val) => <Team name={val} /> },
        { key: byWickets ? 'win_by_wickets' : 'win_by_runs', label: 'Margin', align: 'right', render: (v, r) => strong(byWickets ? `${v} wkts${r.balls_left > 0 ? ` (${r.balls_left} balls left)` : ''}` : `${v} runs`) },
        { key: 'first_total', label: 'Scores', align: 'right', render: (v, r) => mono(`${v ?? '-'} v ${r.second_total ?? '-'}`) },
        { key: 'stage', label: 'Stage', render: (v) => <span className="text-text-secondary text-xs">{v || '-'}</span> }, ...CONTEXT]
    }
    return [RANK, team,
      { key: 'runs', label: 'Total', align: 'right', render: (v, r) => strong(`${v}/${r.wickets}`) },
      { key: 'overs', label: 'Overs', align: 'right', render: mono }, { key: 'run_rate', label: 'RR', align: 'right', render: (v) => mono(formatDecimal(v)) },
      { key: 'won', label: 'Result', render: (v) => <span className={`text-xs font-mono ${v ? 'text-success' : 'text-text-muted'}`}>{v ? 'won' : 'lost'}</span> }, ...CONTEXT]
  }
  if (group === 'partnerships') {
    return [RANK,
      { key: 'batter1', label: 'Partnership', render: (v, r) => (
        <span className="flex flex-col gap-0.5">
          <PlayerLink name={v} />
          <PlayerLink name={r.batter2} />
        </span>
      ) },
      { key: 'runs', label: 'Runs', align: 'right', render: (v, r) => strong(`${v}${r.unbroken ? '*' : ''}`) },
      { key: 'balls', label: 'Balls', align: 'right', render: mono }, { key: 'wicket', label: 'Wkt', align: 'right', render: mono },
      team, ...CONTEXT]
  }
  if (group === 'special') {
    if (kind === 'hat_tricks') return [RANK, { ...player, render: (val) => <PlayerLink name={val} bowler /> }, { key: 'victims', label: 'Victims', render: (v) => <span className="text-sm text-text-secondary">{v}</span> }, { key: 'over', label: 'Over', align: 'right', render: mono }, team, ...CONTEXT]
    if (kind === 'most_awards') return [RANK, player, { key: 'awards', label: 'Awards', align: 'right', render: (v) => strong(v) }, { key: 'first_season', label: 'Span', render: (v, r) => mono(v === r.last_season ? v : `${v} to ${r.last_season}`) }]
    if (kind === 'most_ducks') return [RANK, player, { key: 'ducks', label: 'Ducks', align: 'right', render: (v) => strong(v, 'text-accent-magenta') }, { key: 'golden_ducks', label: 'Golden', align: 'right', render: mono }, { key: 'innings', label: 'Innings', align: 'right', render: mono }]
    return [RANK, { key: 'team1', label: 'Match', render: (v, r) => <span className="flex items-center gap-2 whitespace-nowrap"><Team name={v} /><span className="text-text-muted text-xs">v</span><Team name={r.team2} /></span> },
      { key: 'first_total', label: 'Scores', align: 'right', render: (v, r) => mono(`${v ?? '-'} v ${r.second_total ?? '-'}`) },
      { key: 'team', label: kind === 'ties' ? 'Result' : 'Winner', render: (v, r) => v ? <Team name={v} /> : <span className="text-text-muted text-xs">{r.result || 'tie'}</span> },
      { key: 'venue', label: 'Venue', render: (val) => <Link to={`/venues/${encodeURIComponent(val)}`} className="text-text-secondary hover:text-accent-brand text-xs">{val}</Link> },
      { key: 'match_id', label: 'Match', render: (_, row) => <MatchLink row={row} /> }]
  }
  return [RANK,
    { key: 'batter', label: 'Batter', render: (val) => <PlayerLink name={val} /> },
    { key: 'bowler', label: 'Bowler', render: (val) => <PlayerLink name={val} bowler /> },
    { key: 'balls', label: 'Balls', align: 'right', render: (v) => kind === 'balls' ? strong(v) : mono(v) },
    { key: 'runs', label: 'Runs', align: 'right', render: mono },
    { key: 'outs', label: 'Outs', align: 'right', render: (v) => kind === 'outs' ? strong(v, 'text-accent-magenta') : mono(v) },
    { key: 'sr', label: 'SR', align: 'right', render: (v) => kind === 'sr' ? strong(formatDecimal(v)) : mono(formatDecimal(v)) },
    { key: 'avg', label: 'Avg', align: 'right', render: (v) => mono(v == null ? '-' : formatDecimal(v)) },
    { key: 'dot_pct', label: 'Dot %', align: 'right', render: (v) => mono(v == null ? '-' : `${v}%`) },
    { key: 'sixes', label: '6s', align: 'right', render: mono },
    { key: 'matches', label: 'Mat', align: 'right', render: mono }]
}

function Headline({ label, value, who, context, color = 'cyan' }) {
  const colors = { cyan: 'text-accent-brand', lime: 'text-accent-teal', magenta: 'text-accent-magenta', amber: 'text-accent-amber' }
  return (
    <div className="card animate-in">
      <p className="text-[11px] uppercase tracking-wider text-text-muted font-mono mb-1">{label}</p>
      <p className={`text-2xl font-heading font-bold ${colors[color]} leading-tight`}>{value ?? '-'}</p>
      <p className="text-sm text-text-primary mt-1 truncate">{who || '-'}</p>
      {context && <p className="text-xs text-text-muted truncate">{context}</p>}
    </div>
  )
}

export default function Records() {
  const tournament = useTournament()
  const [group, setGroup] = useUrlState('tab', 'batting')
  const [kind, setKind] = useUrlState('kind', '')
  const [season, setSeason] = useUrlState('season', '')
  const [team, setTeam] = useUrlState('team', '')
  const [venue, setVenue] = useUrlState('venue', '')
  const [minBalls, setMinBalls] = useUrlState('min_balls', 30)

  const current = GROUPS.find((g) => g.key === group) || GROUPS[0]
  const activeKind = current.kinds.some((k) => k.key === kind) ? kind : current.kinds[0].key

  const { data: seasons } = useFetch(() => getSeasons(), [])
  const { data: teams } = useFetch(() => getTeams(), [])
  const { data: venues } = useFetch(() => getVenues(), [])
  const { data: summary } = useFetch(() => getRecordsSummary({ season, team, venue }).catch(() => null), [season, team, venue])

  const { data: rows, loading, error } = useFetch(() => {
    const base = { season, team, venue, limit: 100 }
    if (current.key === 'batting' || current.key === 'bowling') return getInningsRecords({ ...base, kind: activeKind })
    if (current.key === 'team') return getTeamRecords({ ...base, kind: activeKind })
    if (current.key === 'partnerships') return getPartnershipRecords({ ...base, wicket: activeKind === 'any' ? undefined : activeKind })
    if (current.key === 'special') return getSpecialRecords({ ...base, kind: activeKind })
    return getDuelRecords({ season, sort_by: activeKind, min_balls: minBalls || 30, limit: 100 })
  }, [current.key, activeKind, season, team, venue, minBalls])

  const columns = useMemo(() => columnsFor(current.key, activeKind), [current.key, activeKind])
  const data = (Array.isArray(rows) ? rows : []).map((r, i) => ({ ...r, rank: i + 1, id: `${r.match_id || r.player || r.batter}-${i}` }))

  const teamOptions = [{ value: '', label: 'All teams' }, ...(teams || []).map((t) => ({ value: t, label: t }))]
  const venueOptions = [{ value: '', label: 'All venues' }, ...(venues || []).map((v) => ({ value: v.venue, label: v.venue }))]
  const filtersOff = current.key === 'duels'

  const label = current.kinds.find((k) => k.key === activeKind)?.label || ''
  const title = `${tournament.shortName} Records: ${current.label}, ${label}`
  const description = `${tournament.name} ${current.label.toLowerCase()} records from ball-by-ball data: ${current.kinds.map((k) => k.label.toLowerCase()).join(', ')}. Filter by ${tournament.competitionLabel.toLowerCase()}, team and venue.`

  const s = summary || {}
  const headlines = [
    s.highest_scores && { label: 'Highest score', value: `${s.highest_scores.runs}${s.highest_scores.not_out ? '*' : ''}`, who: s.highest_scores.player, context: `v ${s.highest_scores.opponent}, ${s.highest_scores.season}`, color: 'lime' },
    s.best_bowling && { label: 'Best bowling', value: `${s.best_bowling.wickets}/${s.best_bowling.conceded}`, who: s.best_bowling.player, context: `v ${s.best_bowling.opponent}, ${s.best_bowling.season}`, color: 'magenta' },
    s.fastest_fifties && { label: 'Fastest fifty', value: `${s.fastest_fifties.balls} balls`, who: s.fastest_fifties.player, context: `${s.fastest_fifties.runs} v ${s.fastest_fifties.opponent}, ${s.fastest_fifties.season}`, color: 'amber' },
    s.highest_totals && { label: 'Highest total', value: `${s.highest_totals.runs}/${s.highest_totals.wickets}`, who: s.highest_totals.team, context: `v ${s.highest_totals.opponent}, ${s.highest_totals.season}` },
    s.highest_chases && { label: 'Highest chase', value: `${s.highest_chases.runs}/${s.highest_chases.wickets}`, who: s.highest_chases.team, context: `v ${s.highest_chases.opponent}, ${s.highest_chases.season}`, color: 'lime' },
    s.partnership && { label: 'Highest stand', value: `${s.partnership.runs}${s.partnership.unbroken ? '*' : ''}`, who: `${s.partnership.batter1} & ${s.partnership.batter2}`, context: `${s.partnership.wicket}${['st', 'nd', 'rd'][s.partnership.wicket - 1] || 'th'} wicket, ${s.partnership.season}`, color: 'amber' },
    s.most_awards && { label: 'Most awards', value: s.most_awards.awards, who: s.most_awards.player, context: 'player of the match', color: 'magenta' },
    s.hat_tricks && { label: 'Hat-tricks', value: s.hat_tricks.count, who: s.hat_tricks.latest?.player, context: s.hat_tricks.latest ? `latest, ${s.hat_tricks.latest.season}` : '' },
  ].filter(Boolean)

  return (
    <div className="space-y-8">
      <SEO title={title} description={description} url="/records"
        schema={breadcrumbSchema([{ name: 'Dashboard', path: '/dashboard' }, { name: 'Records', path: '/records' }])} />

      <div>
        <h1 className="text-3xl font-heading font-bold text-text-primary">{tournament.shortName} Records</h1>
        <p className="text-text-secondary text-sm mt-1">
          Every record below is computed from ball-by-ball data, so it can be read for one {tournament.competitionLabel.toLowerCase()}, one team or one ground.
        </p>
      </div>

      {headlines.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {headlines.map((h) => <Headline key={h.label} {...h} />)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <MultiSeasonSelect seasons={seasons || []} value={season} onChange={setSeason} />
        <Select options={teamOptions} value={team} onChange={setTeam} placeholder="" className={filtersOff ? 'opacity-40' : ''} />
        <Select options={venueOptions} value={venue} onChange={setVenue} placeholder="" className={`max-w-[260px] ${filtersOff ? 'opacity-40' : ''}`} />
        {current.key === 'duels' && (
          <label className="flex items-center gap-2 text-xs text-text-secondary font-mono">
            Min balls
            <input type="number" min={6} max={500} value={minBalls} onChange={(e) => setMinBalls(Number(e.target.value) || 30)}
              className="w-20 bg-bg-card border border-border-subtle rounded-md px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-brand" />
          </label>
        )}
        {(season || team || venue) && (
          <button type="button" onClick={() => { setSeason(''); setTeam(''); setVenue('') }} className="text-xs text-text-muted hover:text-text-primary underline">Clear filters</button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {GROUPS.map((g) => (
          <button key={g.key} type="button" onClick={() => { setGroup(g.key); setKind('') }}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${
              g.key === current.key ? 'bg-bg-elevated border-accent-brand text-accent-brand' : 'bg-bg-card border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-active'}`}>
            {g.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {current.kinds.map((k) => (
          <button key={k.key} type="button" onClick={() => setKind(k.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-colors ${
              k.key === activeKind ? 'border-accent-teal text-accent-teal bg-accent-teal/10' : 'border-border-subtle text-text-muted hover:text-text-primary'}`}>
            {k.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="card text-center py-10">
          <p className="text-danger font-heading">Could not load these records</p>
          <p className="text-text-secondary text-sm mt-1">{error}</p>
        </div>
      ) : loading && !rows ? (
        <Loading message="Computing records..." />
      ) : (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-heading font-semibold text-text-primary">{label}</h2>
            <span className="text-xs text-text-muted font-mono">{formatNumber(data.length)} entries{team ? ` · ${team}` : ''}{venue ? ` · ${venue}` : ''}</span>
          </div>
          <DataTable columns={columns} data={data} loading={loading} pageSize={50} />
          <p className="text-xs text-text-muted mt-3">
            Balls faced exclude wides and no-balls. Bowlers are charged for wides and no-balls but not byes or leg byes. Partnership runs include extras. Super overs are excluded from batting, bowling and team lists.
          </p>
        </div>
      )}
    </div>
  )
}
