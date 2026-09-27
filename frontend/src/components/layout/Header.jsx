import TournamentSwitch from './TournamentSwitch'

export default function Header({ onSidebarToggle }) {
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
