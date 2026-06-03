// components/naujienos/NewsLanding.tsx
//
// Bendras SEO landing'ų renderis (/naujienos/stilius/[slug], .../kategorija/[slug],
// /naujienos/lietuva, /naujienos/pasaulis). Server komponentas — pats pasiima
// duomenis pagal locked filtrą ir render'ina: breadcrumb, hero, filtrų juostą
// (su aktyviu chip'u), grid'ą su „Rodyti daugiau" + JSON-LD.

import Link from 'next/link'
import { ChevronRight } from './icons'
import { getNewsFeed, getNewsFacets } from '@/lib/news-feed'
import { SITE_URL } from '@/lib/artist-browse'
import { newsCollectionJsonLd, breadcrumbJsonLd, jsonLdScript } from '@/lib/news-jsonld'
import NewsHero from './NewsHero'
import NewsFilterBar from './NewsFilterBar'
import NewsGrid from './NewsGrid'

export type LandingProps = {
  h1: string
  intro: string
  /** Pilnas puslapio URL path, pvz. /naujienos/stilius/roko-muzika */
  path: string
  /** Breadcrumb display name (paskutinis elementas) */
  crumb: string
  accent?: string
  icon?: string
  lockedStyle?: number | null
  lockedCategory?: string | null
  lockedScope?: 'lt' | 'world' | null
}

export default async function NewsLanding(props: LandingProps) {
  const {
    h1, intro, path, crumb, accent = '#0ea5e9', icon,
    lockedStyle = null, lockedCategory = null, lockedScope = null,
  } = props

  const [facets, feed] = await Promise.all([
    getNewsFacets(),
    getNewsFeed({
      style: lockedStyle,
      category: lockedCategory,
      scope: lockedScope,
      sort: 'newest',
      limit: 25,
    }),
  ])

  const heroItems = feed.items.slice(0, 5)
  const collectionLd = newsCollectionJsonLd({
    name: h1,
    description: intro,
    url: `${SITE_URL}${path}`,
    items: feed.items.slice(0, 20),
  })
  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Pradžia', path: '/' },
    { name: 'Naujienos', path: '/naujienos' },
    { name: crumb, path },
  ])

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }} />

      <div className="mx-auto flex flex-col gap-8 px-4 py-7 sm:px-6" style={{ maxWidth: 1320 }}>
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12.5px] text-[var(--text-faint)]">
          <Link href="/" className="hover:text-[var(--text-secondary)]">Pradžia</Link>
          <ChevronRight size={13} />
          <Link href="/naujienos" className="hover:text-[var(--text-secondary)]">Naujienos</Link>
          <ChevronRight size={13} />
          <span className="font-semibold text-[var(--text-secondary)]">{crumb}</span>
        </nav>

        {/* Antraštė */}
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: `${accent}1a` }} aria-hidden>
                {icon}
              </span>
            )}
            <div>
              <h1 className="text-3xl font-black text-[var(--text-primary)] sm:text-4xl">{h1}</h1>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">{feed.total.toLocaleString('lt-LT')} naujienų</p>
            </div>
          </div>
          <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--text-secondary)]">{intro}</p>
        </header>

        {/* Filtrai (aktyvus chip'as paryškintas) — virš hero */}
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <NewsFilterBar
            facets={facets}
            active={{
              style: lockedStyle ?? undefined,
              type: lockedCategory ?? undefined,
              scope: lockedScope ?? undefined,
            }}
          />
        </div>

        {/* Hero */}
        {heroItems.length > 0 && <NewsHero items={heroItems} />}

        {/* Grid su locked filtru */}
        <NewsGrid
          initialItems={feed.items}
          initialTotal={feed.total}
          lockedStyle={lockedStyle}
          lockedCategory={lockedCategory}
          lockedScope={lockedScope}
          heading="Naujienos"
        />
      </div>
    </div>
  )
}
