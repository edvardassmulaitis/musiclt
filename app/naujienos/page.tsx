// app/naujienos/page.tsx
//
// Naujienų HUB — filtrų juosta /koncertai stiliumi (NewsExplorer): Tipas inline
// chip'ai × Stilius dropdown × LT atlikėjai toggle, KOMBINUOJAMI, be perkrovimo.
// Turinys: featured (naujausia didelė + 2 šalia) + vientisas grid; be by-style
// sekcijų. Tik turiningos naujienos (has_news_text), realios datos. Pilnas SEO.

import type { Metadata } from 'next'
import { getNewsFeed } from '@/lib/news-feed'
import { SITE_URL } from '@/lib/artist-browse'
import { newsCollectionJsonLd, breadcrumbJsonLd, jsonLdScript } from '@/lib/news-jsonld'
import { NEWS_TYPE_KEYS, findStyleBySlug } from '@/lib/news-taxonomy'
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

  const feed = await getNewsFeed({
    sort: 'newest', limit: 24,
    category: type || null, style, scope: (scope || null) as any,
  })

  const collectionLd = newsCollectionJsonLd({
    name: 'Muzikos naujienos', description: DESC, url: `${SITE_URL}/naujienos`,
    items: feed.items.slice(0, 20),
  })
  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Pradžia', path: '/' },
    { name: 'Naujienos', path: '/naujienos' },
  ])

  return (
    <div style={{ background: 'var(--bg-body)', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }} />

      <div className="page-shell">
        <header className="page-head">
          <h1>Naujienos</h1>
          <p>Lietuvos ir pasaulio muzikos scenos pulsas</p>
        </header>

        <NewsExplorer
          initialItems={feed.items}
          initialTotal={feed.total}
          initialFilters={{ type, style, scope: (scope || '') as any }}
        />
      </div>
    </div>
  )
}
