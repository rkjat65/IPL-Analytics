import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

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

function normalize(value) {
  return TOURNAMENTS[value] ? value : 'ipl'
}

function initialTournament() {
  const query = new URLSearchParams(window.location.search).get('tournament')
  return normalize(query || window.localStorage.getItem('crickrida-tournament'))
}

export function TournamentProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [slug, setSlug] = useState(initialTournament)

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('tournament')
    if (requested && TOURNAMENTS[requested] && requested !== slug) {
      setSlug(requested)
    }
  }, [location.search, slug])

  useEffect(() => {
    window.localStorage.setItem('crickrida-tournament', slug)
    // Read the *current* URL, not this render's location: a child <Navigate>
    // (e.g. / -> /dashboard) may already have moved on in the same commit, and
    // re-using the stale pathname would undo that redirect.
    const { pathname, search } = window.location
    const params = new URLSearchParams(search)
    if (params.get('tournament') !== slug) {
      params.set('tournament', slug)
      navigate({ pathname, search: params.toString() }, { replace: true })
    }
  }, [slug, location.pathname, location.search, navigate])

  const selectTournament = (nextSlug) => {
    const normalized = normalize(nextSlug)
    setSlug(normalized)
    const params = new URLSearchParams(location.search)
    params.set('tournament', normalized)
    navigate({ pathname: location.pathname, search: params.toString() })
  }

  const value = useMemo(() => ({
    ...TOURNAMENTS[slug],
    tournament: slug,
    isIPL: slug === 'ipl',
    isT20WorldCup: slug === 't20wc',
    selectTournament,
  }), [slug])

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>
}

export function useTournament() {
  const value = useContext(TournamentContext)
  if (!value) throw new Error('useTournament must be used inside TournamentProvider')
  return value
}
