import { useState, useRef, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell
} from 'recharts'
import SEO from '../components/SEO'
import AIImageModal from '../components/ui/AIImageModal'
import { getAiStatus, askCricketQuery, getAiSuggestions, generateCommentary } from '../lib/api'
import { exportAsImage, downloadImage } from '../utils/exportCard'
import { CARD_DIMENSIONS } from '../components/cards/cardStyles'
import QueryResultCard from '../components/cards/QueryResultCard'
import { useAuth } from '../contexts/AuthContext'
import { useTournament } from '../contexts/TournamentContext'

const CHAT_HISTORY_KEY = 'rkjat65_chat_history'

function getChatHistory(userEmail) {
  try {
    const all = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '{}')
    return all[userEmail] || []
  } catch { return [] }
}

function saveChatHistory(userEmail, messages) {
  try {
    const all = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '{}')
    // Keep last 50 messages per user to avoid localStorage bloat
    all[userEmail] = messages.slice(-50)
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(all))
  } catch { /* localStorage full or unavailable */ }
}

const COLORS = ['#00E5FF', '#FF2D78', '#B8FF00', '#FFB800', '#A78BFA', '#34D399', '#F87171', '#60A5FA', '#FBBF24', '#E879F9']

function StatCard({ data }) {
  if (!data || data.length === 0) return null
  const row = data[0]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Object.entries(row).map(([key, val]) => (
        <div key={key} className="bg-bg-card border border-border-subtle rounded-lg p-4">
          <div className="text-[11px] text-text-muted font-mono uppercase tracking-wider mb-1">{key}</div>
          <div className="text-2xl font-mono font-bold text-text-primary">
            {typeof val === 'number' ? val.toLocaleString('en-IN') : String(val)}
          </div>
        </div>
      ))}
    </div>
  )
}

