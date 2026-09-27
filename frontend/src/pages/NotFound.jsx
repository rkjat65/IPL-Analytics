import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import { useTournament } from '../contexts/TournamentContext'

export default function NotFound() {
  const tournament = useTournament()
  const links = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/batting', label: 'Batting records' },
    { to: '/bowling', label: 'Bowling records' },
    { to: '/matches', label: 'Matches' },
    { to: '/content-studio', label: 'Studio' },
  ]
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in">
      <SEO title="Page not found" description="This page doesn't exist on Crickrida." noindex />
      <p className="font-mono text-accent-cyan text-sm tracking-widest mb-3">404</p>
      <h1 className="text-3xl font-heading font-bold text-text-primary mb-2">That delivery went wide</h1>
      <p className="text-text-secondary text-sm max-w-md mb-6">
        We couldn&apos;t find this page. Try one of these instead — every {tournament.shortName} stat on Crickrida is free.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {links.map(l => (
          <Link key={l.to} to={l.to}
            className="px-4 py-2 rounded-lg border border-border-subtle bg-bg-card text-sm text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
