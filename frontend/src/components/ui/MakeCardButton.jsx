import { Link } from 'react-router-dom'

// Opens Studio pre-filled with this page's data (see ContentStudio URL params).
export function studioLink(params) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) search.set(k, v) })
  return `/content-studio?${search.toString()}`
}

export default function MakeCardButton({ params, label = 'Make a card', className = '' }) {
  return (
    <Link
      to={studioLink(params)}
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-accent-magenta/30 bg-accent-magenta/10 text-accent-magenta text-xs font-semibold hover:bg-accent-magenta/20 hover:border-accent-magenta/50 transition-colors shrink-0 ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      {label}
    </Link>
  )
}
