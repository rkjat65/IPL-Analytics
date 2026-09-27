import { useState, useEffect } from 'react'
import { getActiveTournament } from '../lib/api'

const STAT_CONFIGS = {
  'top-scorer': {
    title: 'Top Run Scorer',
    endpoint: '/api/batting/leaderboard?sort_by=runs&limit=5',
    icon: '🏏',
    color: '#00E5FF',
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
    color: '#B8FF00',
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
      className="rounded-xl border border-[#1E1E2A] overflow-hidden"
      style={{ background: '#0A0A0F', maxWidth: 350, fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-[#1E1E2A]"
        style={{ background: `${config.color}08` }}
      >
        <span className="text-lg">{config.icon}</span>
        <span className="font-semibold text-sm" style={{ color: config.color }}>
          {config.title}
        </span>
        <span className="ml-auto text-[10px] text-[#8888A0]">Crickrida</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-5 h-5 border-2 border-[#1E1E2A] border-t-[#00E5FF] rounded-full animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-[#8888A0] text-xs text-center py-4">No data available</p>
        ) : (
          data.map((row, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-1.5 border-b border-[#1E1E2A]/50 last:border-0"
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{
                  background: i === 0 ? `${config.color}20` : '#14141F',
                  color: i === 0 ? config.color : '#8888A0',
                }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#E8E8F0] truncate">{row.name}</p>
                <p className="text-[10px] text-[#8888A0]">{row.sub}</p>
              </div>
              <span className="text-xs font-mono font-semibold" style={{ color: config.color }}>
                {row.value}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#1E1E2A] flex items-center justify-between">
        <a
          href={typeof window !== 'undefined' ? window.location.origin : '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[#8888A0] hover:text-[#00E5FF] transition-colors"
        >
          Powered by Crickrida
        </a>
        <button
          onClick={() => setShowEmbed(!showEmbed)}
          className="text-[10px] font-medium px-2 py-1 rounded-md transition-colors"
          style={{
            background: showEmbed ? `${config.color}20` : '#14141F',
            color: showEmbed ? config.color : '#8888A0',
            border: `1px solid ${showEmbed ? config.color + '40' : '#1E1E2A'}`,
          }}
        >
          {showEmbed ? 'Hide Code' : 'Get Embed Code'}
        </button>
      </div>

      {/* Embed code panel */}
      {showEmbed && (
        <div className="px-4 py-3 border-t border-[#1E1E2A] bg-[#0D0D14]">
          <p className="text-[10px] text-[#8888A0] mb-2">Copy and paste this code into your site:</p>
          <div className="relative">
            <pre className="text-[10px] text-[#B8FF00] bg-[#0A0A0F] rounded-md p-2 overflow-x-auto border border-[#1E1E2A] whitespace-pre-wrap break-all">
              {embedCode}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(embedCode).catch(() => {})
              }}
              className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded bg-[#14141F] text-[#8888A0] hover:text-[#00E5FF] border border-[#1E1E2A] transition-colors"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
