// app/muzikos-stilius/page.tsx
//
// Muzikos stilių INDEKSAS. 8 pagrindiniai stiliai linkina į dedikuotus
// /muzikos-stilius/[slug] landing'us; smulkesni stiliai (substyles) → /atlikejai?substyle=.
// SERVER-RENDERED (SEO): realūs <a>, sitemap.ts išvardina visus landing'us.
// Route lieka /muzikos-stilius (istorinis), bet UI label'as „stiliai" (kaip senasis
// music.lt) — per-puslapio title'ai naudoja „{X} muzika" long-tail.

import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_URL } from '@/lib/artist-browse'
import { getGenreCounts, getSubstyleCounts, genreHref } from '@/lib/muzika-hub'
import { muzikaStyles, SectionHead } from '@/components/muzika-ui'
import { getGenreColor } from '@/lib/genre-colors'
import SubstyleFilter from '@/components/SubstyleFilter'
import { SUBSTYLES, GENRES } from '@/lib/constants'

export const revalidate = 3600

const TITLE = 'Muzikos stiliai — naršyk muziką pagal stilių | music.lt'
const DESCRIPTION =
  'Visi muzikos stiliai vienoje vietoje: rokas, popsas, hip-hopas, elektronika, ' +
  'klasika, sunkioji ir kiti. Atrask atlikėjus, albumus ir dainas pagal stilių.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/muzikos-stilius` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/muzikos-stilius`, type: 'website' },
}

export default async function GenresPage() {
  const [genres, substyles] = await Promise.all([getGenreCounts(), getSubstyleCounts()])
  const main = [...genres].sort((a, b) => b.n - a.n)
  const subs = [...substyles].sort((a, b) => b.n - a.n)
  // Substilio pagrindinis stilius — iš lib/constants SUBSTYLES (ta pati grupė
  // kaip admino stilių rinkiklyje). Nesutampantys → „Kitų stilių muzika".
  const subToGenre: Record<string, string> = {}
  for (const [g, names] of Object.entries(SUBSTYLES)) for (const nm of names) subToGenre[nm] = g
  const subsGrouped = subs.map((s) => ({ ...s, genre: subToGenre[s.name] || 'Kitų stilių muzika' }))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Muzikos stiliai — music.lt',
    description: DESCRIPTION,
    url: `${SITE_URL}/muzikos-stilius`,
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
            // 2026-06-11 consistency: pagrindiniai stiliai — spalvotos kortelės
            // (brand spalvos iš lib/genre-colors, tos pačios kaip nav dropdown'e)
            // vietoj pilkų tekstinių pill'ų. Stilius turi atrodyti kaip muzika.
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {main.map((g) => {
                const gc = getGenreColor(g.name)
                return (
                  <Link key={g.genre_id} href={genreHref(g)} style={{
                    display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none',
                    borderRadius: 16, padding: '20px 18px',
                    border: `1px solid rgba(${gc.rgb}, 0.35)`,
                    background: `linear-gradient(135deg, rgba(${gc.rgb}, 0.28), rgba(${gc.rgb}, 0.05))`,
                  }}>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                      {g.name.replace(/\s*muzika$/i, '')}
                    </span>
                    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                      {g.n.toLocaleString('lt-LT')} atlikėj{g.n % 10 === 1 && g.n % 100 !== 11 ? 'as' : g.n % 10 >= 2 && g.n % 10 <= 9 && !(g.n % 100 >= 11 && g.n % 100 <= 19) ? 'ai' : 'ų'}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {subs.length > 0 && (
          <section className="mz-sec">
            <SectionHead title="Smulkesni stiliai" sub="Konkretesni žanrų pošakiai" />
            <SubstyleFilter subs={subsGrouped} genreOrder={GENRES} />
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
