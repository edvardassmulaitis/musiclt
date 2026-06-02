// app/muzika/page.tsx
//
// /muzika — muzikos KATALOGO „crawl hub". SERVER-RENDERED su tikrais <a>
// link'ais: atlikėjai, stiliai, šalys, albumai, dainos vienoje vietoje. SEO
// strategija (žr. lib/muzika-hub.ts): tankus vidinių nuorodų tinklas paskirsto
// crawl equity į ~12k entity puslapių; gilus naršymas lieka facet puslapiuose
// su savo canonical'ais, todėl hub'as nedubliuoja /atlikejai turinio.

import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_URL, ltSlugify } from '@/lib/artist-browse'
import {
  getTrendingArtists, getGenreCounts, getCountryCounts,
  getLatestAlbums, getPopularTracks, genreHref,
} from '@/lib/muzika-hub'
import {
  muzikaStyles, SectionHead, ArtistRow, AlbumRow, TrackList, PillLink,
} from '@/components/muzika-ui'

// ISR — katalogas keičiasi lėtai, perskaičiuojam kartą per valandą.
export const revalidate = 3600

const TITLE = 'Muzika — atlikėjai, albumai, dainos ir stiliai | music.lt'
const DESCRIPTION =
  'Atrask muziką music.lt kataloge: populiariausi Lietuvos ir pasaulio atlikėjai, ' +
  'naujausi albumai, daugiausiai klausomos dainos ir naršymas pagal stilių bei šalį.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/muzika` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/muzika`, type: 'website' },
}

// „Kolekcijos" — country × genre kombinacijos. Tai REALŪS /atlikejai facet
// puslapiai (abu filtrai veikia kartu) → long-tail SEO landing'ai
// („lietuviškas rokas", „pasaulio hip-hopas"). Temų/nuotaikų kolekcijos
// („lopšinės", „dainos apie meilę") reikalauja dainų temų klasifikacijos —
// atskiras etapas, žr. handoff.
const COLLECTIONS: { name: string; desc: string; genreMatch: RegExp; country?: 'lt' | 'world' }[] = [
  { name: 'Lietuviškas rokas', desc: 'Roko scenos pamatas — nuo legendų iki naujos kartos', genreMatch: /rok/i, country: 'lt' },
  { name: 'Lietuviškas hip-hopas', desc: 'Repas ir hip-hopo kultūra lietuviškai', genreMatch: /hip|rap/i, country: 'lt' },
  { name: 'Lietuviškas popsas', desc: 'Populiariausi LT pop atlikėjai ir hitai', genreMatch: /pop/i, country: 'lt' },
  { name: 'Elektroninė muzika', desc: 'Electronic, house, techno ir šokio ritmai', genreMatch: /elektron|electro|dance/i },
  { name: 'Pasaulio rokas', desc: 'Tarptautinės roko legendos ir grupės', genreMatch: /rok/i, country: 'world' },
  { name: 'Folk ir etno', desc: 'Folkloras, neofolk ir akustinės šaknys', genreMatch: /folk|etno/i },
]

