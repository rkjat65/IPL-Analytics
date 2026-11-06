import { useTournament } from '../../contexts/TournamentContext'

export default function TournamentSwitch({ compact = false }) {
  const { tournament, selectTournament } = useTournament()

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => selectTournament(tournament === 'ipl' ? 't20wc' : 'ipl')}
        className="mx-auto my-2 flex h-9 w-9 items-center justify-center rounded-lg border border-accent-cyan/25 bg-accent-cyan/10 text-[10px] font-bold text-accent-cyan hover:bg-accent-cyan/20"
        title={tournament === 'ipl' ? 'Switch to T20 World Cup' : 'Switch to IPL'}
        aria-label={tournament === 'ipl' ? 'Switch to T20 World Cup' : 'Switch to IPL'}
      >
        {tournament === 'ipl' ? 'IPL' : 'WC'}
      </button>
    )
  }

  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-xl border border-accent-cyan/25 bg-black/40 p-1 shadow-[0_0_24px_rgba(0,229,255,0.08),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl"
      aria-label="Tournament selector"
    >
      {[
        ['ipl', 'IPL'],
        ['t20wc', 'T20 World Cup'],
      ].map(([slug, label]) => (
        <button
          key={slug}
          type="button"
          onClick={() => selectTournament(slug)}
          className={`relative rounded-lg px-2 py-2 text-[11px] font-bold transition-all duration-200 sm:text-xs ${
            tournament === slug
              ? 'bg-gradient-to-r from-accent-cyan to-[#45F0FF] text-black shadow-[0_0_18px_rgba(0,229,255,0.28)]'
              : 'text-text-muted hover:bg-white/[0.06] hover:text-text-primary'
          }`}
          aria-pressed={tournament === slug}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
