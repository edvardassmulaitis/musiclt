// app/zanrai/[slug]/page.tsx
//
// Stiliaus LANDING puslapis (pvz. /zanrai/rokas) — dedikuotas SEO turinys
// kiekvienam žanrui: unikalus heading + intro, top Lietuvos ir pasaulio
// atlikėjai, naujausi albumai, populiariausios dainos. SERVER-RENDERED, su
// canonical'u ir JSON-LD. Tai stipresnis SEO sprendimas nei plonas facet
// link'as — unikalus URL + unikalus turinys per stilių.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE_URL, ltSlugify } from '@/lib/artist-browse'
import {
  getGenreCounts, findGenreBySlug,
  getStyleArtists, getStyleAlbums, getStyleTracks, genreHref,
} from '@/lib/muzika-hub'
import {
  muzikaStyles, SectionHead, ArtistRow, AlbumRow, TrackList,
} from '@/components/muzika-ui'

export const revalidate = 3600
// Žanrų aibė baigtinė ir VISI pre-render'inami per generateStaticParams.
// dynamicParams=false → nežinomas slug'as grąžina TIKRĄ 404 (ne soft-404 su
// 200 statusu, kurį duotų on-demand notFound()). Svarbu SEO: Google neturi
// indeksuoti tuščių/dublikuotų puslapių. Naujas žanras DB'oje pasirodys po
// kito deploy'o (generateStaticParams persiskaičiuoja build metu).
export const dynamicParams = false

type Props = { params: Promise<{ slug: string }> }

// Pre-render visus stilius build metu (greitis + garantuotas SEO indeksavimas).
// Jei DB build metu nepasiekiama → tuščias sąrašas, puslapiai generuojami
// on-demand per ISR.
export async function generateStaticParams() {
  const genres = await getGenreCounts()
  return genres.map((g) => ({ slug: ltSlugify(g.name) }))
}

// Švarus žanro pavadinimas heading'ams: nuimam trailing „muzika", jei yra.
function cleanName(name: string): string {
  return name.replace(/\s*muzika$/i, '').trim()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const g = await findGenreBySlug(slug)
  if (!g) return { title: 'Stilius nerastas | music.lt' }
  const name = cleanName(g.name)
  const title = `${name} muzika — atlikėjai, albumai ir dainos | music.lt`
  const description =
    `${name} muzika music.lt kataloge: populiariausi Lietuvos ir pasaulio ${name.toLowerCase()} ` +
    `atlikėjai, naujausi albumai ir daugiausiai klausomos dainos. Naršyk ${g.n} atlikėjų.`
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/zanrai/${slug}` },
    openGraph: { title, description, url: `${SITE_URL}/zanrai/${slug}`, type: 'website' },
  }
}

export default async function GenreLandingPage({ params }: Props) {
  const { slug } = await params
  const g = await findGenreBySlug(slug)
  if (!g) notFound()

  const name = cleanName(g.name)
  const [ltArtists, worldArtists, albums, tracks] = await Promise.all([
    getStyleArtists(g.genre_id, 'lt', 12),
    getStyleArtists(g.genre_id, 'world', 12),
    getStyleAlbums(g.genre_id, 8),
    getStyleTracks(g.genre_id, 10),
  ])

  const browseAll = `/atlikejai?genre=${ltSlugify(g.name)}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${name} muzika — music.lt`,
    url: `${SITE_URL}/zanrai/${slug}`,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      name: `${name} atlikėjai`,
      itemListElement: [...ltArtists, ...worldArtists].slice(0, 20).map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/atlikejai/${a.slug}`,
        name: a.name,
      })),
    },
  }

  const hasContent = ltArtists.length + worldArtists.length + albums.length + tracks.length > 0

  return (
    <div className="mz">
      <style>{muzikaStyles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mz-hero">
        <div className="mz-hero-inner">
          <h1>{name} muzika</h1>
          <p className="mz-hero-lead">
            {g.n.toLocaleString('lt-LT')} {name.toLowerCase()} atlikėjų music.lt kataloge —
            nuo Lietuvos scenos iki pasaulio žvaigždžių. Atrask populiariausius atlikėjus,
            naujausius albumus ir daugiausiai klausomas {name.toLowerCase()} dainas.
          </p>
        </div>
      </header>

      <div className="mz-wrap">
        {!hasContent ? (
          <section className="mz-sec">
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Šio stiliaus turinys dar pildomas.{' '}
              <Link href={browseAll} style={{ color: 'var(--accent-link)' }}>Naršyk visus {name.toLowerCase()} atlikėjus →</Link>
            </p>
          </section>
        ) : (
          <>
            {(ltArtists.length > 0 || worldArtists.length > 0) && (
              <section className="mz-sec">
                <SectionHead
                  title={`Populiariausi ${name.toLowerCase()} atlikėjai`}
                  href={browseAll}
                  hrefLabel="Visi"
                />
                {ltArtists.length > 0 && (
                  <>
                    <div className="mz-subhead">🇱🇹 Lietuva</div>
                    <ArtistRow artists={ltArtists} ranked />
                  </>
                )}
                {worldArtists.length > 0 && (
                  <>
                    <div className="mz-subhead">🌍 Pasaulis</div>
                    <ArtistRow artists={worldArtists} ranked />
                  </>
                )}
              </section>
            )}

            {albums.length > 0 && (
              <section className="mz-sec">
                <SectionHead title={`Naujausi ${name.toLowerCase()} albumai`} />
                <AlbumRow albums={albums} />
              </section>
            )}

            {tracks.length > 0 && (
              <section className="mz-sec">
                <SectionHead title={`Populiariausios ${name.toLowerCase()} dainos`} sub="Pagal YouTube peržiūras" />
                <TrackList tracks={tracks} />
              </section>
            )}
          </>
        )}

        <section className="mz-seo">
          <p className="mz-prose">
            Ieškai daugiau? <Link href={browseAll}>Naršyk visus {name.toLowerCase()} atlikėjus</Link> su
            filtrais pagal šalį ir populiarumą, arba grįžk į <Link href="/zanrai">visų stilių sąrašą</Link>{' '}
            ir <Link href="/muzika">muzikos katalogą</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
