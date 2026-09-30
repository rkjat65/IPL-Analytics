import { useState, useEffect } from 'react'
import { getActiveTournament } from '../lib/api'

const STAT_CONFIGS = {
  'top-scorer': {
    title: 'Top Run Scorer',
    endpoint: '/api/batting/leaderboard?sort_by=runs&limit=5',
    icon: '🏏',
    color: '#C3F23B',
    mapRow: (r) => ({ name: r.player, value: `${r.runs} runs`, sub: `SR ${r.strike_rate?.toFixed(1) || '-'}` }),
  },
  'most-wickets': {
    title: 'Most Wickets',
    endpoint: '/api/bowling/leaderboard?sort_by=wickets&limit=5',
    icon: '🎯',
    color: '#FF2D78',
    mapRow: (r) => ({ name: r.player, value: `${r.wickets} wkts`, sub: `Econ ${r.economy?.toFixed(2) || '-'}` }),
  },
  'team-standings': {
    title: 'Team Standings',
    endpoint: '/api/teams/most-wins',
    icon: '🏆',
    color: '#2DD4BF',
    mapRow: (r) => ({ name: r.team, value: `${r.wins} wins`, sub: `${r.matches} matches` }),
  },
}

export default function EmbedWidget({ statType = 'top-scorer' }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEmbed, setShowEmbed] = useState(false)

  const config = STAT_CONFIGS[statType] || STAT_CONFIGS['top-scorer']

  useEffect(() => {
    setLoading(true)
    const separator = config.endpoint.includes('?') ? '&' : '?'
    fetch(`${config.endpoint}${separator}tournament=${getActiveTournament()}`)
      .then((r) => r.json())
      .then((d) => {
        const rows = Array.isArray(d) ? d : d.data || d.results || d.leaderboard || []
        setData(rows.slice(0, 5).map(config.mapRow))
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [statType])

  const embedUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/embed?stat=${statType}`
    : ''

  const embedCode = `<iframe src="${embedUrl}&tournament=${getActiveTournament()}" width="350" height="320" style="border:none;border-radius:12px;" title="Crickrida ${config.title}"></iframe>`

  return (
    <div
      className="rounded-xl border border-[#22302B] overflow-hidden"
      style={{ background: '#0C1210', maxWidth: 350, fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-[#22302B]"
        style={{ background: `${config.color}08` }}
      >
        <span className="text-lg">{config.icon}</span>
        <span className="font-semibold text-sm" style={{ color: config.color }}>
          {config.title}
        </span>
        <span className="ml-auto text-[10px] text-[#9AA69F]">Crickrida</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-5 h-5 border-2 border-[#22302B] border-t-[#C3F23B] rounded-full animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-[#9AA69F] text-xs text-center py-4">No data available</p>
        ) : (
          data.map((row, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-1.5 border-b border-[#22302B]/50 last:border-0"
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{
                  background: i === 0 ? `${config.color}20` : '#14141F',
                  color: i === 0 ? config.color : '#9AA69F',
                }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#E8E8F0] truncate">{row.name}</p>
                <p className="text-[10px] text-[#9AA69F]">{row.sub}</p>
              </div>
              <span className="text-xs font-mono font-semibold" style={{ color: config.color }}>
                {row.value}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#22302B] flex items-center justify-between">
        <a
          href={typeof window !== 'undefined' ? window.location.origin : '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[#9AA69F] hover:text-[#C3F23B] transition-colors"
        >
          Powered by Crickrida
        </a>
        <button
          onClick={() => setShowEmbed(!showEmbed)}
          className="text-[10px] font-medium px-2 py-1 rounded-md transition-colors"
          style={{
            background: showEmbed ? `${config.color}20` : '#14141F',
            color: showEmbed ? config.color : '#9AA69F',
            border: `1px solid ${showEmbed ? config.color + '40' : '#22302B'}`,
          }}
        >
          {showEmbed ? 'Hide Code' : 'Get Embed Code'}
        </button>
      </div>

      {/* Embed code panel */}
      {showEmbed && (
        <div className="px-4 py-3 border-t border-[#22302B] bg-[#0D0D14]">
          <p className="text-[10px] text-[#9AA69F] mb-2">Copy and paste this code into your site:</p>
          <div className="relative">
            <pre className="text-[10px] text-[#2DD4BF] bg-[#0C1210] rounded-md p-2 overflow-x-auto border border-[#22302B] whitespace-pre-wrap break-all">
              {embedCode}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(embedCode).catch(() => {})
              }}
              className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded bg-[#14141F] text-[#9AA69F] hover:text-[#C3F23B] border border-[#22302B] transition-colors"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
