// app/muzika/page.tsx
//
// /muzika — muzikos KATALOGO „crawl hub". SERVER-RENDERED su tikrais <a>
// link'ais. SEO strategija: tankus vidinių nuorodų tinklas paskirsto crawl
// equity į atlikėjus, albumus, dainas, stilius, šalis. Gilus naršymas lieka
// facet puslapiuose (/atlikejai, /albumai, /dainos) su savo canonical'ais.
//
// Viršuje — „Šiuo metu populiaru" (charts + naujausi releases), NE all-time
// score (žr. lib/muzika-hub.ts). Dainos/albumai abu rodom „naujausi" (dinamiška,
// nuosekli logika).

import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_URL, ltSlugify } from '@/lib/artist-browse'
import {
  getTrendingArtists, getGenreCounts, getSubstyleCounts, getCountryCounts,
  getLatestAlbums, getNewestTracks, genreHref,
} from '@/lib/muzika-hub'
import {
  muzikaStyles, SectionHead, ArtistRow, AlbumRow, TrackList, PillLink,
} from '@/components/muzika-ui'

// ISR — trending atsinaujina su charts/releases, perskaičiuojam kas 30 min.
export const revalidate = 1800

const TITLE = 'Muzika — atlikėjai, albumai, dainos ir stiliai | music.lt'
const DESCRIPTION =
  'Atrask muziką music.lt kataloge: šiuo metu populiarūs Lietuvos ir pasaulio atlikėjai, ' +
  'naujausi albumai ir dainos, naršymas pagal stilių bei šalį.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/muzika` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/muzika`, type: 'website' },
}

export default async function MuzikaPage() {
  const [ltArtists, worldArtists, genres, substyles, countries, albums, tracks] = await Promise.all([
    getTrendingArtists('lt', 12),
    getTrendingArtists('world', 12),
    getGenreCounts(),
    getSubstyleCounts(),
    getCountryCounts(),
    getLatestAlbums(12),
    getNewestTracks(12),
  ])

  const topGenres = [...genres].sort((a, b) => b.n - a.n)
  const topSubstyles = [...substyles].sort((a, b) => b.n - a.n).slice(0, 18)
  const topCountries = [...countries].sort((a, b) => b.n - a.n)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Muzika — music.lt',
    description: DESCRIPTION,
    url: `${SITE_URL}/muzika`,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      name: 'Šiuo metu populiarūs atlikėjai',
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

      {/* Hero (be breadcrumbs) */}
      <header className="mz-hero">
        <div className="mz-hero-inner">
          <h1>Muzika</h1>
          <p className="mz-hero-lead">
            Visa muzika vienoje vietoje — šiuo metu populiarūs Lietuvos ir pasaulio atlikėjai,
            naujausi albumai ir dainos, naršymas pagal stilių bei šalį.
          </p>
        </div>
      </header>

      <div className="mz-wrap">

        {/* Šiuo metu populiaru */}
        {(ltArtists.length > 0 || worldArtists.length > 0) && (
          <section className="mz-sec">
            <SectionHead
              title="Šiuo metu populiaru"
              sub="Atlikėjai iš dabartinių topų ir naujausių pasirodymų"
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
        )}

        {/* Naujausi pasirodymai (dainos) */}
        {tracks.length > 0 && (
          <section className="mz-sec">
            <SectionHead
              title="Naujausi pasirodymai"
              sub="Šviežiausi singlai ir vaizdo klipai"
              href="/dainos"
              hrefLabel="Visos dainos"
            />
            <TrackList tracks={tracks} />
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

        {/* Stiliai */}
        {topGenres.length > 0 && (
          <section className="mz-sec">
            <SectionHead
              title="Naršyk pagal stilių"
              sub="Rokas, popsas, hip-hopas, elektronika, klasika ir kiti"
              href="/zanrai"
              hrefLabel="Visi stiliai"
            />
            <div className="mz-pills">
              {topGenres.map((g) => (
                <PillLink key={g.genre_id} href={genreHref(g)} label={`${g.name.replace(/\s*muzika$/i, '')} muzika`} count={g.n} />
              ))}
            </div>
            {topSubstyles.length > 0 && (
              <>
                <div className="mz-subhead" style={{ marginTop: 18 }}>Smulkesni stiliai</div>
                <div className="mz-pills">
                  {topSubstyles.map((s) => (
                    <PillLink key={s.substyle_id} href={`/atlikejai?substyle=${s.slug}`} label={s.name} count={s.n} />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* Šalys */}
        {topCountries.length > 0 && (
          <section className="mz-sec">
            <SectionHead title="Naršyk pagal šalį" sub="Atlikėjai iš viso pasaulio" />
            <div className="mz-pills">
              <PillLink href="/atlikejai?country=lt" label="🇱🇹 Lietuva" />
              {topCountries.slice(0, 20).map((c) => (
                <PillLink key={c.country} href={`/atlikejai?country=${ltSlugify(c.country)}`} label={c.country} count={c.n} />
              ))}
            </div>
          </section>
        )}

        {/* SEO footer — tik veikiančios nuorodos */}
        <section className="mz-seo">
          <div className="mz-seo-grid">
            <div>
              <h3>Populiarūs stiliai</h3>
              <ul>
                {topGenres.slice(0, 8).map((g) => (
                  <li key={g.genre_id}>
                    <Link href={genreHref(g)} prefetch={false}>
                      <span>{g.name.replace(/\s*muzika$/i, '')} muzika</span><em>{g.n.toLocaleString('lt-LT')}</em>
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
                <li><Link href="/zanrai" prefetch={false}><span>Visi stiliai</span></Link></li>
                <li><Link href="/albumai" prefetch={false}><span>Albumai</span></Link></li>
                <li><Link href="/dainos" prefetch={false}><span>Dainos</span></Link></li>
                <li><Link href="/topai" prefetch={false}><span>Topai ir reitingai</span></Link></li>
                <li><Link href="/naujienos" prefetch={false}><span>Muzikos naujienos</span></Link></li>
              </ul>
            </div>
          </div>
          <p className="mz-prose">
            <strong>music.lt</strong> — didžiausias lietuviškas muzikos katalogas. Čia rasi
            tūkstančius <Link href="/atlikejai">atlikėjų ir grupių</Link> su biografijomis,
            diskografijomis, <Link href="/dainos">dainomis</Link> ir <Link href="/albumai">albumais</Link>.
            Naršyk muziką <Link href="/zanrai">pagal stilių</Link>, atrask{' '}
            <Link href="/atlikejai?country=lt">Lietuvos scenos</Link> lyderius ar pasaulio žvaigždes ir
            sek <Link href="/topai">topus</Link> — viskas vienoje vietoje.
          </p>
        </section>

      </div>
    </div>
  )
}
