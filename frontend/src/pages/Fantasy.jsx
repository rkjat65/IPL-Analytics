import { useMemo } from 'react'
import SEO from '../components/SEO'
import Select from '../components/ui/Select'
import Loading from '../components/ui/Loading'
import PlayerAvatar from '../components/ui/PlayerAvatar'
import { useFetch } from '../hooks/useFetch'
import useUrlState from '../hooks/useUrlState'
import { getTeams, getVenues, getFantasyPicks } from '../lib/api'
import { getTeamColor, getTeamAbbr } from '../constants/teams'
import { useTournament } from '../contexts/TournamentContext'

const ROLE_STYLE = {
  Batter: 'text-accent-cyan bg-accent-cyan/10',
  Bowler: 'text-accent-magenta bg-accent-magenta/10',
  'All-rounder': 'text-accent-lime bg-accent-lime/10',
}

function PickRow({ p, badge, max }) {
  const color = getTeamColor(p.team)
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated/60 px-3 py-2.5">
      <PlayerAvatar name={p.player} size={36} teamColor={color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-text-primary">{p.player}</span>
          {badge && (
            <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${badge === 'C' ? 'bg-accent-amber/20 text-accent-amber' : 'bg-accent-cyan/20 text-accent-cyan'}`}>{badge}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted">
          <span className="font-mono" style={{ color }}>{getTeamAbbr(p.team)}</span>
          <span className={`rounded px-1.5 font-mono ${ROLE_STYLE[p.role]}`}>{p.role}</span>
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-white/5">
          <div className="h-1 rounded-full bg-gradient-to-r from-accent-cyan to-accent-lime" style={{ width: `${Math.max(6, (p.projected / max) * 100)}%` }} />
        </div>
      </div>
      <div className="text-right">
        <div className="font-heading text-lg font-bold text-text-primary tabular-nums">{p.projected}</div>
        <div className="font-mono text-[10px] uppercase text-text-muted">proj pts</div>
      </div>
    </div>
  )
}

export default function Fantasy() {
  const tournament = useTournament()
  const [team1, setTeam1] = useUrlState('team1', '')
  const [team2, setTeam2] = useUrlState('team2', '')
  const [venue, setVenue] = useUrlState('venue', '')
  const { data: teams } = useFetch(() => getTeams(), [])
  const { data: venues } = useFetch(() => getVenues(), [])
  const ready = team1 && team2 && team1 !== team2
  const { data, loading, error } = useFetch(
    () => (ready ? getFantasyPicks(team1, team2, venue || undefined) : Promise.resolve(null)),
    [team1, team2, venue]
  )

  const teamOptions = (teams || []).map(t => ({ value: t, label: t }))
  const venueOptions = [{ value: '', label: 'Any venue' }, ...(venues || []).map(v => ({ value: v.venue, label: v.venue }))]
  const xi = useMemo(() => {
    if (!data) return []
    const byName = Object.fromEntries(data.players.map(p => [p.player, p]))
    return data.xi.map(n => byName[n]).filter(Boolean)
  }, [data])
  const max = Math.max(1, ...(data?.players || []).map(p => p.projected))

  return (
    <div className="space-y-6">
      <SEO
        title={`${tournament.shortName} Fantasy Picks — Projected Points, Captain & Vice-Captain`}
        description={`Pick two ${tournament.shortName} teams and a venue to get projected fantasy points from recent form and venue record, with a suggested XI, captain and vice-captain.`}
        url="/fantasy"
      />
      <div>
        <h1 className="text-3xl font-heading font-bold text-text-primary">Fantasy Picks</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Projected fantasy points from each player&apos;s last 10 matches, blended with their record at the venue.
        </p>
      </div>

      <div className="card grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5 text-xs font-mono text-text-muted">
          <span>Team 1</span>
          <Select className="w-full" options={teamOptions} value={team1} onChange={setTeam1} placeholder="Choose team" />
        </label>
        <label className="space-y-1.5 text-xs font-mono text-text-muted">
          <span>Team 2</span>
          <Select className="w-full" options={teamOptions.filter(o => o.value !== team1)} value={team2} onChange={setTeam2} placeholder="Choose team" />
        </label>
        <label className="space-y-1.5 text-xs font-mono text-text-muted">
          <span>Venue (optional)</span>
          <Select className="w-full" options={venueOptions} value={venue} onChange={setVenue} placeholder={null} />
        </label>
      </div>

      {!ready && (
        <div className="card py-12 text-center text-sm text-text-secondary">
          Choose two teams to see projected points and a suggested XI.
        </div>
      )}
      {ready && loading && <Loading message="Crunching recent form…" />}
      {ready && error && <div className="card text-sm text-danger">Couldn&apos;t load picks for these teams.</div>}

      {ready && data && !loading && (
        <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <section className="card space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-heading text-lg font-semibold text-text-primary">Suggested XI</h2>
              <span className="font-mono text-xs text-text-muted">max 7 per side · 3+ bowling options</span>
            </div>
            <div className="space-y-2 stagger-children">
              {xi.map(p => (
                <PickRow key={p.player} p={p} max={max}
                  badge={p.player === data.captain ? 'C' : p.player === data.vice_captain ? 'VC' : null} />
              ))}
            </div>
          </section>

          <section className="card overflow-x-auto">
            <h2 className="mb-3 font-heading text-lg font-semibold text-text-primary">All players</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[11px] uppercase text-text-muted">
                  <th className="py-2 pr-2">Player</th>
                  <th className="py-2 pr-2">Proj</th>
                  <th className="py-2 pr-2">Last 10 avg</th>
                  <th className="py-2 pr-2">Runs / Wkts (L10)</th>
                  <th className="py-2">{venue ? 'At venue' : 'Venue'}</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map(p => (
                  <tr key={p.player} className="border-t border-border-subtle">
                    <td className="py-2 pr-2">
                      <span className="font-medium text-text-primary">{p.player}</span>
                      <span className="ml-2 font-mono text-[10px]" style={{ color: getTeamColor(p.team) }}>{getTeamAbbr(p.team)}</span>
                    </td>
                    <td className="py-2 pr-2 font-mono font-semibold text-text-primary">{p.projected}</td>
                    <td className="py-2 pr-2 font-mono text-text-secondary">{p.recent_avg}</td>
                    <td className="py-2 pr-2 font-mono text-text-secondary">{p.recent_runs} / {p.recent_wickets}</td>
                    <td className="py-2 font-mono text-text-secondary">
                      {p.venue_matches ? `${p.venue_avg} (${p.venue_matches} m)` : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-text-muted">
              Squads are players who appeared for each team in its most recent {tournament.competitionLabel.toLowerCase()}. Points: 1/run, +1/four, +2/six, milestone bonuses, 25/wicket, +8 lbw/bowled, haul bonuses, 8/catch.
              For fun and research — not betting advice.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