function DataTable({ data }) {
  if (!data || data.length === 0) return <p className="text-text-muted text-sm">No results</p>
  const cols = Object.keys(data[0])
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-border-subtle">
            {cols.map(c => (
              <th key={c} className="text-left py-2 px-3 text-text-muted text-xs uppercase tracking-wider">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border-subtle/50 hover:bg-bg-card-hover transition-colors">
              {cols.map(c => (
                <td key={c} className="py-2 px-3 text-text-primary">
                  {typeof row[c] === 'number' ? row[c].toLocaleString('en-IN') : String(row[c] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AutoChart({ data, chartType, chartConfig }) {
  if (!data || data.length === 0) return null

  if (chartType === 'stat') {
    return <StatCard data={data} />
  }

  if (chartType === 'bar') {
    const { xKey, yKeys = [] } = chartConfig
    return (
      <ResponsiveContainer width="100%" height={Math.max(300, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 40, top: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
          <XAxis type="number" tick={{ fill: '#8888A0', fontSize: 11, fontFamily: 'monospace' }} />
          <YAxis dataKey={xKey} type="category" width={140} tick={{ fill: '#B0B0C0', fontSize: 11, fontFamily: 'monospace' }} />
          <Tooltip
            contentStyle={{ background: '#111118', border: '1px solid #2A2A3C', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px' }}
            labelStyle={{ color: '#E0E0F0' }}
          />
          {yKeys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]}
              label={{ position: 'right', fill: COLORS[i % COLORS.length], fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}
            >
              {data.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chartType === 'line') {
    const { xKey, yKeys = [] } = chartConfig
    return (
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
          <XAxis dataKey={xKey} tick={{ fill: '#8888A0', fontSize: 11, fontFamily: 'monospace' }} />
          <YAxis tick={{ fill: '#8888A0', fontSize: 11, fontFamily: 'monospace' }} />
          <Tooltip
            contentStyle={{ background: '#111118', border: '1px solid #2A2A3C', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px' }}
          />
          <Legend wrapperStyle={{ fontSize: '12px', fontFamily: 'monospace' }} />
          {yKeys.map((k, i) => (
            <Line key={k} dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  // Fallback: table
  return <DataTable data={data} />
}

const IMAGE_FORMATS = [
  { id: 'twitter', label: 'Twitter', dims: CARD_DIMENSIONS.twitter },
  { id: 'instagram', label: 'Instagram', dims: CARD_DIMENSIONS.instagram },
  { id: 'linkedin', label: 'LinkedIn', dims: CARD_DIMENSIONS.linkedin },
]

function InlineImageCreator({ question, data, insight, onClose }) {
  const cardRef = useRef(null)
  const [imageFormat, setImageFormat] = useState('twitter')
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState(null)

  const currentDims = IMAGE_FORMATS.find(f => f.id === imageFormat)?.dims || CARD_DIMENSIONS.twitter

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return
    setExporting(true)
    setStatus('Exporting...')
    try {
      const dataUrl = await exportAsImage(cardRef.current, 'rkjat65-query', 'png')
      downloadImage(dataUrl, 'rkjat65-query.png')
      setStatus('Downloaded!')
      setTimeout(() => setStatus(null), 2000)
    } catch (err) {
      console.error(err)
      setStatus('Export failed')
      setTimeout(() => setStatus(null), 2000)
    } finally {
      setExporting(false)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    if (!cardRef.current) return
    setExporting(true)
    setStatus('Copying...')
    try {
      const dataUrl = await exportAsImage(cardRef.current, 'rkjat65-query', 'png')
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setStatus('Copied!')
      setTimeout(() => setStatus(null), 2000)
    } catch (err) {
      console.error(err)
      setStatus('Copy failed')
      setTimeout(() => setStatus(null), 2000)
    } finally {
      setExporting(false)
    }
  }, [])

  return (
    <div className="bg-bg-card border border-accent-cyan/30 rounded-xl p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">📸</span>
          <span className="text-xs font-mono text-accent-cyan uppercase tracking-wider">Create Shareable Image</span>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg transition-colors">&times;</button>
      </div>

      {/* Format picker */}
      <div className="flex gap-2">
        {IMAGE_FORMATS.map(f => (
          <button
            key={f.id}
            onClick={() => setImageFormat(f.id)}
            className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors font-mono ${
              imageFormat === f.id
                ? 'bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan'
                : 'border-border-subtle text-text-secondary hover:text-text-primary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="bg-bg-elevated rounded-lg p-3 overflow-auto">
        <div
          ref={cardRef}
          style={{ transform: 'scale(0.4)', transformOrigin: 'top left', width: 'fit-content' }}
        >
          <QueryResultCard
            question={question}
            data={data}
            insight={insight}
            dimensions={currentDims}
          />
        </div>
      </div>
      <p className="text-[10px] text-text-muted font-mono">
        Output: {currentDims.width} x {currentDims.height}px
      </p>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          disabled={exporting}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-accent-cyan/20 text-accent-cyan
            border border-accent-cyan/30 rounded-lg text-xs font-mono hover:bg-accent-cyan/30 transition-colors
            disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PNG
        </button>
        <button
          onClick={handleCopy}
          disabled={exporting}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-bg-elevated text-text-secondary
            border border-border-subtle rounded-lg text-xs font-mono hover:text-text-primary transition-colors
            disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy Image
        </button>
      </div>

      {status && (
        <div className="text-center text-xs font-mono text-accent-cyan py-1">{status}</div>
      )}
    </div>
  )
}

export default function AskCricket() {
  const { user, token } = useAuth()
  const tournament = useTournament()
  const userEmail = user?.email || 'anonymous'
  const historyOwner = `${userEmail}:${tournament.tournament}`
  const [messages, setMessages] = useState(() => getChatHistory(historyOwner))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiStatus, setAiStatus] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [imageCreatorIdx, setImageCreatorIdx] = useState(null)
  const [aiImageModal, setAiImageModal] = useState(null)
  const chatEndRef = useRef(null)

  useEffect(() => {
    getAiStatus().then(setAiStatus).catch(() => setAiStatus({ available: false }))
    getAiSuggestions().then(d => setSuggestions(d.suggestions || [])).catch(() => {})
  }, [tournament.tournament])

  // Load history when user changes (login/logout)
  useEffect(() => {
    setMessages(getChatHistory(historyOwner))
  }, [historyOwner])

  // Save history whenever messages change
  useEffect(() => {
    if (messages.length > 0) saveChatHistory(historyOwner, messages)
  }, [messages, historyOwner])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (question) => {
    const q = (question || input).trim()
    if (!q || loading) return

    setInput('')
    setMessages(prev => [...prev, { type: 'user', text: q }])
    setLoading(true)

    try {
      const result = await askCricketQuery(q, null, token)
      setMessages(prev => [...prev, {
        type: 'ai',
        question: result.question,
        sql: result.sql,
        data: result.data,
        insight: result.insight,
        chartType: result.chart_type,
        chartConfig: result.chart_config,
      }])
    } catch (err) {
      const msg = err.message || 'Something went wrong. Try rephrasing your question.'
      setMessages(prev => [...prev, { type: 'error', text: msg }])
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateCommentary = async (data, insight) => {
    try {
      const result = await generateCommentary({
        stats: data.length > 0 ? data[0] : {},
        context: insight || `${tournament.name} cricket statistics`
      }, token)
      setMessages(prev => [...prev, {
        type: 'commentary',
        commentaries: result.commentaries
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        type: 'error',
        text: 'Could not generate commentary: ' + (err.message || 'Unknown error')
      }])
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  if (aiStatus && !aiStatus.available) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-bg-card border border-border-subtle rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="text-xl font-heading font-bold text-text-primary mb-2">AI Not Configured</h2>
          <p className="text-text-secondary mb-4">
            To use Ask Cricket, add your Gemini API key to <code className="text-accent-cyan bg-bg-elevated px-2 py-0.5 rounded text-sm font-mono">backend/.env</code>
          </p>
          <div className="bg-bg-elevated rounded-lg p-4 text-left font-mono text-sm text-text-muted">
            GEMINI_API_KEY=your_key_here
          </div>
          <p className="text-text-muted text-sm mt-4">
            Get a free API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-accent-cyan hover:underline">Google AI Studio</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <SEO
        title={`Ask Cricket — AI-Powered ${tournament.shortName} Q&A`}
        description={`Ask natural-language questions about ${tournament.name} players, teams, records and matches, with answers scoped to the selected tournament database.`}
        url="/ask"
      />
      {/* Header */}
      <div className="p-4 border-b border-border-subtle bg-bg-elevated/50">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-cyan to-accent-magenta flex items-center justify-center text-white font-bold text-lg">
            🏏
          </div>
          <div>
            <h1 className="font-heading font-bold text-text-primary text-lg">Ask Cricket</h1>
            <p className="text-xs text-text-muted font-mono">Ask any {tournament.shortName} question in plain English • Powered by Gemini AI</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); saveChatHistory(userEmail, []) }}
                className="text-[10px] font-mono text-text-muted hover:text-red-400 bg-bg-card px-2 py-1 rounded-full transition-colors"
                title="Clear chat history"
              >
                ✕ Clear
              </button>
            )}
            <span className="text-[10px] font-mono text-accent-lime bg-accent-lime/10 px-2 py-1 rounded-full">
              ● AI READY
            </span>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Welcome message if empty */}
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🏏</div>
              <h2 className="text-2xl font-heading font-bold text-text-primary mb-2">
                What do you want to know about {tournament.shortName}?
              </h2>
              <p className="text-text-secondary mb-8">
                Ask any question in plain English. I&apos;ll query the database and visualize the answer.
              </p>

              {/* Suggestion chips */}
              <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
                {suggestions.slice(0, 8).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSubmit(s)}
                    className="text-sm px-4 py-2 rounded-full border border-border-subtle text-text-secondary
                      hover:border-accent-cyan hover:text-accent-cyan hover:bg-accent-cyan/5 transition-all font-mono"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, idx) => (
            <div key={idx} className="animate-fade-in">
              {msg.type === 'user' && (
                <div className="flex justify-end mb-2">
                  <div className="bg-accent-cyan/10 border border-accent-cyan/30 rounded-2xl rounded-tr-sm px-4 py-3 max-w-lg">
                    <p className="text-text-primary text-sm">{msg.text}</p>
                  </div>
                </div>
              )}

              {msg.type === 'ai' && (
                <div className="space-y-3">
                  {/* Insight */}
                  <div className="bg-bg-card border border-border-subtle rounded-2xl rounded-tl-sm p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-accent-magenta/20 flex items-center justify-center text-sm shrink-0">🤖</div>
                      <p className="text-text-primary text-sm leading-relaxed">{msg.insight}</p>
                    </div>

                    {/* Chart */}
                    <div className="bg-bg-elevated rounded-xl p-4 mb-3">
                      <AutoChart data={msg.data} chartType={msg.chartType} chartConfig={msg.chartConfig} />
                    </div>

                    {/* SQL toggle */}
                    <details className="group">
                      <summary className="text-xs text-text-muted font-mono cursor-pointer hover:text-accent-cyan transition-colors">
                        View SQL Query ▸
                      </summary>
                      <pre className="mt-2 bg-bg-elevated rounded-lg p-3 text-xs font-mono text-accent-cyan/80 overflow-x-auto whitespace-pre-wrap">
                        {msg.sql}
                      </pre>
                    </details>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-border-subtle">
                      <button
                        onClick={() => handleGenerateCommentary(msg.data, msg.insight)}
                        className="text-xs font-mono px-3 py-1.5 rounded-lg bg-accent-magenta/10 text-accent-magenta
                          hover:bg-accent-magenta/20 transition-colors"
                      >
                        ✨ Generate Tweet
                      </button>
                      <button
                        onClick={() => setImageCreatorIdx(imageCreatorIdx === idx ? null : idx)}
                        className={`text-xs font-mono px-3 py-1.5 rounded-lg transition-colors ${
                          imageCreatorIdx === idx
                            ? 'bg-accent-cyan/20 text-accent-cyan'
                            : 'bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20'
                        }`}
                      >
                        📸 Create Image
                      </button>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(msg.data, null, 2))}
                        className="text-xs font-mono px-3 py-1.5 rounded-lg bg-bg-elevated text-text-muted
                          hover:text-text-primary transition-colors"
                      >
                        📋 Copy Data
                      </button>
                      <button
                        onClick={() => setAiImageModal({
                          question: msg.question || msg.insight || '',
                          insight: msg.insight || '',
                          data: msg.data || []
                        })}
                        className="text-xs font-mono px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-magenta/10 to-accent-cyan/10
                          text-accent-lime border border-accent-lime/30 hover:from-accent-magenta/20 hover:to-accent-cyan/20 transition-all"
                      >
                        🎨 AI Infographic
                      </button>
                    </div>
                  </div>

                  {/* Inline image creator */}
                  {imageCreatorIdx === idx && (
                    <InlineImageCreator
                      question={msg.question || ''}
                      data={msg.data || []}
                      insight={msg.insight || ''}
                      onClose={() => setImageCreatorIdx(null)}
                    />
                  )}
                </div>
              )}

              {msg.type === 'commentary' && (
                <div className="bg-bg-card border border-accent-magenta/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">✨</span>
                    <span className="text-xs font-mono text-accent-magenta uppercase tracking-wider">Tweet Options</span>
                  </div>
                  {msg.commentaries.map((c, i) => (
                    <div key={i} className="bg-bg-elevated rounded-xl p-3 group">
                      <p className="text-sm text-text-primary mb-2">{c}</p>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyToClipboard(c)}
                          className="text-[10px] font-mono px-2 py-1 rounded bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20"
                        >
                          Copy
                        </button>
                        <span className="text-[10px] text-text-muted font-mono">
                          {c.length}/280
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {msg.type === 'ai_image' && (
                <div className="bg-bg-card border border-accent-lime/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🎨</span>
                    <span className="text-xs font-mono text-accent-lime uppercase tracking-wider">AI Generated Infographic</span>
                  </div>
                  {msg.question && (
                    <p className="text-xs text-text-muted font-mono truncate">{"💬 \""}{msg.question}{"\""}</p>
                  )}
                  <div className="rounded-xl overflow-hidden border border-border-subtle bg-bg-elevated">
                    <img src={msg.image} alt="AI Generated" className="w-full h-auto max-w-lg" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const link = document.createElement('a')
                        link.download = `rkjat65-ai-${Date.now()}.png`
                        link.href = msg.image
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                      }}
                      className="text-xs font-mono px-3 py-1.5 rounded-lg bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20 transition-colors"
                    >
                      Download
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(msg.image)
                          const blob = await res.blob()
                          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
                        } catch {}
                      }}
                      className="text-xs font-mono px-3 py-1.5 rounded-lg bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
                    >
                      Copy Image
                    </button>
                  </div>
                </div>
              )}

              {msg.type === 'error' && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl rounded-tl-sm px-4 py-3">
                  <p className="text-red-400 text-sm">⚠️ {msg.text}</p>
                </div>
              )}
            </div>
          ))}

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-3 text-text-muted">
              <div className="w-7 h-7 rounded-lg bg-accent-cyan/20 flex items-center justify-center">
                <div className="w-3 h-3 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-sm font-mono animate-pulse">Analyzing your question...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-border-subtle bg-bg-elevated/50">
        <div className="max-w-4xl mx-auto">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask anything about ${tournament.shortName}... e.g. 'Top 5 six hitters in 2024'`}
              className="flex-1 bg-bg-card border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary
                placeholder:text-text-muted font-mono focus:outline-none focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan/30
                transition-all"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-6 py-3 rounded-xl bg-accent-cyan text-bg-primary font-heading font-bold text-sm
                hover:bg-accent-cyan/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
            >
              Ask →
            </button>
          </form>
          <div className="flex items-center justify-center gap-3 mt-2">
            <p className="text-[10px] text-text-muted font-mono text-center">
              AI can make mistakes. Verify important data. • Powered by Gemini 3.1 Flash
            </p>
          </div>
        </div>
      </div>

      {/* AI Image Generation Modal */}
      {aiImageModal && (
        <AIImageModal
          question={aiImageModal.question}
          insight={aiImageModal.insight}
          data={aiImageModal.data}
          onClose={() => setAiImageModal(null)}
          onImageGenerated={(imageDataUrl) => {
            setMessages(prev => [...prev, {
              type: 'ai_image',
              image: imageDataUrl,
              question: aiImageModal.question,
            }])
          }}
        />
      )}

    </div>
  )
}
