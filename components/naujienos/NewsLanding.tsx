// components/naujienos/NewsLanding.tsx
//
// Bendras SEO landing'ų renderis (/naujienos/stilius/[slug], .../tipas/[slug],
// /naujienos/lietuva, /naujienos/pasaulis). Server SSR'ina užrakintos ašies
// rezultatus (SEO), o NewsExplorer leidžia derinti kitas ašis be perkrovimo.

import Link from 'next/link'
import { getNewsFeed } from '@/lib/news-feed'
import { SITE_URL } from '@/lib/artist-browse'
import { newsCollectionJsonLd, breadcrumbJsonLd, jsonLdScript } from '@/lib/news-jsonld'
import NewsExplorer from './NewsExplorer'

export type LandingProps = {
  h1: string
  intro: string
  path: string
  crumb: string
  accent?: string
  icon?: string
  lockedStyle?: number | null
  lockedCategory?: string | null
  lockedScope?: 'lt' | 'world' | null
}

export default async function NewsLanding(props: LandingProps) {
  const { h1, intro, path, crumb, lockedStyle = null, lockedCategory = null, lockedScope = null } = props

  const lockAxis: 'type' | 'style' | 'scope' | undefined =
    lockedCategory ? 'type' : lockedStyle != null ? 'style' : lockedScope ? 'scope' : undefined

  const feed = await getNewsFeed({ style: lockedStyle, category: lockedCategory, scope: lockedScope, sort: 'newest', limit: 24 })

  const collectionLd = newsCollectionJsonLd({ name: h1, description: intro, url: `${SITE_URL}${path}`, items: feed.items.slice(0, 20) })
  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Pradžia', path: '/' },
    { name: 'Naujienos', path: '/naujienos' },
    { name: crumb, path },
  ])

  return (
    <div style={{ background: 'var(--bg-body)', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }} />

      <div className="mx-auto flex flex-col gap-5 px-4 py-7 sm:px-6" style={{ maxWidth: 1320 }}>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-faint)]">
          <Link href="/" className="hover:text-[var(--text-secondary)]">Pradžia</Link>
          <span>›</span>
          <Link href="/naujienos" className="hover:text-[var(--text-secondary)]">Naujienos</Link>
          <span>›</span>
          <span className="font-semibold text-[var(--text-secondary)]">{crumb}</span>
        </nav>

        <header className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-black text-[var(--text-primary)] sm:text-4xl">{h1}</h1>
          <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--text-muted)]">{intro}</p>
        </header>

        <NewsExplorer
          initialItems={feed.items}
          initialTotal={feed.total}
          initialFilters={{ type: lockedCategory ?? '', style: lockedStyle, scope: (lockedScope ?? '') as any }}
          basePath={path}
          lockAxis={lockAxis}
        />
      </div>
    </div>
  )
}
