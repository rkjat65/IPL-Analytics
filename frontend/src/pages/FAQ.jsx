import { useMemo, useState } from 'react'
import SEO from '../components/SEO'
import { FAQ_CATEGORIES, FAQ_FLAT } from '../data/iplFaqs'
import { T20WC_FAQ_CATEGORIES, T20WC_FAQ_FLAT } from '../data/t20WorldCupFaqs'
import { useTournament } from '../contexts/TournamentContext'

function FAQItem({ q, a, isOpen, onToggle }) {
  return (
    <div className="border border-border rounded-lg bg-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-start justify-between gap-4 text-left px-4 py-3.5 hover:bg-surface-hover transition-colors"
      >
        <span className="font-heading font-semibold text-text-primary text-sm sm:text-base">{q}</span>
        <span
          className={`flex-shrink-0 mt-0.5 text-accent-brand transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-0 text-sm leading-relaxed text-text-secondary border-t border-border/60">
          <p className="pt-3">{a}</p>
        </div>
      )}
    </div>
  )
}

export default function FAQ() {
  const tournament = useTournament()
  const categories = tournament.isIPL ? FAQ_CATEGORIES : T20WC_FAQ_CATEGORIES
  const flatFaqs = tournament.isIPL ? FAQ_FLAT : T20WC_FAQ_FLAT
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState(null)

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return categories
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.items.length > 0)
  }, [query, categories])

  const totalShown = filteredCategories.reduce((sum, c) => sum + c.items.length, 0)

  // FAQPage structured data — lets AI search engines & Google surface these Q&As directly
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: flatFaqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: a,
      },
    })),
  }

  return (
    <div className="space-y-8">
      <SEO
        title={`${tournament.shortName} FAQ — Frequently Asked Questions`}
        description={`Answers to common questions about ${tournament.name}, its format, data, records, teams, players, and Crickrida analytics.`}
        url="/faq"
        type="website"
        schema={faqSchema}
      />

      <div>
        <h1 className="text-3xl font-heading font-bold text-text-primary">Frequently Asked Questions</h1>
        <p className="text-text-secondary text-sm mt-1">
          {flatFaqs.length} answers to common questions about {tournament.name}, its data, format, records, teams, and players.
        </p>
      </div>

      <div className="relative max-w-md">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions, e.g. &quot;Super Over&quot;, &quot;Orange Cap&quot;, &quot;auction&quot;..."
          className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-accent-brand/40 focus:border-accent-brand"
        />
      </div>

      {query.trim() && (
        <p className="text-xs text-text-secondary -mt-4">
          {totalShown} {totalShown === 1 ? 'result' : 'results'} for &quot;{query.trim()}&quot;
        </p>
      )}

      <div className="space-y-10">
        {filteredCategories.map((cat) => (
          <section key={cat.category} aria-labelledby={`faq-cat-${cat.category}`}>
            <h2
              id={`faq-cat-${cat.category}`}
              className="text-lg font-heading font-bold text-accent-brand mb-3 border-l-4 border-accent-brand pl-3"
            >
              {cat.category}
            </h2>
            <div className="space-y-2">
              {cat.items.map((item) => {
                const key = `${cat.category}::${item.q}`
                return (
                  <FAQItem
                    key={key}
                    q={item.q}
                    a={item.a}
                    isOpen={openKey === key}
                    onToggle={() => setOpenKey(openKey === key ? null : key)}
                  />
                )
              })}
            </div>
          </section>
        ))}

        {filteredCategories.length === 0 && (
          <p className="text-text-secondary text-sm text-center py-12">
            No questions matched &quot;{query.trim()}&quot;. Try a different search term.
          </p>
        )}
      </div>
    </div>
  )
}