export default async function MuzikaPage() {
  const [ltArtists, worldArtists, genres, countries, albums, tracks] = await Promise.all([
    getTrendingArtists('lt', 12),
    getTrendingArtists('world', 12),
    getGenreCounts(),
    getCountryCounts(),
    getLatestAlbums(12),
    getPopularTracks(12),
  ])

  // Žanrai — rūšiuoti pagal atlikėjų skaičių, rodom top dalį kaip pills.
  const topGenres = [...genres].sort((a, b) => b.n - a.n)
  // Šalys — top pagal atlikėjų skaičių.
  const topCountries = [...countries].sort((a, b) => b.n - a.n)

  // Kolekcijų kortelės — surišam su realiu žanru iš DB (jei toks yra).
  const collections = COLLECTIONS.map((c) => {
    const g = topGenres.find((x) => c.genreMatch.test(x.name))
    if (!g) return null
    const params = new URLSearchParams()
    if (c.country) params.set('country', c.country)
    params.set('genre', ltSlugify(g.name))
    return { name: c.name, desc: c.desc, href: `/atlikejai?${params.toString()}` }
  }).filter(Boolean) as { name: string; desc: string; href: string }[]

  // ── JSON-LD: CollectionPage + ItemList (trending atlikėjai) ──
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Muzika — music.lt',
    description: DESCRIPTION,
    url: `${SITE_URL}/muzika`,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      name: 'Populiariausi atlikėjai',
      itemListElement: [...ltArtists, ...worldArtists].slice(0, 20).map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/atlikejai/${a.slug}`,
        name: a.name,
      })),
    },
  }

  return (
    <div className="mz">
      <style>{muzikaStyles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <header className="mz-hero">
        <div className="mz-hero-inner">
          <nav className="mz-crumbs" aria-label="Naršymo kelias">
            <Link href="/">Pradžia</Link><span aria-hidden>›</span><span>Muzika</span>
          </nav>
          <h1>Muzika</h1>
          <p className="mz-hero-lead">
            Visa muzika vienoje vietoje — populiariausi Lietuvos ir pasaulio atlikėjai,
            naujausi albumai, daugiausiai klausomos dainos ir naršymas pagal stilių bei šalį.
          </p>
        </div>
      </header>

      <div className="mz-wrap">

        {/* Trending atlikėjai */}
        <section className="mz-sec">
          <SectionHead
            title="Populiariausi atlikėjai"
            sub="Lietuvos ir pasaulio scenos lyderiai"
            href="/atlikejai"
            hrefLabel="Visi atlikėjai"
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

        {/* Naršyk pagal stilių */}
        {topGenres.length > 0 && (
          <section className="mz-sec">
            <SectionHead
              title="Naršyk pagal stilių"
              sub="Rokas, popsas, hip-hopas, elektronika, folkas ir kiti"
              href="/zanrai"
              hrefLabel="Visi stiliai"
            />
            <div className="mz-pills">
              {topGenres.slice(0, 24).map((g) => (
                <PillLink key={g.genre_id} href={genreHref(g)} label={g.name} count={g.n} />
              ))}
            </div>
          </section>
        )}

        {/* Kolekcijos */}
        {collections.length > 0 && (
          <section className="mz-sec">
            <SectionHead title="Kolekcijos" sub="Teminiai pjūviai pagal stilių ir kilmę" />
            <div className="mz-coll-grid">
              {collections.map((c) => (
                <Link key={c.name} href={c.href} className="mz-coll" prefetch={false}>
                  <div className="mz-coll-name">{c.name}</div>
                  <div className="mz-coll-desc">{c.desc}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Naujausi albumai */}
        {albums.length > 0 && (
          <section className="mz-sec">
            <SectionHead
              title="Naujausi albumai"
              sub="Šviežiausi išleidimai kataloge"
              href="/albumai"
              hrefLabel="Visi albumai"
            />
            <AlbumRow albums={albums} />
          </section>
        )}

        {/* Populiariausios dainos */}
        {tracks.length > 0 && (
          <section className="mz-sec">
            <SectionHead
              title="Daugiausiai klausomos dainos"
              sub="Pagal YouTube peržiūras"
            />
            <TrackList tracks={tracks} />
          </section>
        )}

        {/* Naršyk pagal šalį */}
        {topCountries.length > 0 && (
          <section className="mz-sec">
            <SectionHead
              title="Naršyk pagal šalį"
              sub="Atlikėjai iš viso pasaulio"
            />
            <div className="mz-pills">
              <PillLink href="/atlikejai?country=lt" label="🇱🇹 Lietuva" />
              {topCountries.slice(0, 20).map((c) => (
                <PillLink key={c.country} href={`/atlikejai?country=${ltSlugify(c.country)}`} label={c.country} count={c.n} />
              ))}
            </div>
          </section>
        )}

        {/* SEO footer — link cloud + aprašymas */}
        <section className="mz-seo">
          <div className="mz-seo-grid">
            <div>
              <h3>Populiarūs stiliai</h3>
              <ul>
                {topGenres.slice(0, 8).map((g) => (
                  <li key={g.genre_id}>
                    <Link href={genreHref(g)} prefetch={false}>
                      <span>{g.name} muzika</span><em>{g.n.toLocaleString('lt-LT')}</em>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Atlikėjai pagal šalį</h3>
              <ul>
                <li><Link href="/atlikejai?country=lt" prefetch={false}><span>Lietuvos atlikėjai</span></Link></li>
                <li><Link href="/atlikejai?country=world" prefetch={false}><span>Pasaulio atlikėjai</span></Link></li>
                {topCountries.slice(0, 6).map((c) => (
                  <li key={c.country}>
                    <Link href={`/atlikejai?country=${ltSlugify(c.country)}`} prefetch={false}>
                      <span>{c.country}</span><em>{c.n.toLocaleString('lt-LT')}</em>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Naršyk toliau</h3>
              <ul>
                <li><Link href="/atlikejai" prefetch={false}><span>Visi atlikėjai ir grupės</span></Link></li>
                <li><Link href="/zanrai" prefetch={false}><span>Visi žanrai ir stiliai</span></Link></li>
                <li><Link href="/albumai" prefetch={false}><span>Albumai</span></Link></li>
                <li><Link href="/topai" prefetch={false}><span>Topai ir reitingai</span></Link></li>
                <li><Link href="/naujienos" prefetch={false}><span>Muzikos naujienos</span></Link></li>
              </ul>
            </div>
          </div>
          <p className="mz-prose">
            <strong>music.lt</strong> — didžiausias lietuviškas muzikos katalogas. Čia rasi
            tūkstančius <Link href="/atlikejai">atlikėjų ir grupių</Link> profilių su
            biografijomis, diskografijomis, dainomis ir naujienomis. Naršyk muziką{' '}
            <Link href="/zanrai">pagal stilių</Link>, atrask <Link href="/atlikejai?country=lt">Lietuvos
            scenos</Link> lyderius ar pasaulio žvaigždes, sek <Link href="/topai">topus</Link> ir
            naujausius albumus — viskas vienoje vietoje.
          </p>
        </section>

      </div>
    </div>
  )
}
