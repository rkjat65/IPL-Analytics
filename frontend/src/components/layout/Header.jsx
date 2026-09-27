import TournamentSwitch from './TournamentSwitch'

export default function Header({ onSidebarToggle, onSearch }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center border-b border-white/[0.08] bg-[#0A0A0F]/80 px-3 shadow-[0_8px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-4 lg:px-6">
      <button
        onClick={onSidebarToggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-white/[0.05] hover:text-text-primary lg:hidden"
        aria-label="Toggle sidebar"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div className="ml-2 min-w-0 lg:ml-0">
        <span className="block truncate font-heading text-sm font-bold text-text-primary sm:text-base">
          Crickrida
        </span>
        <span className="hidden text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted sm:block">
          Cricket Analytics
        </span>
      </div>

      <button
        type="button"
        onClick={onSearch}
        className="ml-3 hidden h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-text-muted transition-colors hover:border-accent-cyan/40 hover:text-text-primary md:flex lg:ml-8 lg:w-64"
        aria-label="Search players, teams, venues (Ctrl+K)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <span className="flex-1 text-left">Search players, teams…</span>
        <kbd className="rounded border border-white/10 px-1.5 font-mono text-[10px]">Ctrl K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted xl:block">
          Tournament
        </span>
        <div className="w-[230px] max-w-[62vw] sm:w-[300px] lg:w-[360px]">
        <TournamentSwitch />
        </div>
      </div>
    </header>
  )
}
