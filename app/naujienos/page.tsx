// app/naujienos/page.tsx
//
// Naujienų HUB — kompaktiški client filtrai (NewsExplorer): Tipas × Stilius ×
// Šalis KOMBINUOJAMI, filtravimas be perkrovimo (be header šokinėjimo), URL
// sinchronizuojamas (?tipas=&stilius=&salis=). Be filtrų: hero + by-style
// sekcijos + „Visos naujienos" (be hero dublių). Pilnas SEO.
//
// Data: lib/news-feed.ts. Kanoninis naujienos URL — /news/{slug}.

import type { Metadata } from 'next'
import { getNewsFeed, getNewsFacets, getNewsStyleSections, getFeaturedNews } from '@/lib/news-feed'
import { SITE_URL } from '@/lib/artist-browse'
import { newsCollectionJsonLd, breadcrumbJsonLd, jsonLdScript } from '@/lib/news-jsonld'
import { NEWS_TYPE_KEYS, findStyleBySlug } from '@/lib/news-taxonomy'
import NewsHero from '@/components/naujienos/NewsHero'
import StyleSections from '@/components/naujienos/StyleSections'
import NewsExplorer from '@/components/naujienos/NewsExplorer'

export const revalidate = 120

const TITLE = 'Muzikos naujienos — Lietuvos ir pasaulio scena | music.lt'
const DESC =
  'Naujausios Lietuvos ir pasaulio muzikos naujienos: nauji albumai ir singlai, koncertai, turai, interviu ir scenos įvykiai. Naršyk pagal tipą ir stilių.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/naujienos` },
  openGraph: { type: 'website', title: TITLE, description: DESC, url: `${SITE_URL}/naujienos`, siteName: 'music.lt', locale: 'lt_LT' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
}

type SP = Promise<{ tipas?: string; stilius?: string; salis?: string }>

export default async function NaujienosPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const type = sp.tipas && (NEWS_TYPE_KEYS as string[]).includes(sp.tipas) ? sp.tipas : ''
  const style = sp.stilius ? findStyleBySlug(sp.stilius)?.id ?? null : null
  const scope = sp.salis === 'lt' || sp.salis === 'world' ? sp.salis : ''
  const hasFilter = !!type || style != null || !!scope

  const [featured, facets, sections, initialFeed] = await Promise.all([
    hasFilter ? Promise.resolve([]) : getFeaturedNews(5),
    getNewsFacets(),
    hasFilter ? Promise.resolve([]) : getNewsStyleSections(4),
    getNewsFeed({
      sort: 'newest',
      limit: 24,
      category: type || null,
      style,
      scope: (scope || null) as any,
    }),
  ])

  const collectionLd = newsCollectionJsonLd({
    name: 'Muzikos naujienos',
    description: DESC,
    url: `${SITE_URL}/naujienos`,
    items: initialFeed.items.slice(0, 20),
  })
  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Pradžia', path: '/' },
    { name: 'Naujienos', path: '/naujienos' },
  ])

  const browse =
    !hasFilter ? (
      <div className="flex flex-col gap-10">
        {featured.length > 0 && <NewsHero items={featured} />}
        {sections.length > 0 && (
          <div className="flex flex-col gap-5">
            <h2 className="text-2xl font-black text-[var(--text-primary)]">Naršyk pagal stilių</h2>
            <StyleSections sections={sections} />
          </div>
        )}
      </div>
    ) : null

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }} />

      <div className="mx-auto flex flex-col gap-6 px-4 py-7 sm:px-6" style={{ maxWidth: 1320 }}>
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-black text-[var(--text-primary)] sm:text-4xl">Naujienos</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Lietuvos ir pasaulio muzikos scenos pulsas — {facets.total.toLocaleString('lt-LT')} naujienų
          </p>
        </header>

        <NewsExplorer
          facets={facets}
          initialItems={initialFeed.items}
          initialTotal={initialFeed.total}
          initialFilters={{ type, style, scope: (scope || '') as any }}
          heroUids={featured.map((f) => f.uid)}
          browse={browse}
        />
      </div>
    </div>
  )
}
