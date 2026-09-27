// Builds a ready-to-post social caption from a Studio card's own data.
// Pure and offline — no AI service involved.

const STAT_LABELS = [
  ['runs', 'Runs'],
  ['wickets', 'Wickets'],
  ['matches', 'Matches'],
  ['innings', 'Innings'],
  ['avg', 'Average'],
  ['average', 'Average'],
  ['sr', 'Strike rate'],
  ['strike_rate', 'Strike rate'],
  ['economy', 'Economy'],
  ['best_figures', 'Best'],
  ['highest_score', 'Highest'],
  ['hundreds', '100s'],
  ['fifties', '50s'],
  ['sixes', 'Sixes'],
  ['fours', 'Fours'],
  ['balls', 'Balls'],
  ['dismissals', 'Dismissals'],
  ['dots', 'Dot balls'],
]

function fmt(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toLocaleString('en-IN') : value.toFixed(2)
  }
  return String(value)
}

export function statLines(stats = {}, limit = 5) {
  const lines = []
  const seen = new Set()
  for (const [key, label] of STAT_LABELS) {
    if (lines.length >= limit || seen.has(label)) continue
    const value = fmt(stats[key])
    if (value === null || value === '0' && ['hundreds', 'fifties'].includes(key)) continue
    lines.push(`${label}: ${value}`)
    seen.add(label)
  }
  return lines
}

function tag(text) {
  return '#' + String(text || '').replace(/[^A-Za-z0-9]/g, '')
}

export function buildCaption({ headline, lines = [], tags = [], tournament = 'IPL', url }) {
  const hashtags = [tag(tournament), ...tags.filter(Boolean).map(tag), '#CricketStats', '#Crickrida']
  const unique = [...new Set(hashtags.filter(t => t.length > 1))]
  return [
    headline,
    lines.length ? '' : null,
    ...lines.map(l => `• ${l}`),
    '',
    url ? `More stats: ${url}` : null,
    unique.join(' '),
  ].filter(l => l !== null).join('\n')
}
