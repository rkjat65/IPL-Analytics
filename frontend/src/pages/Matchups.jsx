import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useUrlState from '../hooks/useUrlState'
import { useFetch } from '../hooks/useFetch'
import { getPlayerMatchup, getDuelRecords, searchPlayers, getSeasons } from '../lib/api'
import SEO from '../components/SEO'
import { breadcrumbSchema } from '../lib/breadcrumbs'
import DataTable from '../components/ui/DataTable'
import Loading from '../components/ui/Loading'
import MultiSeasonSelect from '../components/ui/MultiSeasonSelect'
import PlayerAvatar from '../components/ui/PlayerAvatar'
import TeamLogo from '../components/ui/TeamLogo'
import { useTournament } from '../contexts/TournamentContext'
import { formatDecimal, formatDate, formatNumber } from '../utils/format'

const SORTS = [
  { key: 'balls', label: 'Most balls' },
  { key: 'outs', label: 'Most dismissals' },
  { key: 'sr', label: 'Batter on top' },
  { key: 'dominance', label: 'Dominance' },
]
const PHASE_LABEL = { powerplay: 'Powerplay (1-6)', middle: 'Middle (7-15)', death: 'Death (16-20)' }
const mono = (val) => <span className="font-mono">{val ?? '-'}</span>

