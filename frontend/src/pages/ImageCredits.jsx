import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import Loading from '../components/ui/Loading'
import { useFetch } from '../hooks/useFetch'
import { getPlayerImageCredits } from '../lib/api'

export default function ImageCredits() {
  const [query, setQuery] = useState('')
  const { data, loading, error } = useFetch(getPlayerImageCredits, [])
  const images = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return data?.images || []
    return (data?.images || []).filter((item) =>
      `${item.player_name} ${item.artist} ${item.license}`.toLowerCase().includes(term)
    )
  }, [data, query])

  return (
    <div className="max-w-5xl mx-auto space-y-7">
      <SEO
        title="Player Image Credits"
        description="Source, creator, licence, and modification credits for reusable player photographs shown by Crickrida."
        url="/image-credits"
      />
      <div>
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-accent-brand">Open image provenance</p>
        <h1 className="mt-2 text-3xl font-heading font-bold text-text-primary">Player Image Credits</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
          These player photographs come from Wikimedia Commons. Every entry records its creator,
          source, licence, and the square crop applied for display on Crickrida.
        </p>
      </div>

      <label className="block max-w-md">
        <span className="sr-only">Search image credits</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search player, creator, or licence"
          className="w-full rounded-xl border border-border-subtle bg-bg-card px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-brand/60"
        />
      </label>

      {loading && <Loading message="Loading image credits..." />}
      {error && <p className="text-sm text-danger">Unable to load image credits.</p>}
      {!loading && !error && (
        <div className="grid gap-4 md:grid-cols-2">
          {images.map((item) => (
            <article id={item.player_id} key={item.player_id} className="rounded-xl border border-border-subtle bg-bg-card p-4">
              <div className="flex items-start gap-3">
                <img
                  src={`/api/players/${encodeURIComponent(item.player_name)}/image?w=96`}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-full border border-border-subtle object-cover"
                />
                <div className="min-w-0">
                  <Link to={`/players/${encodeURIComponent(item.player_name)}`} className="font-heading font-semibold text-text-primary hover:text-accent-brand">
                    {item.player_name}
                  </Link>
                  <p className="mt-1 text-xs text-text-secondary">Photo by {item.artist || 'Wikimedia Commons contributor'}</p>
                  <a href={item.license_url || item.commons_page} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-accent-brand hover:underline">
                    {item.license || 'View licence'}
                  </a>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-text-muted">Modified: {item.modification}</p>
              <a href={item.commons_page} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-text-secondary hover:text-accent-brand hover:underline">
                Original file and full metadata ↗
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
