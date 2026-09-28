const API_BASE = '/api'
// Public GET responses are cached by the installable app. Change this token
// when bundled databases or canonical API labels change.
const DATA_RELEASE = 'wikimedia-player-images-v2'

export function getActiveTournament() {
  const queryValue = new URLSearchParams(window.location.search).get('tournament')
  if (queryValue === 't20wc' || queryValue === 'ipl') return queryValue
  return window.localStorage.getItem('crickrida-tournament') === 't20wc' ? 't20wc' : 'ipl'
}

export function apiUrl(endpoint, params = {}) {
  const url = new URL(endpoint, window.location.origin)
  url.pathname = API_BASE + endpoint
  url.searchParams.set('tournament', getActiveTournament())
  url.searchParams.set('data_release', DATA_RELEASE)
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      url.searchParams.set(key, val)
    }
  })
  return url.toString()
}

export async function fetchAPI(endpoint, params = {}) {
  const url = apiUrl(endpoint, params)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// Meta
export const getSeasons = () => fetchAPI('/meta/seasons')
export const getTeams = () => fetchAPI('/meta/teams')
export const searchPlayers = (q) => fetchAPI('/meta/players', { q })
export const getPlayerImageCredits = () => fetchAPI('/meta/player-image-credits')

// Dashboard
export const getKPIs = (season) => fetchAPI('/analytics/kpis', { season })
export const getPhaseStats = (season) => fetchAPI('/analytics/phase-stats', { season })
export const getInningsDNA = (season) => fetchAPI('/analytics/innings-dna', { season })
export const getSixEvolution = () => fetchAPI('/analytics/six-evolution')
export const getBattingMatrix = (season, min_innings) => fetchAPI('/analytics/batting-matrix', { season, min_innings })
export const getBowlingMatrix = (season, min_innings) => fetchAPI('/analytics/bowling-matrix', { season, min_innings })
export const getChaseAnalysis = (season) => fetchAPI('/analytics/chase-analysis', { season })
export const getDismissalTypes = (season) => fetchAPI('/analytics/dismissal-types', { season })
export const getPhaseDominance = (season) => fetchAPI('/analytics/phase-dominance', { season })

// Matches
export const getMatches = (params) => fetchAPI('/matches', params)
export const getMatch = (id) => fetchAPI(`/matches/${id}`)
export const getWinProbability = (id) => fetchAPI(`/matches/${id}/win-probability`)

// Players
export const getBattingLeaderboard = (params) => fetchAPI('/players/batting/leaderboard', params)
export const getBowlingLeaderboard = (params) => fetchAPI('/players/bowling/leaderboard', params)
export const getPlayerBatting = (name) => fetchAPI(`/players/${encodeURIComponent(name)}/batting`)
export const getPlayerBowling = (name) => fetchAPI(`/players/${encodeURIComponent(name)}/bowling`)
export const getPlayerBattingMatchups = (name) => fetchAPI(`/players/${encodeURIComponent(name)}/matchups/batting`)
export const getPlayerBowlingMatchups = (name) => fetchAPI(`/players/${encodeURIComponent(name)}/matchups/bowling`)

// Teams
export const getTeamStats = (name) => fetchAPI(`/teams/${encodeURIComponent(name)}/stats`)
export const getTeamSeasons = (name) => fetchAPI(`/teams/${encodeURIComponent(name)}/seasons`)
export const getTeamH2H = (name) => fetchAPI(`/teams/${encodeURIComponent(name)}/h2h`)
export const compareTeams = (team1, team2) => fetchAPI('/teams/compare', { team1, team2 })

// Venues
export const getVenues = () => fetchAPI('/venues')
export const getVenueStats = (name) => fetchAPI(`/venues/${encodeURIComponent(name)}/stats`)
export const getVenueTopPerformers = (name) => fetchAPI(`/venues/${encodeURIComponent(name)}/top-performers`)

// Seasons
export const getSeasonSummary = (season) => fetchAPI(`/seasons/${encodeURIComponent(season)}/summary`)
export const getSeasonGroups = (season) => fetchAPI(`/seasons/${encodeURIComponent(season)}/groups`)
export const getPointsTable = (season, group, stage) => fetchAPI(`/seasons/${encodeURIComponent(season)}/points-table`, { group, stage })
export const getCapRace = (season) => fetchAPI(`/seasons/${encodeURIComponent(season)}/cap-race`)

// Images
export const getImageStyles = () => fetchAPI('/images/styles')
export const getImageFormats = () => fetchAPI('/images/formats')
export const generateCardImage = (data) => {
  return fetch(apiUrl('/images/generate-base64'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(res => {
    if (!res.ok) return res.json().then(e => { throw new Error(e.detail || 'Image gen failed') })
    return res.json()
  })
}

// Advanced Analytics
export const getPlayerImpact = (player, season) => fetchAPI('/advanced/player-impact', { player, season })
export const getBattingImpact = (player, season) => fetchAPI('/advanced/batting-impact', { player, season })

// Analytics
export const getVenueAnalytics = (season) => fetchAPI('/analytics/venues', { season })
export const getTossImpact = (season) => fetchAPI('/analytics/toss-impact', { season })
export const getTopTotals = (season) => fetchAPI('/analytics/top-totals', { season })
export const getTopSixes = (season) => fetchAPI('/analytics/top-sixes', { season })
export const getTopFours = (season) => fetchAPI('/analytics/top-fours', { season })
export const getMostWins = (season) => fetchAPI('/analytics/most-wins', { season })
export const getTitleWinners = () => fetchAPI('/analytics/title-winners')
export const getCapWinners = () => fetchAPI('/analytics/cap-winners')

// Pulse — trending insights and On This Day
export const getPulseFeed = (params) => fetchAPI('/pulse/feed', params)
export const getPulseOnThisDay = (params) => fetchAPI('/pulse/on-this-day', params)
export const getPulseCalendarMonth = (month) => fetchAPI('/pulse/calendar-month', { month })
export const getPulseTrending = (limit) => fetchAPI('/pulse/trending', { limit })
export const generateInsightCard = (cardConfig, dimensions) => {
  return fetch(apiUrl('/pulse/insight-card'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_config: cardConfig, dimensions }),
  }).then(res => {
    if (!res.ok) return res.json().then(e => { throw new Error(e.detail || 'Card gen failed') })
    return res.json()
  })
}

// Admin
export const getAdminUsers = (token) => {
  return fetch(apiUrl('/auth/admin/users'), {
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => {
    if (!res.ok) return res.json().then(e => { throw new Error(e.detail || 'Access denied') })
    return res.json()
  })
}

export const getAdminStats = (token) => {
  return fetch(apiUrl('/auth/admin/stats'), {
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => {
    if (!res.ok) return res.json().then(e => { throw new Error(e.detail || 'Access denied') })
    return res.json()
  })
}

// Fantasy picks and quiz
export const getFantasyPicks = (team1, team2, venue) => fetchAPI('/fantasy/picks', { team1, team2, venue })
export const getQuizPlayer = (level, seed) => fetchAPI('/quiz/player', { level, seed })
