import { appUrl } from './site'

// Builds a schema.org BreadcrumbList JSON-LD object from an ordered list of
// { name, path } crumbs (path relative to site root, e.g. '/teams').
export function breadcrumbSchema(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: appUrl(crumb.path),
    })),
  }
}
