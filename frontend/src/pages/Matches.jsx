import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import SEO from '../components/SEO'
import { useFetch } from '../hooks/useFetch'
import { getMatches, getSeasons, getTeams } from '../lib/api'
import Loading from '../components/ui/Loading'
import Badge from '../components/ui/Badge'
import MultiSeasonSelect from '../components/ui/MultiSeasonSelect'
import { useTournament } from '../contexts/TournamentContext'
import { formatDate, getMatchResult } from '../utils/format'
import { getTeamColor, getTeamAbbr } from '../constants/teams'

const PAGE_SIZE = 20

export default function Matches() {
  const tournament = useTournament()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const season = searchParams.get('season') || ''
  const team = searchParams.get('team') || ''
  const page = parseInt(searchParams.get('page') || '1', 10)
  const offset = (page - 1) * PAGE_SIZE

  const { data: seasons } = useFetch(() => getSeasons(), [])
  const { data: teams } = useFetch(() => getTeams(), [])

  const { data: matchesData, loading, error } = useFetch(
    () => getMatches({ season, team, limit: PAGE_SIZE, offset }),
    [season, team, page]
  )

  const matches = matchesData?.matches || []
  const total = matchesData?.total || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  function updateParam(key, value) {
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    // Reset to page 1 when filters change
    if (key !== 'page') {
      params.delete('page')
    }
    setSearchParams(params)
  }

  const seasonOptions = (seasons || []).map((s) => ({ value: s, label: s }))
  const teamOptions = (teams || []).map((t) => ({ value: t, label: t }))

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-danger font-heading text-lg">Failed to load matches</p>
        <p className="text-text-secondary text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SEO
        title={`${tournament.shortName} Matches — Full Archive, Scorecards & Results`}
        description={`Browse ${tournament.name} matches with detailed scorecards, results, and match summaries. Filter by ${tournament.competitionLabel.toLowerCase()} and team.`}
        url="/matches"
      />
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-text-primary">Matches</h1>
          <p className="text-text-secondary text-sm mt-1">
            {loading ? 'Loading...' : `${total.toLocaleString()} matches found`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-text-secondary text-sm font-body">{tournament.competitionLabel}</label>
          <MultiSeasonSelect
            seasons={seasons || []}
            value={season}
            onChange={(val) => updateParam('season', val)}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-text-secondary text-sm font-body">Team</label>
          <select
            value={team}
            onChange={(e) => updateParam('team', e.target.value)}
            className="bg-bg-card border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary font-body focus:outline-none focus:border-accent-cyan transition-colors appearance-none cursor-pointer pr-8"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238888A0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
            }}
          >
            <option value="">All Teams</option>
            {teamOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Match List */}
      {loading ? (
        <Loading message="Loading matches..." />
      ) : matches.length === 0 ? (
        <p className="text-text-muted text-sm py-12 text-center">No matches found for the selected filters.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border-subtle">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-elevated border-b border-border-subtle">
                  <th className="px-4 py-3 font-medium text-text-muted text-xs uppercase tracking-wider text-left whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 font-medium text-text-muted text-xs uppercase tracking-wider text-left whitespace-nowrap">Teams</th>
                  <th className="px-4 py-3 font-medium text-text-muted text-xs uppercase tracking-wider text-left whitespace-nowrap hidden md:table-cell">Venue</th>
                  <th className="px-4 py-3 font-medium text-text-muted text-xs uppercase tracking-wider text-left whitespace-nowrap">Result</th>
                  <th className="px-4 py-3 font-medium text-text-muted text-xs uppercase tracking-wider text-left whitespace-nowrap hidden sm:table-cell">Player of Match</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match, i) => (
                  <tr
                    key={match.match_id}
                    onClick={() => navigate(`/matches/${match.match_id}`)}
                    className={`border-b border-border-subtle transition-colors hover:bg-bg-card-hover cursor-pointer animate-row ${
                      i % 2 === 1 ? 'bg-bg-card/50' : ''
                    }`}
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link to={`/matches/${match.match_id}`} className="text-text-secondary font-mono text-xs hover:text-text-primary">
                        {formatDate(match.date)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/matches/${match.match_id}`} className="hover:underline">
                        <span className="font-heading font-semibold text-text-primary">
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                            style={{ backgroundColor: getTeamColor(match.team1) }}
                          />
                          {getTeamAbbr(match.team1)}
                        </span>
                        <span className="text-text-muted mx-2">vs</span>
                        <span className="font-heading font-semibold text-text-primary">
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                            style={{ backgroundColor: getTeamColor(match.team2) }}
                          />
                          {getTeamAbbr(match.team2)}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs hidden md:table-cell max-w-[200px] truncate">
                      {match.venue}{match.city ? `, ${match.city}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/matches/${match.match_id}`}>
                        {match.winner ? (
                          <Badge
                            text={getMatchResult(match)}
                            color={match.winner === match.team1 ? 'cyan' : 'magenta'}
                          />
                        ) : (
                          <Badge text={getMatchResult(match)} color="muted" />
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-accent-amber text-xs hidden sm:table-cell">
                      {match.player_of_match || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-text-muted text-sm">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateParam('page', String(page - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 text-sm font-body rounded-md border border-border-subtle bg-bg-card text-text-primary hover:bg-bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="text-text-secondary text-sm font-mono px-2">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => updateParam('page', String(page + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 text-sm font-body rounded-md border border-border-subtle bg-bg-card text-text-primary hover:bg-bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
