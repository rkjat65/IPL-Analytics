// crickrida.com is one site: the international archive owns the root, and this
// app lives under one prefix per tournament. The prefix picks the tournament.
export const SITE_URL = 'https://crickrida.com'

export const PREFIXES = { ipl: '/ipl', t20wc: '/t20-world-cup' }

function pathname() {
  return typeof window !== 'undefined' ? window.location.pathname : '/ipl'
}

export function tournamentFromPath(path = pathname()) {
  return path === PREFIXES.t20wc || path.startsWith(`${PREFIXES.t20wc}/`) ? 't20wc' : 'ipl'
}

export function currentPrefix(path = pathname()) {
  return PREFIXES[tournamentFromPath(path)]
}

export function isAppPath(path = pathname()) {
  return Object.values(PREFIXES).some((p) => path === p || path.startsWith(`${p}/`))
}

// Absolute path of an app page, for plain <a href> and shared links.
export function appPath(path, slug) {
  return (slug ? PREFIXES[slug] : currentPrefix()) + path
}

export function appUrl(path, slug) {
  return SITE_URL + appPath(path, slug)
}

// Files from the public folder, served under the build's base path (/app/).
export function asset(file) {
  return `${import.meta.env.BASE_URL}${file.replace(/^\//, '')}`
}
