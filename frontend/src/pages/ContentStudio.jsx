import { useState, useEffect, useRef, useCallback } from 'react'
import { apiUrl, getSeasons, getTeams, searchPlayers, getPlayerBatting, getPlayerBowling, getPlayerBattingMatchups, getPlayerBowlingMatchups, getMatches, getMatch, getSeasonSummary } from '../lib/api'
import SEO from '../components/SEO'
import { exportAsImage, downloadImage, copyToClipboard } from '../utils/exportCard'
import { CARD_DIMENSIONS } from '../components/cards/cardStyles'
import PlayerStatCard from '../components/cards/PlayerStatCard'
import MatchSummaryCard from '../components/cards/MatchSummaryCard'
import ComparisonCard from '../components/cards/ComparisonCard'
import RecordCard from '../components/cards/RecordCard'
import SeasonRecapCard from '../components/cards/SeasonRecapCard'
import MatchupCard from '../components/cards/MatchupCard'
import PlayerAvatar from '../components/ui/PlayerAvatar'
import { useTournament } from '../contexts/TournamentContext'
import { buildCaption, statLines } from '../utils/caption'

const TEMPLATES = [
  { id: 'player', label: 'Player Stats', color: '#00E5FF' },
  { id: 'match', label: 'Match Summary', color: '#FF2D78' },
  { id: 'comparison', label: 'Comparison', color: '#B8FF00' },
  { id: 'bat_v_ball', label: 'Bat v Ball', color: '#FFB800' },
  { id: 'ball_v_bat', label: 'Ball v Bat', color: '#8B5CF6' },
  { id: 'record', label: 'Record Card', color: '#FFB800' },
  { id: 'season', label: 'Season Recap', color: '#00E5FF' },
  { id: 'team_form', label: 'Team Form', color: '#22D3EE' },
]

const FORMAT_OPTIONS = [
  { id: 'twitter', label: 'Twitter', dims: CARD_DIMENSIONS.twitter },
  { id: 'instagram', label: 'Instagram', dims: CARD_DIMENSIONS.instagram },
  { id: 'linkedin', label: 'LinkedIn', dims: CARD_DIMENSIONS.linkedin },
  { id: 'portrait', label: 'Portrait 9:16', dims: CARD_DIMENSIONS.portrait },
]

