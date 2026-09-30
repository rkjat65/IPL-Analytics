import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import useUrlState from '../hooks/useUrlState'
import { useFetch } from '../hooks/useFetch'
import { getPlayerIndex, getTeams } from '../lib/api'
import SEO from '../components/SEO'
import { breadcrumbSchema } from '../lib/breadcrumbs'
import DataTable from '../components/ui/DataTable'
import Select from '../components/ui/Select'
import Loading from '../components/ui/Loading'
import PlayerAvatar from '../components/ui/PlayerAvatar'
import TeamLogo from '../components/ui/TeamLogo'
import { useTournament } from '../contexts/TournamentContext'
import { formatNumber, formatDecimal } from '../utils/format'

const ROLES = ['Batter', 'All-rounder', 'Bowler']
const ROLE_STYLE = {
  Batter: 'text-accent-lime border-accent-lime/40 bg-accent-lime/10',
  Bowler: 'text-accent-magenta border-accent-magenta/40 bg-accent-magenta/10',
  'All-rounder': 'text-accent-amber border-accent-amber/40 bg-accent-amber/10',
}
const SORTS = [
  { value: 'matches', label: 'Most matches' },
  { value: 'runs', label: 'Most runs' },
  { value: 'wickets', label: 'Most wickets' },
  { value: 'name', label: 'Name A to Z' },
  { value: 'recent', label: 'Most recent' },
]

const mono = (val) => <span className="font-mono">{val ?? '-'}</span>

export default function Players() {
  const tournament = useTournament()
  const [q, setQ] = useUrlState('q', '')
  const [team, setTeam] = useUrlState('team', '')
  const [role, setRole] = useUrlState('role', '')
  const [sort, setSort] = useUrlState('sort', 'matches')
  const [letter, setLetter] = useUrlState('letter', '')

  const { data: players, loading, error } = useFetch(() => getPlayerIndex(), [])
  const { data: teams } = useFetch(() => getTeams(), [])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = (players || []).filter((p) =>
      (!needle || p.player.toLowerCase().includes(needle)) &&
      (!team || p.teams.includes(team)) &&
      (!role || p.role === role) &&
      (!letter || p.player.split(' ').slice(-1)[0].toUpperCase().startsWith(letter))
    )
    const by = {
      matches: (a, b) => b.matches - a.matches,
      runs: (a, b) => b.runs - a.runs,
      wickets: (a, b) => b.wickets - a.wickets,
      name: (a, b) => a.player.localeCompare(b.player),
      recent: (a, b) => b.last_season.localeCompare(a.last_season) || b.matches - a.matches,
    }
    list = list.slice().sort(by[sort] || by.matches)
    return list.map((p, i) => ({ ...p, rank: i + 1, id: p.player }))
  }, [players, q, team, role, sort, letter])

  const columns = [
    { key: 'player', label: 'Player', render: (val) => (
      <Link to={`/players/${encodeURIComponent(val)}`} className="flex items-center gap-2 text-accent-cyan hover:underline font-medium whitespace-nowrap">
        <PlayerAvatar name={val} size={30} showBorder={false} />
        {val}
      </Link>
    ) },
    { key: 'role', label: 'Role', render: (val) => <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${ROLE_STYLE[val] || ''}`}>{val}</span> },
    { key: 'teams', label: 'Teams', render: (val) => (
      <span className="flex items-center gap-1.5">
        {val.slice(0, 4).map((t) => <Link key={t} to={`/teams/${encodeURIComponent(t)}`} title={t}><TeamLogo team={t} size={20} /></Link>)}
        {val.length > 4 && <span className="text-xs text-text-muted font-mono">+{val.length - 4}</span>}
      </span>
    ) },
    { key: 'first_season', label: 'Span', render: (val, r) => mono(val === r.last_season ? val : `${val} to ${r.last_season}`) },
    { key: 'matches', label: 'Mat', align: 'right', render: (v) => <span className="font-mono font-semibold text-text-primary">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono text-accent-lime">{formatNumber(v)}</span> },
    { key: 'avg', label: 'Avg', align: 'right', render: (v) => mono(v == null ? '-' : formatDecimal(v)) },
    { key: 'sr', label: 'SR', align: 'right', render: (v) => mono(v == null ? '-' : formatDecimal(v)) },
    { key: 'highest', label: 'HS', align: 'right', render: mono },
    { key: 'hundreds', label: '100s/50s', align: 'right', render: (v, r) => mono(`${v}/${r.fifties}`) },
    { key: 'wickets', label: 'Wkts', align: 'right', render: (v) => <span className="font-mono text-accent-magenta">{v}</span> },
    { key: 'economy', label: 'Econ', align: 'right', render: (v) => mono(v == null ? '-' : formatDecimal(v)) },
  ]

  const teamOptions = [{ value: '', label: 'All teams' }, ...(teams || []).map((t) => ({ value: t, label: t }))]
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const total = players?.length || 0

  return (
    <div className="space-y-6">
      <SEO
        title={`${tournament.shortName} Players: Every Cricketer in the Archive`}
        description={`Browse every ${tournament.name} player: role, teams, ${tournament.competitionLabelPlural.toLowerCase()} played, runs, average, strike rate, wickets and economy, all from ball-by-ball data.`}
        url="/players"
        schema={breadcrumbSchema([{ name: 'Dashboard', path: '/dashboard' }, { name: 'Players', path: '/players' }])}
      />
      <div>
        <h1 className="text-3xl font-heading font-bold text-text-primary">{tournament.shortName} Players</h1>
        <p className="text-text-secondary text-sm mt-1">
          {loading ? 'Loading...' : `${formatNumber(total)} players across every ${tournament.shortName} ${tournament.competitionLabel.toLowerCase()}. Search by name, or narrow by team and role.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players"
          aria-label="Search players"
          className="bg-bg-card border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary font-body focus:outline-none focus:border-accent-cyan w-56"
        />
        <Select options={teamOptions} value={team} onChange={setTeam} placeholder="" />
        <Select options={SORTS} value={sort} onChange={setSort} placeholder="" />
        <div className="flex gap-1.5">
          {['', ...ROLES].map((r) => (
            <button key={r || 'all'} type="button" onClick={() => setRole(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-colors ${
                role === r ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/10' : 'border-border-subtle text-text-muted hover:text-text-primary'}`}>
              {r || 'All roles'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1" aria-label="Surname initial">
        <button type="button" onClick={() => setLetter('')} className={`w-7 h-7 rounded text-xs font-mono ${!letter ? 'bg-bg-elevated text-accent-cyan' : 'text-text-muted hover:text-text-primary'}`}>All</button>
        {letters.map((l) => (
          <button key={l} type="button" onClick={() => setLetter(l === letter ? '' : l)}
            className={`w-7 h-7 rounded text-xs font-mono ${letter === l ? 'bg-bg-elevated text-accent-cyan' : 'text-text-muted hover:text-text-primary'}`}>
            {l}
          </button>
        ))}
      </div>

      {error ? (
        <div className="card text-center py-10">
          <p className="text-danger font-heading">Could not load players</p>
          <p className="text-text-secondary text-sm mt-1">{error}</p>
        </div>
      ) : loading ? (
        <Loading message="Loading players..." />
      ) : (
        <div>
          <p className="text-xs text-text-muted font-mono mb-2">{formatNumber(rows.length)} of {formatNumber(total)} players</p>
          <DataTable columns={columns} data={rows} pageSize={50} />
        </div>
      )}
    </div>
  )
}
