// app/naujienos/page.tsx
//
// Naujienų HUB — redizainas (2026-06-03):
//   • Featured hero (pagrindinė + naujausių sąrašas)
//   • Filtrų juosta (tema/scope/kategorija + stilius) → dedikuoti SEO landing'ai
//   • Naršymas pagal stilių (8 žanrų juostos)
//   • „Visos naujienos" grid su „Rodyti daugiau" + sort + paieška
//   • Pilnas SEO: metadata, canonical, OpenGraph, JSON-LD (CollectionPage+ItemList)
//
// Data sluoksnis: lib/news-feed.ts (news_feed / news_facets / news_style_sections
// RPC'ai). Kanoninis naujienos URL — /news/{slug}.

import type { Metadata } from 'next'
import { getNewsFeed, getNewsFacets, getNewsStyleSections, getFeaturedNews } from '@/lib/news-feed'
import { SITE_URL } from '@/lib/artist-browse'
import { newsCollectionJsonLd, breadcrumbJsonLd, jsonLdScript } from '@/lib/news-jsonld'
import NewsHero from '@/components/naujienos/NewsHero'
import NewsFilterBar from '@/components/naujienos/NewsFilterBar'
import StyleSections from '@/components/naujienos/StyleSections'
import NewsGrid from '@/components/naujienos/NewsGrid'

export const revalidate = 120

const TITLE = 'Muzikos naujienos — Lietuvos ir pasaulio scena | music.lt'
const DESC =
  'Naujausios Lietuvos ir pasaulio muzikos naujienos: nauji albumai ir singlai, koncertai, turai, interviu ir scenos įvykiai. Naršyk pagal stilių ir temą.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/naujienos` },
  openGraph: {
    type: 'website',
    title: TITLE,
    description: DESC,
    url: `${SITE_URL}/naujienos`,
    siteName: 'music.lt',
    locale: 'lt_LT',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
}

export default async function NaujienosPage() {
  const [featured, facets, sections, feed] = await Promise.all([
    getFeaturedNews(5),
    getNewsFacets(),
    getNewsStyleSections(6),
    getNewsFeed({ sort: 'newest', limit: 24 }),
  ])

  const collectionLd = newsCollectionJsonLd({
    name: 'Muzikos naujienos',
    description: DESC,
    url: `${SITE_URL}/naujienos`,
    items: feed.items.slice(0, 20),
  })
  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Pradžia', path: '/' },
    { name: 'Naujienos', path: '/naujienos' },
  ])

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }} />

      <div className="mx-auto flex flex-col gap-10 px-4 py-7 sm:px-6" style={{ maxWidth: 1320 }}>
        {/* Antraštė */}
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-black text-[var(--text-primary)] sm:text-4xl">Naujienos</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Lietuvos ir pasaulio muzikos scenos pulsas — {facets.total.toLocaleString('lt-LT')} naujienų
          </p>
        </header>

        {/* Filtrai → dedikuoti landing'ai (virš hero) */}
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <NewsFilterBar facets={facets} />
        </div>

        {/* Featured hero */}
        {featured.length > 0 && <NewsHero items={featured} />}

        {/* Naršymas pagal stilių */}
        {sections.length > 0 && (
          <div className="flex flex-col gap-5">
            <h2 className="text-2xl font-black text-[var(--text-primary)]">Naršyk pagal stilių</h2>
            <StyleSections sections={sections} />
          </div>
        )}

        {/* Visos naujienos */}
        <NewsGrid initialItems={feed.items} initialTotal={feed.total} />
      </div>
    </div>
  )
}