function PlayerPicker({ label, value, onChange, accent }) {
  const [text, setText] = useState(value || '')
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => { setText(value || '') }, [value])

  useEffect(() => {
    const q = text.trim()
    if (q.length < 2 || q === value) { setOptions([]); return }
    let alive = true
    const timer = setTimeout(() => {
      searchPlayers(q).then((rows) => {
        if (!alive) return
        setOptions((rows || []).slice(0, 8).map((r) => (typeof r === 'string' ? r : r.name)))
      }).catch(() => alive && setOptions([]))
    }, 180)
    return () => { alive = false; clearTimeout(timer) }
  }, [text, value])

  return (
    <div className="relative flex-1 min-w-[220px]">
      <label className="block text-[11px] uppercase tracking-wider text-text-muted font-mono mb-1">{label}</label>
      <div className="flex items-center gap-2">
        {value && <PlayerAvatar name={value} size={36} showBorder={false} />}
        <input
          type="search"
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={`Type a ${label.toLowerCase()} name`}
          aria-label={label}
          className={`w-full bg-bg-card border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary font-body focus:outline-none focus:border-${accent}`}
        />
      </div>
      {open && options.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-bg-elevated border border-border-active rounded-md shadow-lg overflow-hidden">
          {options.map((name) => (
            <li key={name}>
              <button type="button" onMouseDown={() => { onChange(name); setText(name); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-card-hover">
                <PlayerAvatar name={name} size={24} showBorder={false} />
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'text-accent-brand' }) {
  return (
    <div className="card">
      <p className="text-[11px] uppercase tracking-wider text-text-muted font-mono mb-1">{label}</p>
      <p className={`text-2xl font-heading font-bold ${color}`}>{value ?? '-'}</p>
    </div>
  )
}

export default function Matchups() {
  const tournament = useTournament()
  const [batter, setBatter] = useUrlState('batter', '')
  const [bowler, setBowler] = useUrlState('bowler', '')
  const [sort, setSort] = useUrlState('sort', 'balls')
  const [season, setSeason] = useUrlState('season', '')
  const [minBalls, setMinBalls] = useUrlState('min_balls', 30)

  const ready = Boolean(batter && bowler)
  const { data: duel, loading: duelLoading, error: duelError } = useFetch(
    () => (ready ? getPlayerMatchup(batter, bowler) : Promise.resolve(null)),
    [batter, bowler, ready]
  )
  const { data: seasons } = useFetch(() => getSeasons(), [])
  const { data: duels, loading: duelsLoading } = useFetch(
    () => getDuelRecords({ sort_by: sort, min_balls: minBalls || 30, season, limit: 100 }),
    [sort, minBalls, season]
  )

  const s = duel?.summary
  const hasBalls = s && s.balls > 0

  const phaseColumns = [
    { key: 'phase', label: 'Phase', render: (v) => <span className="text-text-primary">{PHASE_LABEL[v] || v}</span> },
    { key: 'balls', label: 'Balls', align: 'right', render: mono },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono text-accent-teal">{v}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (v) => mono(formatDecimal(v)) },
    { key: 'dismissals', label: 'Outs', align: 'right', render: (v) => <span className="font-mono text-accent-magenta">{v}</span> },
    { key: 'dot_pct', label: 'Dot %', align: 'right', render: (v) => mono(`${v}%`) },
    { key: 'boundary_pct', label: 'Boundary %', align: 'right', render: (v) => mono(`${v}%`) },
  ]
  const seasonColumns = [
    { key: 'season', label: tournament.competitionLabel, render: (v) => <Link to={`/seasons/${encodeURIComponent(v)}`} className="text-accent-brand hover:underline">{v}</Link> },
    { key: 'balls', label: 'Balls', align: 'right', render: mono },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono text-accent-teal">{v}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (v) => mono(v == null ? '-' : formatDecimal(v)) },
    { key: 'dismissals', label: 'Outs', align: 'right', render: (v) => <span className="font-mono text-accent-magenta">{v}</span> },
  ]
  const historyColumns = [
    { key: 'date', label: 'Match', render: (v, r) => (
      <Link to={`/matches/${r.match_id}`} className="flex items-center gap-2 text-text-primary hover:text-accent-brand whitespace-nowrap">
        <TeamLogo team={r.team1} size={18} /><span className="text-xs text-text-muted">v</span><TeamLogo team={r.team2} size={18} />
        <span className="text-xs text-text-secondary">{r.season} · {formatDate(v)}</span>
      </Link>
    ) },
    { key: 'venue', label: 'Venue', render: (v) => <span className="text-xs text-text-secondary">{v}</span> },
    { key: 'balls', label: 'Balls', align: 'right', render: mono },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono text-accent-teal">{v}</span> },
    { key: 'fours', label: '4s', align: 'right', render: mono },
    { key: 'sixes', label: '6s', align: 'right', render: mono },
    { key: 'dismissals', label: 'Out', align: 'right', render: (v) => <span className={`font-mono ${v ? 'text-accent-magenta' : 'text-text-muted'}`}>{v ? 'yes' : 'no'}</span> },
  ]
  const duelColumns = [
    { key: 'rank', label: '#', align: 'center', render: (v) => <span className="font-mono text-text-muted">{v}</span> },
    { key: 'batter', label: 'Batter', render: (v) => <span className="flex items-center gap-2 text-accent-brand whitespace-nowrap"><PlayerAvatar name={v} size={24} showBorder={false} />{v}</span> },
    { key: 'bowler', label: 'Bowler', render: (v) => <span className="flex items-center gap-2 text-accent-brand whitespace-nowrap"><PlayerAvatar name={v} size={24} showBorder={false} />{v}</span> },
    { key: 'balls', label: 'Balls', align: 'right', render: (v) => <span className={`font-mono ${sort === 'balls' ? 'font-semibold text-accent-teal' : ''}`}>{v}</span> },
    { key: 'runs', label: 'Runs', align: 'right', render: mono },
    { key: 'outs', label: 'Outs', align: 'right', render: (v) => <span className={`font-mono ${sort === 'outs' ? 'font-semibold text-accent-magenta' : ''}`}>{v}</span> },
    { key: 'sr', label: 'SR', align: 'right', render: (v) => <span className={`font-mono ${sort === 'sr' ? 'font-semibold text-accent-teal' : ''}`}>{formatDecimal(v)}</span> },
    { key: 'dot_pct', label: 'Dot %', align: 'right', render: (v) => mono(v == null ? '-' : `${v}%`) },
    { key: 'sixes', label: '6s', align: 'right', render: mono },
    { key: 'matches', label: 'Mat', align: 'right', render: mono },
  ]
  const duelRows = (Array.isArray(duels) ? duels : []).map((d, i) => ({ ...d, rank: i + 1, id: `${d.batter}|${d.bowler}` }))

  const title = ready ? `${batter} vs ${bowler}: ${tournament.shortName} matchup` : `${tournament.shortName} Batter vs Bowler Matchups`
  const description = ready && hasBalls
    ? `${batter} against ${bowler} in the ${tournament.shortName}: ${s.runs} runs off ${s.balls} balls at a strike rate of ${formatDecimal(s.sr)}, dismissed ${s.dismissals} ${s.dismissals === 1 ? 'time' : 'times'}, ${s.dot_pct}% dot balls.`
    : `Pick any ${tournament.shortName} batter and bowler to see their ball-by-ball duel, then browse the most contested matchups in the archive.`

  return (
    <div className="space-y-8">
      <SEO title={title} description={description} url="/matchups"
        schema={breadcrumbSchema([{ name: 'Dashboard', path: '/dashboard' }, { name: 'Matchups', path: '/matchups' }])} />

      <div>
        <h1 className="text-3xl font-heading font-bold text-text-primary">Batter vs Bowler</h1>
        <p className="text-text-secondary text-sm mt-1">Every ball the two have shared in the {tournament.shortName}, by phase, by {tournament.competitionLabel.toLowerCase()} and by match.</p>
      </div>

      <div className="card flex flex-wrap items-end gap-4">
        <PlayerPicker label="Batter" value={batter} onChange={setBatter} accent="accent-teal" />
        <span className="hidden md:block text-text-muted font-heading font-bold pb-2">vs</span>
        <PlayerPicker label="Bowler" value={bowler} onChange={setBowler} accent="accent-magenta" />
        <button type="button" onClick={() => { const b = batter; setBatter(''); setBowler(''); setTimeout(() => { setBatter(bowler); setBowler(b) }, 0) }}
          disabled={!ready} className="px-3 py-2 rounded-md border border-border-subtle text-xs text-text-secondary hover:text-text-primary disabled:opacity-40">
          Swap
        </button>
        {ready && (
          <button type="button" onClick={() => { setBatter(''); setBowler('') }} className="text-xs text-text-muted hover:text-text-primary underline pb-2">Clear</button>
        )}
      </div>

      {ready && (
        duelError ? (
          <div className="card text-center py-8">
            <p className="text-danger font-heading">Could not load this matchup</p>
            <p className="text-text-secondary text-sm mt-1">{duelError}</p>
          </div>
        ) : duelLoading || !duel ? (
          <Loading message="Finding every ball they shared..." />
        ) : !hasBalls ? (
          <div className="card text-center py-8">
            <p className="text-text-primary font-heading">{duel.batter} has not faced {duel.bowler} in the {tournament.shortName}</p>
            <p className="text-text-secondary text-sm mt-1">Try the most contested duels below.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <Link to={`/batting/${encodeURIComponent(duel.batter)}`} className="flex items-center gap-3">
                <PlayerAvatar name={duel.batter} size={56} />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-text-muted font-mono">Batter</p>
                  <p className="text-xl font-heading font-bold text-accent-teal">{duel.batter}</p>
                </div>
              </Link>
              <span className="text-text-muted font-heading font-bold text-lg">vs</span>
              <Link to={`/bowling/${encodeURIComponent(duel.bowler)}`} className="flex items-center gap-3">
                <PlayerAvatar name={duel.bowler} size={56} />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-text-muted font-mono">Bowler</p>
                  <p className="text-xl font-heading font-bold text-accent-magenta">{duel.bowler}</p>
                </div>
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <Stat label="Innings" value={s.matches} />
              <Stat label="Balls" value={s.balls} />
              <Stat label="Runs" value={s.runs} color="text-accent-teal" />
              <Stat label="Strike rate" value={formatDecimal(s.sr)} color="text-accent-teal" />
              <Stat label="Dismissals" value={s.dismissals} color="text-accent-magenta" />
              <Stat label="Average" value={s.avg == null ? 'no dismissal' : formatDecimal(s.avg)} color="text-accent-amber" />
              <Stat label="Dot balls" value={`${s.dot_pct}%`} color="text-accent-magenta" />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <section>
                <h2 className="text-lg font-heading font-semibold text-text-primary mb-3">By phase</h2>
                <DataTable columns={phaseColumns} data={duel.phases || []} />
              </section>
              <section>
                <h2 className="text-lg font-heading font-semibold text-text-primary mb-3">By {tournament.competitionLabel.toLowerCase()}</h2>
                <DataTable columns={seasonColumns} data={(duel.seasons || []).map((r) => ({ ...r, id: r.season }))} />
              </section>
            </div>
            <section>
              <h2 className="text-lg font-heading font-semibold text-text-primary mb-3">Every meeting</h2>
              <DataTable columns={historyColumns} data={(duel.history || []).map((r) => ({ ...r, id: r.match_id }))} pageSize={25} />
            </section>
          </div>
        )
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-heading font-bold text-text-primary">Most contested duels</h2>
          <p className="text-text-secondary text-sm mt-1">Pairs with at least {minBalls || 30} balls between them. Click a row to open the duel.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {SORTS.map((o) => (
            <button key={o.key} type="button" onClick={() => setSort(o.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-colors ${
                sort === o.key ? 'border-accent-brand text-accent-brand bg-accent-brand/10' : 'border-border-subtle text-text-muted hover:text-text-primary'}`}>
              {o.label}
            </button>
          ))}
          <MultiSeasonSelect seasons={seasons || []} value={season} onChange={setSeason} />
          <label className="flex items-center gap-2 text-xs text-text-secondary font-mono">
            Min balls
            <input type="number" min={6} max={500} value={minBalls} onChange={(e) => setMinBalls(Number(e.target.value) || 30)}
              className="w-20 bg-bg-card border border-border-subtle rounded-md px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-brand" />
          </label>
          <span className="text-xs text-text-muted font-mono">{formatNumber(duelRows.length)} pairs</span>
        </div>
        <DataTable columns={duelColumns} data={duelRows} loading={duelsLoading && !duels} pageSize={25}
          onRowClick={(row) => { setBatter(row.batter); setBowler(row.bowler); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
        <p className="text-xs text-text-muted">Dominance is strike rate minus 25 times the dismissal rate per hundred balls: high means the batter owns the matchup, negative means the bowler does.</p>
      </section>
    </div>
  )
}
