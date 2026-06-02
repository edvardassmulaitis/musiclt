// app/zanrai/page.tsx
//
// Stilių INDEKSAS — visi žanrai su atlikėjų skaičiumi, kiekvienas linkina į
// dedikuotą /zanrai/[slug] landing'ą. SERVER-RENDERED (SEO): realūs <a> →
// crawler'is atranda visus stilių puslapius; sitemap.ts juos taip pat išvardina.

import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_URL } from '@/lib/artist-browse'
import { getGenreCounts, genreHref } from '@/lib/muzika-hub'
import { muzikaStyles, SectionHead, PillLink } from '@/components/muzika-ui'

export const revalidate = 3600

const TITLE = 'Žanrai ir stiliai — naršyk muziką pagal stilių | music.lt'
const DESCRIPTION =
  'Visi muzikos žanrai ir stiliai vienoje vietoje: rokas, popsas, hip-hopas, ' +
  'elektronika, folkas, džiazas ir kiti. Atrask atlikėjus, albumus ir dainas pagal stilių.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/zanrai` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/zanrai`, type: 'website' },
}

export default async function GenresPage() {
  const genres = await getGenreCounts()
  const sorted = [...genres].sort((a, b) => b.n - a.n)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Žanrai ir stiliai — music.lt',
    description: DESCRIPTION,
    url: `${SITE_URL}/zanrai`,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: sorted.slice(0, 30).map((g, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}${genreHref(g)}`,
        name: g.name,
      })),
    },
  }

  return (
    <div className="mz">
      <style>{muzikaStyles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mz-hero">
        <div className="mz-hero-inner">
          <nav className="mz-crumbs" aria-label="Naršymo kelias">
            <Link href="/">Pradžia</Link><span aria-hidden>›</span>
            <Link href="/muzika">Muzika</Link><span aria-hidden>›</span><span>Žanrai</span>
          </nav>
          <h1>Žanrai ir stiliai</h1>
          <p className="mz-hero-lead">
            Atrask muziką pagal tai, ko šiandien nori klausytis — nuo roko ir popso iki
            hip-hopo, elektronikos ir folko. Kiekvienas stilius turi savo atlikėjus,
            albumus ir populiariausias dainas.
          </p>
        </div>
      </header>

      <div className="mz-wrap">
        <section className="mz-sec">
          <SectionHead
            title="Visi stiliai"
            sub={sorted.length > 0 ? `${sorted.length} stilių kataloge` : undefined}
            href="/atlikejai"
            hrefLabel="Visi atlikėjai"
          />
          {sorted.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Stilių sąrašas šiuo metu nepasiekiamas. <Link href="/atlikejai" style={{ color: 'var(--accent-link)' }}>Naršyk atlikėjus →</Link>
            </p>
          ) : (
            <div className="mz-pills">
              {sorted.map((g) => (
                <PillLink key={g.genre_id} href={genreHref(g)} label={g.name} count={g.n} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
