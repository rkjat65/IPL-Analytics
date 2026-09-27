import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTournament } from '../../contexts/TournamentContext'

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/charts',
    label: 'Insights',
    highlight: 'lime',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    to: '/content-studio',
    label: 'Studio',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  {
    to: '/matches',
    label: 'Matches',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    to: '/batting',
    label: 'Batting',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
  {
    to: '/bowling',
    label: 'Bowling',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
  },
  {
    to: '/teams',
    label: 'Teams',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    to: '/h2h',
    label: 'H2H',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    to: '/player-impact',
    label: 'Impact',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    to: '/venues',
    label: 'Venues',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    to: '/seasons',
    label: 'Seasons',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 7 12 7s5-3 7.5-3a2.5 2.5 0 0 1 0 5H18" />
        <path d="M12 7v13" />
        <path d="M8 21h8" />
        <path d="M12 16l-4-4" />
        <path d="M12 16l4-4" />
      </svg>
    ),
  },
  {
    to: '/pulse',
    label: 'Pulse',
    highlight: 'magenta',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    to: '/fantasy',
    label: 'Fantasy',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
  {
    to: '/quiz',
    label: 'Quiz',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.3-2.4 3.8" />
        <path d="M12 17h.01" />
      </svg>
    ),
  },
  {
    to: '/faq',
    label: 'FAQ',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
    ),
  },
]

export default function Sidebar({ open, onToggle }) {
  const navigate = useNavigate()
  const { user, isAuthenticated, logout } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const tournament = useTournament()

  const handleLogout = async () => {
    if (!confirmLogout) {
      setConfirmLogout(true)
      setTimeout(() => setConfirmLogout(false), 3000) // reset after 3s
      return
    }
    await logout()
    navigate('/dashboard')
  }

  const getInitials = (name) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map(w => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={`
          bg-bg-elevated border-r border-border-subtle flex flex-col transition-all duration-200 shrink-0 z-50 h-full
          ${open
            ? 'w-52 fixed inset-y-0 left-0 lg:relative'
            : 'hidden lg:flex w-16'
          }
        `}
      >
        {/* Brand */}
        <div className="h-14 flex items-center px-4 border-b border-border-subtle gap-3">
          <button
            onClick={onToggle}
            className="text-accent-cyan font-heading font-bold text-lg tracking-tight shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 hover:bg-accent-cyan/20 transition-colors"
          >
            C
          </button>
          {open && (
            <div className="overflow-hidden">
              <span className="font-heading font-bold text-text-primary text-sm tracking-wide">
                Crickrida
              </span>
              <p className="text-[10px] text-text-muted font-mono leading-none">
                Cricket via Stats.
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {navItems.map((item) => {
            const highlightColor = item.highlight === 'lime'
              ? { text: 'text-accent-lime', bg: 'bg-accent-lime', hover: 'hover:text-accent-lime' }
              : item.highlight === 'magenta'
                ? { text: 'text-accent-magenta', bg: 'bg-accent-magenta', hover: 'hover:text-accent-magenta' }
                : null

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => { if (window.innerWidth < 1024) onToggle() }}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30'
                      : highlightColor
                        ? `${highlightColor.text} ${highlightColor.hover} border border-transparent hover:bg-white/[0.03]`
                        : 'text-text-secondary hover:text-text-primary border border-transparent hover:bg-white/[0.03]'
                  } ${!open ? 'justify-center px-0' : ''}`
                }
                title={item.to === '/seasons' ? tournament.competitionLabelPlural : item.label}
              >
                {item.icon}
                {open && (
                  <span className="flex items-center gap-1.5">
                    {item.to === '/seasons' ? tournament.competitionLabelPlural : item.label}
                    {highlightColor && (
                      <span className={`w-1.5 h-1.5 rounded-full ${highlightColor.bg} animate-pulse`} />
                    )}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Admin account section — the public site has no sign-in */}
        {isAuthenticated && (
        <div className="border-t border-border-subtle p-2 flex flex-col gap-1">
          {(
            <>
              {/* User avatar + name */}
              <div className={`flex items-center gap-2.5 px-2 py-2 rounded-lg ${open ? '' : 'justify-center'}`}>
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name || 'User'}
                    className="w-8 h-8 rounded-full border border-border-subtle object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-accent-cyan/20 border border-accent-cyan/30 flex items-center justify-center shrink-0">
                    <span className="text-accent-cyan text-[11px] font-bold font-mono">
                      {getInitials(user?.name)}
                    </span>
                  </div>
                )}
                {open && (
                  <div className="overflow-hidden">
                    <p className="text-text-primary text-xs font-medium truncate">
                      {user?.name || 'User'}
                    </p>
                    <p className="text-text-muted text-[10px] font-mono truncate">
                      {user?.email}
                    </p>
                  </div>
                )}
              </div>

              {/* Admin links */}
              {user?.is_admin && (
                <>
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono font-semibold transition-all ${
                      isActive
                        ? 'bg-accent-amber/15 text-accent-amber border border-accent-amber/30'
                        : 'text-text-muted hover:text-accent-amber hover:bg-accent-amber/10 border border-transparent'
                    } ${!open ? 'justify-center px-0' : ''}`
                  }
                  title="Admin Panel"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  {open && <span>Admin</span>}
                </NavLink>
                <NavLink
                  to="/admin/social"
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono font-semibold transition-all ${
                      isActive
                        ? 'bg-accent-amber/15 text-accent-amber border border-accent-amber/30'
                        : 'text-text-muted hover:text-accent-amber hover:bg-accent-amber/10 border border-transparent'
                    } ${!open ? 'justify-center px-0' : ''}`
                  }
                  title="Social Compose"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                    <path d="M22 2 11 13" />
                    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
                  </svg>
                  {open && <span>Social</span>}
                </NavLink>
                </>
              )}

              {/* Settings with logout inside */}
              <div className="relative">
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    settingsOpen
                      ? 'text-text-primary bg-bg-card-hover'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-card-hover'
                  } ${!open ? 'justify-center px-0' : ''}`}
                  title="Settings"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  {open && <span>Settings</span>}
                </button>

                {/* Settings dropdown with sign out */}
                {settingsOpen && (
                  <div className={`${open ? 'mt-1' : 'absolute left-full bottom-0 ml-2'} bg-bg-card border border-border-subtle rounded-lg shadow-xl overflow-hidden min-w-[160px] z-50`}>
                    <button
                      onClick={handleLogout}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                        confirmLogout
                          ? 'bg-accent-magenta/20 text-accent-magenta'
                          : 'text-text-muted hover:text-accent-magenta hover:bg-accent-magenta/10'
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      {confirmLogout ? 'Click again to confirm' : 'Sign out'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        )}

        {/* Collapse toggle — desktop only */}
        <button
          onClick={onToggle}
          className="h-10 hidden lg:flex items-center justify-center border-t border-border-subtle text-text-muted hover:text-text-primary transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-4 h-4 transition-transform duration-200 ${open ? '' : 'rotate-180'}`}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </aside>
    </>
  )
}
