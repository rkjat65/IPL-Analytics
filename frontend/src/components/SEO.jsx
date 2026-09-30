import { Helmet } from 'react-helmet-async'
import { useTournament } from '../contexts/TournamentContext'
import { SITE_URL, PREFIXES, asset } from '../lib/site'

export { SITE_URL }
const DEFAULT_OG_IMAGE = asset('og-default.png')
const SITE_NAME = 'Crickrida'
const TWITTER_HANDLE = '@Rkjat65'

export default function SEO({ title, description, image, url, type = 'website', schema, noindex = false }) {
  const { tournament } = useTournament()
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME
  // Each tournament lives under its own prefix, so its pages are distinct URLs.
  const canonical = url
    ? `${SITE_URL}${PREFIXES[tournament]}${url}`
    : (typeof window !== 'undefined' ? window.location.href : SITE_URL)
  // Per-page preview image rendered by the backend from the page's own data.
  const ogImage = image || (url
    ? `${SITE_URL}/api/og?path=${encodeURIComponent(url)}&tournament=${tournament}`
    : `${SITE_URL}${DEFAULT_OG_IMAGE}`)
  const schemas = Array.isArray(schema) ? schema : (schema ? [schema] : [])

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noindex && <meta name="robots" content="noindex" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={TWITTER_HANDLE} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* Structured data (schema.org) for search and answer engines */}
      {schemas.map((s, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(s)}</script>
      ))}
    </Helmet>
  )
}
