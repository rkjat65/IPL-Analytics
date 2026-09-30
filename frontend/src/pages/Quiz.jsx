import { useCallback, useEffect, useState } from 'react'
import { appUrl } from '../lib/site'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import PlayerAvatar from '../components/ui/PlayerAvatar'
import { getQuizPlayer } from '../lib/api'
import { useTournament } from '../contexts/TournamentContext'

const LEVELS = [
  { id: 'easy', label: 'Easy', hint: 'Regulars (60+ matches)' },
  { id: 'medium', label: 'Medium', hint: '30+ matches' },
  { id: 'hard', label: 'Hard', hint: 'Deep cuts (12+ matches)' },
]

function readBest(key) {
  try { return Number(localStorage.getItem(key)) || 0 } catch { return 0 }
}
function writeBest(key, value) {
  try { localStorage.setItem(key, String(value)) } catch { /* private mode */ }
}

export default function Quiz() {
  const tournament = useTournament()
  const bestKey = `crickrida-quiz-best-${tournament.tournament}`
  const [level, setLevel] = useState('medium')
  const [round, setRound] = useState(null)
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState(null)
  const [showHint, setShowHint] = useState(false)
  const [streak, setStreak] = useState(0)
  const [best, setBest] = useState(() => readBest(bestKey))
  const [copied, setCopied] = useState(false)

  const next = useCallback(() => {
    setLoading(true); setPicked(null); setShowHint(false)
    // A fresh seed per question: a new player every time, and a unique URL so
    // no cache can hand back the previous question.
    getQuizPlayer(level, Math.floor(Math.random() * 1e9))
      .then(setRound)
      .catch(() => setRound(null))
      .finally(() => setLoading(false))
  }, [level])

  useEffect(() => { next() }, [next])
  useEffect(() => { setBest(readBest(bestKey)); setStreak(0) }, [bestKey])

  const choose = (name) => {
    if (picked || !round) return
    setPicked(name)
    if (name === round.answer) {
      const s = streak + 1
      setStreak(s)
      if (s > best) { setBest(s); writeBest(bestKey, s) }
    } else {
      setStreak(0)
    }
  }

  const share = async () => {
    const text = `I'm on a ${Math.max(streak, best)}-player streak in the Crickrida ${tournament.shortName} "Guess the player" quiz 🏏 Can you beat it? ${appUrl('/quiz')}`
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  const clues = round?.clues.filter(c => !c.hint || showHint || picked) || []
  const hint = round?.clues.find(c => c.hint)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SEO
        title={`Guess the ${tournament.shortName} Player — Cricket Stats Quiz`}
        description={`Can you name the ${tournament.shortName} player from their career stats? Play the free quiz, keep your streak and share your score.`}
        url="/quiz"
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-text-primary">Guess the Player</h1>
          <p className="mt-1 text-sm text-text-secondary">Name the {tournament.shortName} player from their career numbers.</p>
        </div>
        <div className="flex gap-3 font-mono text-xs">
          <div className="card px-3 py-2 text-center"><div className="text-text-muted">STREAK</div><div className="font-heading text-xl font-bold text-accent-teal">{streak}</div></div>
          <div className="card px-3 py-2 text-center"><div className="text-text-muted">BEST</div><div className="font-heading text-xl font-bold text-accent-amber">{best}</div></div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Difficulty">
        {LEVELS.map(l => (
          <button key={l.id} role="radio" aria-checked={level === l.id} onClick={() => { setLevel(l.id); setStreak(0) }} title={l.hint}
            className={`rounded-lg border px-4 py-2 text-sm transition-colors ${level === l.id ? 'border-accent-brand/40 bg-accent-brand/10 text-accent-brand' : 'border-border-subtle text-text-secondary hover:text-text-primary'}`}>
            {l.label}
          </button>
        ))}
      </div>

      {loading && <div className="card h-72 animate-pulse" aria-busy="true" />}

      {!loading && round && (
        <div className="card space-y-5 animate-pop" key={round.answer}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {clues.map(c => (
              <div key={c.label} className={`rounded-lg border px-3 py-2.5 ${c.hint ? 'col-span-2 border-accent-amber/30 bg-accent-amber/5 sm:col-span-3' : 'border-border-subtle bg-bg-elevated/60'}`}>
                <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{c.label}</div>
                <div className="font-heading text-lg font-bold text-text-primary">{c.value}</div>
              </div>
            ))}
          </div>
          {hint && !showHint && !picked && (
            <button onClick={() => setShowHint(true)} className="text-xs font-mono text-accent-amber hover:underline">Need a hint? Show teams</button>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {round.options.map(name => {
              const isAnswer = name === round.answer
              const state = !picked ? 'idle' : isAnswer ? 'right' : name === picked ? 'wrong' : 'dim'
              const styles = {
                idle: 'border-border-subtle bg-bg-elevated hover:border-accent-brand/50 hover:text-text-primary',
                right: 'border-success/60 bg-success/15 text-text-primary',
                wrong: 'border-danger/60 bg-danger/15 text-text-primary',
                dim: 'border-border-subtle opacity-50',
              }
              return (
                <button key={name} onClick={() => choose(name)} disabled={!!picked}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold text-text-secondary transition-all ${styles[state]}`}>
                  {picked && <PlayerAvatar name={name} size={32} showBorder={false} />}
                  <span className="flex-1">{name}</span>
                  {state === 'right' && <span aria-label="correct">✓</span>}
                  {state === 'wrong' && <span aria-label="wrong">✗</span>}
                </button>
              )
            })}
          </div>

          {picked && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
              <p className="flex-1 text-sm text-text-secondary">
                {picked === round.answer ? 'Nailed it!' : <>It was <strong className="text-text-primary">{round.answer}</strong>.</>}{' '}
                <Link to={`/batting/${encodeURIComponent(round.answer)}`} className="text-accent-brand hover:underline">See their profile</Link>
              </p>
              <button onClick={share} className="rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:text-text-primary">
                {copied ? 'Copied!' : 'Share score'}
              </button>
              <button onClick={next} className="rounded-lg bg-accent-brand px-4 py-2 text-sm font-bold text-black hover:brightness-110">
                Next player →
              </button>
            </div>
          )}
        </div>
      )}
      {!loading && !round && <div className="card text-sm text-danger">Couldn&apos;t load a question. Try again.</div>}
    </div>
  )
}
