import { Link } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import { getTeams, getTeamStats } from '../lib/api'
import SEO from '../components/SEO'
import Loading from '../components/ui/Loading'
import { formatDecimal } from '../utils/format'
import { getTeamColor } from '../constants/teams'
import { useTournament } from '../contexts/TournamentContext'
import TeamLogo from '../components/ui/TeamLogo'
import { useState, useEffect } from 'react'

function TeamCard({ team }) {
  const { data: stats, loading } = useFetch(() => getTeamStats(team), [team])
  const color = getTeamColor(team)

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-1 rounded-t-lg mb-4" style={{ backgroundColor: color }} />
        <div className="h-5 bg-bg-card-hover rounded w-3/4 mb-3" />
        <div className="h-8 bg-bg-card-hover rounded w-1/2 mb-4" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-10 bg-bg-card-hover rounded" />
          <div className="h-10 bg-bg-card-hover rounded" />
          <div className="h-10 bg-bg-card-hover rounded" />
        </div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <Link to={`/teams/${encodeURIComponent(team)}`} className="block group">
      <div className="card hover:border-accent-cyan/30 transition-all duration-200 overflow-hidden">
        <div
          className="h-1 -mx-4 -mt-4 mb-4 rounded-t-lg"
          style={{ backgroundColor: color }}
        />
        <div className="flex items-center gap-3 mb-2">
          <TeamLogo team={team} size={36} />
          <h3
            className="text-lg font-heading font-bold group-hover:underline"
            style={{ color }}
          >
            {team}
          </h3>
        </div>
        <p className="text-3xl font-heading font-bold text-accent-cyan stat-glow-cyan mb-4 font-mono">
          {formatDecimal(stats.win_pct, 1)}%
          <span className="text-xs text-text-muted font-body font-normal ml-2 uppercase tracking-wider">
            Win Rate
          </span>
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider">Mat</p>
            <p className="text-sm font-mono font-semibold text-text-primary">{stats.matches}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider">Won</p>
            <p className="text-sm font-mono font-semibold text-accent-lime">{stats.wins}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider">Lost</p>
            <p className="text-sm font-mono font-semibold text-danger">{stats.losses}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function Teams() {
  const tournament = useTournament()
  const { data: teams, loading, error } = useFetch(() => getTeams(), [])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-danger font-heading text-lg">Failed to load teams</p>
        <p className="text-text-secondary text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <SEO
        title={`${tournament.shortName} Teams — Stats, Win Records & History`}
        description={`Explore analytics for every ${tournament.name} team: win rates, performance statistics, ${tournament.competitionLabel.toLowerCase()} records, and historical data.`}
        url="/teams"
      />
      <div>
        <h1 className="text-3xl font-heading font-bold text-text-primary">Team Analytics</h1>
        <p className="text-text-secondary text-sm mt-1">
          Performance overview across all {tournament.name} teams
        </p>
      </div>

      {loading ? (
        <Loading message="Loading teams..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(teams || []).map((team) => (
            <TeamCard key={team} team={team} />
          ))}
        </div>
      )}
    </div>
  )
}
