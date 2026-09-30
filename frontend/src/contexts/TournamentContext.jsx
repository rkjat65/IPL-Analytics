import { createContext, useContext, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { PREFIXES, tournamentFromPath } from '../lib/site'

export const TOURNAMENTS = {
  ipl: {
    slug: 'ipl',
    name: 'Indian Premier League',
    shortName: 'IPL',
    competitionLabel: 'Season',
    competitionLabelPlural: 'Seasons',
    teamLabel: 'Franchise',
    awards: { batting: 'Orange Cap', bowling: 'Purple Cap' },
  },
  t20wc: {
    slug: 't20wc',
    name: "ICC Men's T20 World Cup",
    shortName: 'T20 World Cup',
    competitionLabel: 'Edition',
    competitionLabelPlural: 'Editions',
    teamLabel: 'Team',
    awards: { batting: 'Leading Run-scorer', bowling: 'Leading Wicket-taker' },
  },
}

const TournamentContext = createContext(null)

export function TournamentProvider({ children }) {
  const location = useLocation()
  // The router's basename is the tournament prefix, so the slug never changes
  // inside one page load; switching tournaments is a full navigation.
  const slug = tournamentFromPath()

  const selectTournament = (nextSlug) => {
    if (!TOURNAMENTS[nextSlug] || nextSlug === slug) return
    window.location.assign(PREFIXES[nextSlug] + location.pathname + location.search)
  }

  const value = useMemo(() => ({
    ...TOURNAMENTS[slug],
    tournament: slug,
    isIPL: slug === 'ipl',
    isT20WorldCup: slug === 't20wc',
    selectTournament,
  }), [slug, location.pathname, location.search])

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>
}

export function useTournament() {
  const value = useContext(TournamentContext)
  if (!value) throw new Error('useTournament must be used inside TournamentProvider')
  return value
}
