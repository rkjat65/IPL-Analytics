import { NavLink } from 'react-router-dom'

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
    {d}
  </svg>
)

const TABS = [
  { to: '/dashboard', label: 'Home', icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> },
  { to: '/matches', label: 'Matches', icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></> },
  { to: '/batting', label: 'Players', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></> },
  { to: '/content-studio', label: 'Studio', icon: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></> },
]

// Thumb-friendly navigation on phones; the sidebar stays for everything else.
export default function MobileTabBar({ onSearch }) {
  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors'
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/[0.08] bg-[#0A0A0F]/90 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(t => (
        <NavLink key={t.to} to={t.to}
          className={({ isActive }) => `${item} ${isActive ? 'text-accent-cyan' : 'text-text-muted hover:text-text-primary'}`}>
          <Icon d={t.icon} />
          {t.label}
        </NavLink>
      ))}
      <button type="button" onClick={onSearch} className={`${item} text-text-muted hover:text-text-primary`}>
        <Icon d={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>} />
        Search
      </button>
    </nav>
  )
}
