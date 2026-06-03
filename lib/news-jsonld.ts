// lib/news-jsonld.ts
//
// Schema.org struktūrizuoti duomenys naujienoms (SEO). Pure helper'iai — grąžina
// JS objektus, kurie įdedami per <script type="application/ld+json">.

import { SITE_URL } from '@/lib/artist-browse'
import type { NewsFeedItem } from '@/lib/news-shared'

const PUBLISHER = {
  '@type': 'Organization',
  name: 'music.lt',
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/icon.png`,
  },
}

/** CollectionPage + ItemList naujienų sąrašui (hub / landing). */
export function newsCollectionJsonLd(opts: {
  name: string
  description: string
  url: string
  items: NewsFeedItem[]
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    publisher: PUBLISHER,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: opts.items.length,
      itemListElement: opts.items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}${it.href}`,
        name: it.title,
      })),
    },
  }
}

/** BreadcrumbList — trail nuo pagrindinio iki dabartinio puslapio. */
export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: `${SITE_URL}${t.path}`,
    })),
  }
}

/** NewsArticle — vienos naujienos puslapiui. */
export function newsArticleJsonLd(opts: {
  title: string
  description: string
  url: string
  image?: string | null
  datePublished?: string | null
  dateModified?: string | null
  authorName?: string | null
  section?: string | null
  keywords?: string[]
}) {
  const obj: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: opts.title.slice(0, 110),
    description: opts.description,
    url: opts.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': opts.url },
    publisher: PUBLISHER,
    author: opts.authorName
      ? { '@type': 'Person', name: opts.authorName }
      : { '@type': 'Organization', name: 'music.lt' },
    inLanguage: 'lt',
  }
  if (opts.image) obj.image = [opts.image]
  if (opts.datePublished) obj.datePublished = opts.datePublished
  obj.dateModified = opts.dateModified || opts.datePublished || undefined
  if (opts.section) obj.articleSection = opts.section
  if (opts.keywords && opts.keywords.length) obj.keywords = opts.keywords.join(', ')
  return obj
}

/** Patogi <script> turinio eilutė (XSS-safe — escape'inam </script>). */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