// Extracted outside to prevent re-mount on every render (which causes input focus loss)
function PlayerSearchInput({ query, setQuery, results, setResults, onSelect, selectedName, label }) {
  return (
    <div className="relative">
      <label className="block text-xs font-mono text-text-muted mb-1">{label}</label>
      <div className="relative">
        {selectedName && (
          <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10">
            <PlayerAvatar name={selectedName} size={24} showBorder={false} />
          </div>
        )}
        <input
          type="text"
          value={selectedName || query}
          onChange={e => { setQuery(e.target.value); onSelect('') }}
          placeholder="Search player..."
          className={`w-full bg-bg-card border border-border-subtle rounded-lg py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/50 ${selectedName ? 'pl-9 pr-3' : 'px-3'}`}
        />
      </div>
      {results.length > 0 && !selectedName && (
        <div className="absolute z-20 top-full mt-1 w-full bg-bg-elevated border border-border-subtle rounded-lg max-h-48 overflow-y-auto shadow-xl">
          {results.map(p => (
            <button
              key={p}
              onClick={() => { onSelect(p); setQuery(''); setResults([]) }}
              className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-card transition-colors flex items-center gap-2"
            >
              <PlayerAvatar name={p} size={24} showBorder={false} />
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ContentStudio() {
  const tournament = useTournament()
  const cardRef = useRef(null)
  const [template, setTemplate] = useState('player')
  const [format, setFormat] = useState('twitter')
  const [status, setStatus] = useState(null)

  // Data sources
  const [seasons, setSeasons] = useState([])
  const [teams, setTeams] = useState([])
  const [playerQuery, setPlayerQuery] = useState('')
  const [playerResults, setPlayerResults] = useState([])
  const [matchList, setMatchList] = useState([])

  // Player stat card state
  const [playerName, setPlayerName] = useState('')
  const [playerType, setPlayerType] = useState('batting')
  const [playerStats, setPlayerStats] = useState({})
  const [playerLoading, setPlayerLoading] = useState(false)

  // Match summary state
  const [matchId, setMatchId] = useState('')
  const [matchData, setMatchData] = useState({})
  const [matchSeason, setMatchSeason] = useState('')
  const [matchTeam, setMatchTeam] = useState('')

  // Comparison state
  const [p1Query, setP1Query] = useState('')
  const [p1Results, setP1Results] = useState([])
  const [p1Name, setP1Name] = useState('')
  const [p1Stats, setP1Stats] = useState({})
  const [p2Query, setP2Query] = useState('')
  const [p2Results, setP2Results] = useState([])
  const [p2Name, setP2Name] = useState('')
  const [p2Stats, setP2Stats] = useState({})
  const [compMetric, setCompMetric] = useState('batting')
  const [p1Type, setP1Type] = useState('batting')
  const [p2Type, setP2Type] = useState('batting')

  // Record card state
  const [recordTitle, setRecordTitle] = useState('')
  const [recordValue, setRecordValue] = useState('')
  const [recordSubtitle, setRecordSubtitle] = useState('')
  const [recordDesc, setRecordDesc] = useState('')

  // Season recap state
  const [selectedSeason, setSelectedSeason] = useState('')
  const [seasonData, setSeasonData] = useState({})

  // Bat v Ball state
  const [bvbPlayerQuery, setBvbPlayerQuery] = useState('')
  const [bvbPlayerResults, setBvbPlayerResults] = useState([])
  const [bvbPlayerName, setBvbPlayerName] = useState('')
  const [bvbMatchups, setBvbMatchups] = useState([])
  const [bvbOpponent, setBvbOpponent] = useState('')
  const [bvbStats, setBvbStats] = useState({})

  // Ball v Bat state
  const [blvbPlayerQuery, setBlvbPlayerQuery] = useState('')
  const [blvbPlayerResults, setBlvbPlayerResults] = useState([])
  const [blvbPlayerName, setBlvbPlayerName] = useState('')
  const [blvbMatchups, setBlvbMatchups] = useState([])
  const [blvbOpponent, setBlvbOpponent] = useState('')
  const [blvbStats, setBlvbStats] = useState({})

  // Team Form state
  const [tfTeam, setTfTeam] = useState('')
  const [tfLastN, setTfLastN] = useState(10)
  const [tfData, setTfData] = useState(null)
  const [tfLoading, setTfLoading] = useState(false)

  // Caption for the current card
  const [caption, setCaption] = useState('')
  // Load initial data
  useEffect(() => {
    getSeasons().then(setSeasons).catch(() => {})
    getTeams().then(setTeams).catch(() => {})
  }, [])

  // Load matches when filters change
  useEffect(() => {
    const params = { limit: 500 }
    if (matchSeason) params.season = matchSeason
    if (matchTeam) params.team = matchTeam
    getMatches(params).then(r => setMatchList(r.matches || r || [])).catch(() => {})
  }, [matchSeason, matchTeam])

  // Player search
  useEffect(() => {
    if (playerQuery.length < 2) { setPlayerResults([]); return }
    const t = setTimeout(() => {
      searchPlayers(playerQuery).then(setPlayerResults).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [playerQuery])

  // Load player stats when selected
  useEffect(() => {
    if (!playerName) return
    setPlayerLoading(true)
    const fetcher = playerType === 'batting' ? getPlayerBatting : getPlayerBowling
    fetcher(playerName)
      .then(data => {
        const c = data.career || data || {}
        if (playerType === 'batting') {
          setPlayerStats({
            runs: c.runs ?? c.total_runs,
            matches: c.matches,
            innings: c.innings,
            avg: c.avg ?? c.average,
            sr: c.sr ?? c.strike_rate,
            fifties: c.fifties ?? c.half_centuries,
            hundreds: c.hundreds ?? c.centuries,
            sixes: c.sixes,
            fours: c.fours,
          })
        } else {
          setPlayerStats({
            wickets: c.wickets ?? c.total_wickets,
            matches: c.matches,
            innings: c.innings,
            avg: c.avg ?? c.average,
            economy: c.economy,
            sr: c.sr ?? c.strike_rate,
            best_figures: c.best_figures ?? c.best,
            four_wickets: c.four_w ?? c.four_wickets,
            five_wickets: c.five_w ?? c.five_wickets,
          })
        }
      })
      .catch(() => setPlayerStats({}))
      .finally(() => setPlayerLoading(false))
  }, [playerName, playerType])

  // Load match data
  useEffect(() => {
    if (!matchId) return
    getMatch(matchId)
      .then(data => {
        const info = data.info || data || {}
        const sc = data.scorecards || []
        const team1Score = sc[0]?.total_runs
        const team2Score = sc[1]?.total_runs
        const margin = info.win_by_runs ? `${info.win_by_runs} runs` : info.win_by_wickets ? `${info.win_by_wickets} wickets` : ''
        setMatchData({ ...info, team1_score: team1Score, team2_score: team2Score, margin })
      })
      .catch(() => setMatchData({}))
  }, [matchId])

  // Comparison player search
  useEffect(() => {
    if (p1Query.length < 2) { setP1Results([]); return }
    const t = setTimeout(() => searchPlayers(p1Query).then(setP1Results).catch(() => {}), 300)
    return () => clearTimeout(t)
  }, [p1Query])

  useEffect(() => {
    if (p2Query.length < 2) { setP2Results([]); return }
    const t = setTimeout(() => searchPlayers(p2Query).then(setP2Results).catch(() => {}), 300)
    return () => clearTimeout(t)
  }, [p2Query])

  // Load comparison player stats (per-player type)
  useEffect(() => {
    if (!p1Name) return
    const fetcher = p1Type === 'batting' ? getPlayerBatting : getPlayerBowling
    fetcher(p1Name).then(data => {
      const d = data.career || data || {}
      setP1Stats(p1Type === 'batting' ? {
        runs: d.runs ?? d.total_runs, avg: d.avg ?? d.average, sr: d.sr ?? d.strike_rate,
        matches: d.matches, fifties: d.fifties ?? d.half_centuries,
        hundreds: d.hundreds ?? d.centuries, sixes: d.sixes,
      } : {
        wickets: d.wickets ?? d.total_wickets, avg: d.avg ?? d.average,
        economy: d.economy, sr: d.sr ?? d.strike_rate, matches: d.matches,
        four_wickets: d.four_w ?? d.four_wickets,
        five_wickets: d.five_w ?? d.five_wickets,
      })
    }).catch(() => setP1Stats({}))
  }, [p1Name, p1Type])

  useEffect(() => {
    if (!p2Name) return
    const fetcher = p2Type === 'batting' ? getPlayerBatting : getPlayerBowling
    fetcher(p2Name).then(data => {
      const d = data.career || data || {}
      setP2Stats(p2Type === 'batting' ? {
        runs: d.runs ?? d.total_runs, avg: d.avg ?? d.average, sr: d.sr ?? d.strike_rate,
        matches: d.matches, fifties: d.fifties ?? d.half_centuries,
        hundreds: d.hundreds ?? d.centuries, sixes: d.sixes,
      } : {
        wickets: d.wickets ?? d.total_wickets, avg: d.avg ?? d.average,
        economy: d.economy, sr: d.sr ?? d.strike_rate, matches: d.matches,
        four_wickets: d.four_w ?? d.four_wickets,
        five_wickets: d.five_w ?? d.five_wickets,
      })
    }).catch(() => setP2Stats({}))
  }, [p2Name, p2Type])

  // Season recap
  useEffect(() => {
    if (!selectedSeason) return
    getSeasonSummary(selectedSeason)
      .then(data => {
        const oc = data.orange_cap
        const pc = data.purple_cap
        const mp = data.most_pom
        const ms = data.most_sixes
        const be = data.best_economy
        setSeasonData({
          ...data,
          champion: data.champion || data.winner || '',
          orange_cap: typeof oc === 'object' ? `${oc.player} (${oc.runs} runs)` : oc,
          purple_cap: typeof pc === 'object' ? `${pc.player} (${pc.wickets} wkts)` : pc,
          most_pom: typeof mp === 'object' ? `${mp.player} (${mp.awards ?? mp.count})` : mp,
          most_sixes: typeof ms === 'object' ? `${ms.player} (${ms.sixes} sixes)` : ms || '-',
          best_economy: typeof be === 'object' ? `${be.player} (${be.economy})` : be || '-',
        })
      })
      .catch(() => setSeasonData({}))
  }, [selectedSeason])

  // Bat v Ball player search
  useEffect(() => {
    if (bvbPlayerQuery.length < 2) { setBvbPlayerResults([]); return }
    const t = setTimeout(() => searchPlayers(bvbPlayerQuery).then(setBvbPlayerResults).catch(() => {}), 300)
    return () => clearTimeout(t)
  }, [bvbPlayerQuery])

  // Load bat v ball matchups when player selected
  useEffect(() => {
    if (!bvbPlayerName) return
    getPlayerBattingMatchups(bvbPlayerName)
      .then(data => { setBvbMatchups(data || []); setBvbOpponent(''); setBvbStats({}) })
      .catch(() => setBvbMatchups([]))
  }, [bvbPlayerName])

  // Set stats when opponent selected for bat v ball
  useEffect(() => {
    if (!bvbOpponent || bvbMatchups.length === 0) return
    const m = bvbMatchups.find(r => r.bowler === bvbOpponent)
    if (m) setBvbStats({ runs: m.runs, balls: m.balls, dots: m.dots, fours: m.fours, sixes: m.sixes, dismissals: m.dismissals, sr: m.sr })
  }, [bvbOpponent, bvbMatchups])

  // Ball v Bat player search
  useEffect(() => {
    if (blvbPlayerQuery.length < 2) { setBlvbPlayerResults([]); return }
    const t = setTimeout(() => searchPlayers(blvbPlayerQuery).then(setBlvbPlayerResults).catch(() => {}), 300)
    return () => clearTimeout(t)
  }, [blvbPlayerQuery])

  // Load ball v bat matchups when player selected
  useEffect(() => {
    if (!blvbPlayerName) return
    getPlayerBowlingMatchups(blvbPlayerName)
      .then(data => { setBlvbMatchups(data || []); setBlvbOpponent(''); setBlvbStats({}) })
      .catch(() => setBlvbMatchups([]))
  }, [blvbPlayerName])

  // Set stats when opponent selected for ball v bat
  useEffect(() => {
    if (!blvbOpponent || blvbMatchups.length === 0) return
    const m = blvbMatchups.find(r => r.batter === blvbOpponent)
    if (m) setBlvbStats({ runs: m.runs, balls: m.balls, dots: m.dots, wickets: m.wickets, economy: m.economy })
  }, [blvbOpponent, blvbMatchups])

  // Team Form data fetch
  useEffect(() => {
    if (!tfTeam || template !== 'team_form') return
    setTfLoading(true)
    fetch(apiUrl('/advanced/form-index', { team: tfTeam, last_n: tfLastN }))
      .then(r => r.ok ? r.json() : Promise.reject('Failed'))
      .then(d => { setTfData(d); setTfLoading(false) })
      .catch(() => { setTfData(null); setTfLoading(false) })
  }, [tfTeam, tfLastN, template])

  const currentDims = FORMAT_OPTIONS.find(f => f.id === format)?.dims || CARD_DIMENSIONS.twitter

  const handleDownload = useCallback(async () => {
    try {
      setStatus('Exporting...')
      const dataUrl = await exportAsImage(cardRef.current, `crickrida-${template}`, 'png')
      downloadImage(dataUrl, `crickrida-${template}.png`)
      setStatus('Downloaded!')
      setTimeout(() => setStatus(null), 2000)
    } catch (err) {
      setStatus('Export failed')
      console.error(err)
      setTimeout(() => setStatus(null), 2000)
    }
  }, [template])

  const handleCopy = useCallback(async () => {
    try {
      setStatus('Copying...')
      await copyToClipboard(cardRef.current)
      setStatus('Copied to clipboard!')
      setTimeout(() => setStatus(null), 2000)
    } catch (err) {
      setStatus('Copy failed')
      console.error(err)
      setTimeout(() => setStatus(null), 2000)
    }
  }, [])

  // Caption writer — builds a post from the card's own data (no AI service)
  const handleGenerateCaption = useCallback(() => {
    const t = tournament.shortName
    let headline = `${t} stats`
    let lines = []
    let tags = []
    switch (template) {
      case 'player':
        headline = `${playerName || 'Player'} — ${t} ${playerType} numbers 📊`
        lines = statLines(playerStats)
        tags = [playerName]
        break
      case 'match': {
        const margin = matchData.result_margin ? `${matchData.result_margin} ${matchData.result_type || ''}`.trim() : matchData.margin
        headline = `${matchData.team1 || 'Team 1'} vs ${matchData.team2 || 'Team 2'} 🏏`
        lines = [
          (matchData.team1_score || matchData.score1) && `${matchData.team1}: ${matchData.team1_score || matchData.score1}`,
          (matchData.team2_score || matchData.score2) && `${matchData.team2}: ${matchData.team2_score || matchData.score2}`,
          matchData.winner && `${matchData.winner} won${margin ? ` by ${margin}` : ''}`,
          (matchData.player_of_match || matchData.potm) && `Player of the match: ${matchData.player_of_match || matchData.potm}`,
        ].filter(Boolean)
        tags = [matchData.team1, matchData.team2]
        break
      }
      case 'comparison':
        headline = `${p1Name || 'Player 1'} vs ${p2Name || 'Player 2'} — who wins? ⚔️`
        lines = [
          ...statLines(p1Stats, 3).map(l => `${p1Name}: ${l}`),
          ...statLines(p2Stats, 3).map(l => `${p2Name}: ${l}`),
        ]
        tags = [p1Name, p2Name]
        break
      case 'record':
        headline = `${recordTitle || 'Record'} 🏆`
        lines = [recordValue && `${recordValue}${recordSubtitle ? ` — ${recordSubtitle}` : ''}`, recordDesc].filter(Boolean)
        break
      case 'bat_v_ball':
        headline = `${bvbPlayerName || 'Batter'} vs ${bvbOpponent || 'Bowler'} — the head-to-head 🎯`
        lines = statLines(bvbStats)
        tags = [bvbPlayerName, bvbOpponent]
        break
      case 'ball_v_bat':
        headline = `${blvbPlayerName || 'Bowler'} vs ${blvbOpponent || 'Batter'} — the head-to-head 🎯`
        lines = statLines(blvbStats)
        tags = [blvbPlayerName, blvbOpponent]
        break
      case 'season':
        headline = `${t} ${selectedSeason || ''} in review 🏆`.replace('  ', ' ')
        lines = [
          (seasonData.champion || seasonData.winner) && `Champions: ${seasonData.champion || seasonData.winner}`,
          seasonData.orange_cap && `${tournament.awards.batting}: ${seasonData.orange_cap}`,
          seasonData.purple_cap && `${tournament.awards.bowling}: ${seasonData.purple_cap}`,
          seasonData.most_sixes && `Most sixes: ${seasonData.most_sixes}`,
        ].filter(Boolean)
        break
      case 'team_form':
        headline = `${tfTeam || 'Team'} form check 📈`
        lines = [
          tfData?.form_index != null && `Form index: ${tfData.form_index}/100`,
          tfData?.current_streak && `Current streak: ${tfData.current_streak}`,
        ].filter(Boolean)
        tags = [tfTeam]
        break
    }
    setCaption(buildCaption({ headline, lines, tags, tournament: t, url: 'crickrida.rkjat.in' }))
  }, [template, tournament, playerName, playerType, playerStats, matchData, p1Name, p1Stats, p2Name, p2Stats, recordTitle, recordValue, recordSubtitle, recordDesc, seasonData, selectedSeason, bvbPlayerName, bvbOpponent, bvbStats, blvbPlayerName, blvbOpponent, blvbStats, tfTeam, tfData])

  function renderDataInputs() {
    switch (template) {
      case 'player':
        return (
          <div className="space-y-4">
            <PlayerSearchInput
              query={playerQuery} setQuery={setPlayerQuery}
              results={playerResults} setResults={setPlayerResults}
              onSelect={setPlayerName} selectedName={playerName}
              label="Player Name"
            />
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Stat Type</label>
              <div className="flex gap-2">
                {['batting', 'bowling'].map(t => (
                  <button key={t} onClick={() => setPlayerType(t)}
                    className={`px-4 py-2 text-sm rounded-lg border transition-colors ${playerType === t ? 'bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan' : 'border-border-subtle text-text-secondary hover:text-text-primary'}`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {playerLoading && <p className="text-xs text-text-muted font-mono">Loading stats...</p>}
          </div>
        )

      case 'match':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Filter by Season</label>
              <select
                value={matchSeason}
                onChange={e => { setMatchSeason(e.target.value); setMatchId('') }}
                className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
              >
                <option value="">All Seasons</option>
                {seasons.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Filter by Team</label>
              <select
                value={matchTeam}
                onChange={e => { setMatchTeam(e.target.value); setMatchId('') }}
                className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
              >
                <option value="">All Teams</option>
                {teams.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Select Match ({matchList.length} found)</label>
              <select
                value={matchId}
                onChange={e => setMatchId(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
              >
                <option value="">Choose a match...</option>
                {matchList.map(m => (
                  <option key={m.match_id || m.id} value={m.match_id || m.id}>
                    {m.team1} vs {m.team2} ({m.date || m.season})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )

      case 'comparison':
        return (
          <div className="space-y-4">
            <PlayerSearchInput
              query={p1Query} setQuery={setP1Query}
              results={p1Results} setResults={setP1Results}
              onSelect={setP1Name} selectedName={p1Name}
              label="Player 1"
            />
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Player 1 Type</label>
              <div className="flex gap-2">
                {['batting', 'bowling'].map(t => (
                  <button key={t} onClick={() => setP1Type(t)}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-lg border transition-colors ${p1Type === t ? 'bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan' : 'border-border-subtle text-text-secondary hover:text-text-primary'}`}
                  >
                    {t === 'batting' ? 'Batsman' : 'Bowler'}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-border-subtle pt-4" />
            <PlayerSearchInput
              query={p2Query} setQuery={setP2Query}
              results={p2Results} setResults={setP2Results}
              onSelect={setP2Name} selectedName={p2Name}
              label="Player 2"
            />
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Player 2 Type</label>
              <div className="flex gap-2">
                {['batting', 'bowling'].map(t => (
                  <button key={t} onClick={() => setP2Type(t)}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-lg border transition-colors ${p2Type === t ? 'bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan' : 'border-border-subtle text-text-secondary hover:text-text-primary'}`}
                  >
                    {t === 'batting' ? 'Batsman' : 'Bowler'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )

      case 'bat_v_ball':
        return (
          <div className="space-y-4">
            <PlayerSearchInput
              query={bvbPlayerQuery} setQuery={setBvbPlayerQuery}
              results={bvbPlayerResults} setResults={setBvbPlayerResults}
              onSelect={setBvbPlayerName} selectedName={bvbPlayerName}
              label="Batsman Name"
            />
            {bvbMatchups.length > 0 && (
              <div>
                <label className="block text-xs font-mono text-text-muted mb-1">Select Bowler ({bvbMatchups.length} matchups)</label>
                <select
                  value={bvbOpponent}
                  onChange={e => setBvbOpponent(e.target.value)}
                  className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
                >
                  <option value="">Choose bowler...</option>
                  {bvbMatchups.map(m => (
                    <option key={m.bowler} value={m.bowler}>
                      {m.bowler} ({m.balls} balls, {m.runs} runs)
                    </option>
                  ))}
                </select>
              </div>
            )}
            {bvbPlayerName && bvbMatchups.length === 0 && (
              <p className="text-xs text-text-muted font-mono">Loading matchups...</p>
            )}
          </div>
        )

      case 'ball_v_bat':
        return (
          <div className="space-y-4">
            <PlayerSearchInput
              query={blvbPlayerQuery} setQuery={setBlvbPlayerQuery}
              results={blvbPlayerResults} setResults={setBlvbPlayerResults}
              onSelect={setBlvbPlayerName} selectedName={blvbPlayerName}
              label="Bowler Name"
            />
            {blvbMatchups.length > 0 && (
              <div>
                <label className="block text-xs font-mono text-text-muted mb-1">Select Batsman ({blvbMatchups.length} matchups)</label>
                <select
                  value={blvbOpponent}
                  onChange={e => setBlvbOpponent(e.target.value)}
                  className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
                >
                  <option value="">Choose batsman...</option>
                  {blvbMatchups.map(m => (
                    <option key={m.batter} value={m.batter}>
                      {m.batter} ({m.balls} balls, {m.runs} runs)
                    </option>
                  ))}
                </select>
              </div>
            )}
            {blvbPlayerName && blvbMatchups.length === 0 && (
              <p className="text-xs text-text-muted font-mono">Loading matchups...</p>
            )}
          </div>
        )

      case 'record':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Title</label>
              <input type="text" value={recordTitle} onChange={e => setRecordTitle(e.target.value)}
                placeholder="e.g. Most sixes in a season"
                className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/50"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Value</label>
              <input type="text" value={recordValue} onChange={e => setRecordValue(e.target.value)}
                placeholder="e.g. 59"
                className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/50"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Subtitle / Badge</label>
              <input type="text" value={recordSubtitle} onChange={e => setRecordSubtitle(e.target.value)}
                placeholder="e.g. Did you know?"
                className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/50"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Description</label>
              <textarea value={recordDesc} onChange={e => setRecordDesc(e.target.value)}
                placeholder="Additional context about this record..."
                rows={3}
                className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/50 resize-none"
              />
            </div>
          </div>
        )

      case 'season':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Season</label>
              <select
                value={selectedSeason}
                onChange={e => setSelectedSeason(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50"
              >
                <option value="">Choose season...</option>
                {seasons.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        )

      case 'team_form':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Team</label>
              <select value={tfTeam} onChange={e => setTfTeam(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50">
                <option value="">Select team...</option>
                {teams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Last N Matches</label>
              <select value={tfLastN} onChange={e => setTfLastN(Number(e.target.value))}
                className="w-full bg-bg-card border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-cyan/50">
                {[5, 10, 15, 20].map(n => <option key={n} value={n}>Last {n}</option>)}
              </select>
            </div>
            {tfLoading && <p className="text-text-muted text-xs">Loading form data...</p>}
          </div>
        )

      default:
        return null
    }
  }

  function renderCard() {
    switch (template) {
      case 'player':
        return <PlayerStatCard playerName={playerName || 'Select a Player'} stats={playerStats} type={playerType} dimensions={currentDims} />
      case 'match':
        return (
          <MatchSummaryCard
            team1={matchData.team1 || 'Team 1'} team2={matchData.team2 || 'Team 2'}
            team1Score={matchData.team1_score || matchData.score1} team2Score={matchData.team2_score || matchData.score2}
            winner={matchData.winner} margin={matchData.result_margin ? `${matchData.result_margin} ${matchData.result_type || ''}`.trim() : matchData.margin}
            venue={matchData.venue} date={matchData.date}
            potm={matchData.player_of_match || matchData.potm}
            dimensions={currentDims}
          />
        )
      case 'comparison':
        return (
          <ComparisonCard
            player1={{ name: p1Name || 'Player 1', stats: p1Stats }}
            player2={{ name: p2Name || 'Player 2', stats: p2Stats }}
            metric={p1Type}
            metric2={p2Type}
            dimensions={currentDims}
          />
        )
      case 'bat_v_ball':
        return (
          <MatchupCard
            playerName={bvbPlayerName || 'Select Batsman'}
            opponentName={bvbOpponent || 'Select Bowler'}
            stats={bvbStats}
            mode="bat_v_ball"
            dimensions={currentDims}
          />
        )
      case 'ball_v_bat':
        return (
          <MatchupCard
            playerName={blvbPlayerName || 'Select Bowler'}
            opponentName={blvbOpponent || 'Select Batsman'}
            stats={blvbStats}
            mode="ball_v_bat"
            dimensions={currentDims}
          />
        )
      case 'record':
        return <RecordCard title={recordTitle} value={recordValue} subtitle={recordSubtitle} description={recordDesc} dimensions={currentDims} />
      case 'season':
        return (
          <SeasonRecapCard
            season={selectedSeason || '20XX'}
            champion={seasonData.champion || seasonData.winner}
            orangeCap={seasonData.orange_cap}
            purpleCap={seasonData.purple_cap}
            mostSixes={seasonData.most_sixes}
            bestEconomy={seasonData.best_economy}
            dimensions={currentDims}
          />
        )
      case 'team_form': {
        const fi = tfData?.form_index ?? 0
        const streak = tfData?.current_streak ?? ''
        const trend = tfData?.trend ?? tfData?.recent_matches ?? []
        const wins = trend.filter(m => m.result === 'W').length
        const losses = trend.filter(m => m.result === 'L').length
        const fiColor = fi >= 80 ? '#B8FF00' : fi >= 60 ? '#00E5FF' : fi >= 40 ? '#FFB800' : '#FF2D78'
        const fiLabel = fi >= 80 ? 'DOMINANT' : fi >= 60 ? 'STRONG' : fi >= 40 ? 'AVERAGE' : fi >= 20 ? 'STRUGGLING' : 'POOR'
        const isPortrait = currentDims.height > currentDims.width
        const scale = Math.sqrt((currentDims.width * currentDims.height) / (1200 * 675))
        const sf = (px) => Math.round(px * scale)
        return (
              <div style={{ width: currentDims.width, height: currentDims.height, background: 'linear-gradient(145deg, #0A0A0F, #111118)', position: 'relative', overflow: 'hidden', fontFamily: "'Inter', 'Helvetica Neue', sans-serif" }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: sf(5), background: `linear-gradient(90deg, ${fiColor}, ${fiColor}88)` }} />
                <div style={{ padding: isPortrait ? '8% 6%' : '5%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: isPortrait ? 'center' : 'space-between', gap: isPortrait ? sf(40) : undefined }}>
                  <div>
                    <p style={{ color: '#60607A', fontSize: sf(14), letterSpacing: 3, textTransform: 'uppercase', marginBottom: sf(8) }}>Team Form Index</p>
                    <h2 style={{ color: '#F0F0F5', fontSize: sf(36), fontWeight: 800, margin: 0 }}>{tfTeam || 'Select Team'}</h2>
                    <p style={{ color: '#A0A0B8', fontSize: sf(16), marginTop: sf(6) }}>Last {tfLastN} matches</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: isPortrait ? 'column' : 'row', alignItems: 'center', gap: isPortrait ? sf(32) : '8%' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: sf(72), fontWeight: 900, color: fiColor, fontFamily: 'monospace', lineHeight: 1 }}>{fi.toFixed(1)}</div>
                      <div style={{ fontSize: sf(16), color: fiColor, letterSpacing: 3, fontWeight: 700, marginTop: sf(4) }}>{fiLabel}</div>
                    </div>
                    <div style={{ flex: isPortrait ? undefined : 1, width: isPortrait ? '100%' : undefined }}>
                      <div style={{ display: 'flex', gap: sf(12), marginBottom: sf(16), justifyContent: isPortrait ? 'center' : 'flex-start' }}>
                        <div style={{ background: '#B8FF0018', border: '1px solid #B8FF0030', borderRadius: sf(10), padding: `${sf(14)}px ${sf(24)}px`, textAlign: 'center' }}>
                          <div style={{ fontSize: sf(28), fontWeight: 800, color: '#B8FF00', fontFamily: 'monospace' }}>{wins}</div>
                          <div style={{ fontSize: sf(11), color: '#A0A0B8', letterSpacing: 2 }}>WINS</div>
                        </div>
                        <div style={{ background: '#FF2D7818', border: '1px solid #FF2D7830', borderRadius: sf(10), padding: `${sf(14)}px ${sf(24)}px`, textAlign: 'center' }}>
                          <div style={{ fontSize: sf(28), fontWeight: 800, color: '#FF2D78', fontFamily: 'monospace' }}>{losses}</div>
                          <div style={{ fontSize: sf(11), color: '#A0A0B8', letterSpacing: 2 }}>LOSSES</div>
                        </div>
                        {streak && (
                          <div style={{ background: '#FFB80018', border: '1px solid #FFB80030', borderRadius: sf(10), padding: `${sf(14)}px ${sf(24)}px`, textAlign: 'center' }}>
                            <div style={{ fontSize: sf(28), fontWeight: 800, color: '#FFB800', fontFamily: 'monospace' }}>{streak}</div>
                            <div style={{ fontSize: sf(11), color: '#A0A0B8', letterSpacing: 2 }}>STREAK</div>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: sf(5), justifyContent: isPortrait ? 'center' : 'flex-start' }}>
                        {trend.slice().reverse().map((m, idx) => (
                          <div key={idx} style={{ width: sf(16), height: sf(16), borderRadius: sf(4), background: m.result === 'W' ? '#B8FF00' : m.result === 'L' ? '#FF2D78' : '#60607A' }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <p style={{ color: '#60607A', fontSize: sf(12), textAlign: 'right', fontFamily: 'monospace', margin: 0 }}>@Crickrida &bull; Cricket via Stats</p>
                </div>
              </div>
        )
      }
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <SEO
        title="Studio — Free Cricket Stat Card Maker"
        description={`Turn any ${tournament.shortName} stat into a branded card for X, Instagram, LinkedIn or stories — player stats, match summaries, comparisons and season recaps. Free, no sign-up.`}
        url="/content-studio"
      />
      {/* Template picker */}
      <div>
        <h2 className="text-sm font-heading font-semibold text-text-primary mb-3">Choose Template</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => { setTemplate(t.id); setAiCaption('') }}
              className={`shrink-0 px-5 py-3 rounded-xl border text-sm font-medium transition-all duration-200 ${
                template === t.id
                  ? 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan shadow-lg shadow-accent-cyan/5'
                  : 'border-border-subtle bg-bg-card text-text-secondary hover:text-text-primary hover:border-border-subtle/80'
              }`}
              style={template === t.id ? { borderColor: `${t.color}66`, color: t.color, background: `${t.color}15` } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
        {/* Data input panel */}
        <div className="bg-bg-card border border-border-subtle rounded-xl p-5 space-y-6">
          <h3 className="text-sm font-heading font-semibold text-text-primary">Configure Data</h3>
          {renderDataInputs()}

          {/* Format toggle */}
          <div>
            <label className="block text-xs font-mono text-text-muted mb-2">Format</label>
            <div className="flex gap-2">
              {FORMAT_OPTIONS.map(f => (
                <button key={f.id} onClick={() => setFormat(f.id)}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                    format === f.id
                      ? 'bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan'
                      : 'border-border-subtle text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Export buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 rounded-lg text-sm font-medium hover:bg-accent-cyan/30 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download PNG
            </button>
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-bg-elevated text-text-secondary border border-border-subtle rounded-lg text-sm font-medium hover:text-text-primary hover:border-border-subtle/80 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy to Clipboard
            </button>

            {/* Caption writer */}
            <button
              onClick={handleGenerateCaption}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-500/15 text-purple-400 border border-purple-500/30 rounded-lg text-sm font-medium hover:bg-purple-500/25 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Write Caption
            </button>
          </div>

          {caption && (
            <div className="space-y-2">
              <label htmlFor="studio-caption" className="block text-xs font-mono text-purple-400">Caption (edit before posting)</label>
              <textarea
                id="studio-caption"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={8}
                className="w-full bg-bg-elevated border border-purple-500/20 rounded-lg p-3 text-sm text-text-secondary leading-relaxed focus:outline-none focus:border-purple-500/50"
              />
              <button
                onClick={() => { navigator.clipboard.writeText(caption); setStatus('Caption copied!'); setTimeout(() => setStatus(null), 2000) }}
                className="w-full px-3 py-1.5 text-xs text-purple-400 border border-purple-500/20 rounded-lg hover:bg-purple-500/10 transition-colors"
              >
                Copy Caption
              </button>
            </div>
          )}

          {status && (
            <div className="text-center text-xs font-mono text-accent-cyan py-1">{status}</div>
          )}
        </div>

        {/* Live preview */}
        <div className="space-y-3">
          <h3 className="text-sm font-heading font-semibold text-text-primary">Live Preview</h3>
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-6 overflow-auto">
            <div
              ref={cardRef}
              style={{ transform: 'scale(var(--preview-scale, 0.5))', transformOrigin: 'top left', width: 'fit-content' }}
              className="[--preview-scale:0.45] sm:[--preview-scale:0.5] lg:[--preview-scale:0.55] xl:[--preview-scale:0.6]"
            >
              {renderCard()}
            </div>
          </div>
          <p className="text-xs text-text-muted font-mono">
            Output: {currentDims.width} x {currentDims.height}px &bull; Exported at 2x for retina
          </p>
        </div>
      </div>

    </div>
  )
}
