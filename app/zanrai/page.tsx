// app/zanrai/page.tsx
//
// Muzikos stilių INDEKSAS. 8 pagrindiniai stiliai linkina į dedikuotus
// /zanrai/[slug] landing'us; smulkesni stiliai (substyles) → /atlikejai?substyle=.
// SERVER-RENDERED (SEO): realūs <a>, sitemap.ts išvardina visus landing'us.
// Route lieka /zanrai (istorinis), bet UI label'as „stiliai" (kaip senasis
// music.lt) — per-puslapio title'ai naudoja „{X} muzika" long-tail.

import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_URL } from '@/lib/artist-browse'
import { getGenreCounts, getSubstyleCounts, genreHref } from '@/lib/muzika-hub'
import { muzikaStyles, SectionHead, PillLink } from '@/components/muzika-ui'

export const revalidate = 3600

const TITLE = 'Muzikos stiliai — naršyk muziką pagal stilių | music.lt'
const DESCRIPTION =
  'Visi muzikos stiliai vienoje vietoje: rokas, popsas, hip-hopas, elektronika, ' +
  'klasika, sunkioji ir kiti. Atrask atlikėjus, albumus ir dainas pagal stilių.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/zanrai` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/zanrai`, type: 'website' },
}

export default async function GenresPage() {
  const [genres, substyles] = await Promise.all([getGenreCounts(), getSubstyleCounts()])
  const main = [...genres].sort((a, b) => b.n - a.n)
  const subs = [...substyles].sort((a, b) => b.n - a.n)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Muzikos stiliai — music.lt',
    description: DESCRIPTION,
    url: `${SITE_URL}/zanrai`,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: main.slice(0, 30).map((g, i) => ({
        '@type': 'ListItem', position: i + 1, url: `${SITE_URL}${genreHref(g)}`, name: g.name,
      })),
    },
  }

  return (
    <div className="mz">
      <style>{muzikaStyles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mz-hero">
        <div className="mz-hero-inner">
          <h1>Muzikos stiliai</h1>
          <p className="mz-hero-lead">
            Atrask muziką pagal tai, ko šiandien nori klausytis — nuo roko ir popso iki
            hip-hopo, elektronikos ir klasikos. Kiekvienas stilius turi savo atlikėjus,
            albumus ir populiariausias dainas.
          </p>
        </div>
      </header>

      <div className="mz-wrap">
        <section className="mz-sec">
          <SectionHead
            title="Pagrindiniai stiliai"
            sub={main.length > 0 ? `${main.length} stiliai` : undefined}
          />
          {main.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Stilių sąrašas šiuo metu nepasiekiamas. <Link href="/atlikejai" style={{ color: 'var(--accent-link)' }}>Naršyk atlikėjus →</Link>
            </p>
          ) : (
            <div className="mz-pills">
              {main.map((g) => (
                <PillLink key={g.genre_id} href={genreHref(g)} label={`${g.name.replace(/\s*muzika$/i, '')} muzika`} count={g.n} />
              ))}
            </div>
          )}
        </section>

        {subs.length > 0 && (
          <section className="mz-sec">
            <SectionHead title="Smulkesni stiliai" sub="Konkretesni žanrų pošakiai" />
            <div className="mz-pills">
              {subs.map((s) => (
                <PillLink key={s.substyle_id} href={`/atlikejai?substyle=${s.slug}`} label={s.name} count={s.n} />
              ))}
            </div>
          </section>
        )}

        <section className="mz-seo">
          <p className="mz-prose">
            Ieškai daugiau? Grįžk į <Link href="/muzika">muzikos katalogą</Link>, naršyk{' '}
            <Link href="/atlikejai">visus atlikėjus</Link>, <Link href="/albumai">albumus</Link> ar{' '}
            <Link href="/dainos">dainas</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
