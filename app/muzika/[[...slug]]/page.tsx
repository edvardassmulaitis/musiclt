// app/muzika/[[...slug]]/page.tsx
//
// /muzika hub — SEO „crawl hub" su 7 path-segment variantais (Šalis ×
// Rikiavimas). Kiekvienas variantas turi unikalų H1 / meta / canonical, kad
// nebūtų soft-dublikatų. Catch-all griežtai validuojamas (parseSlug → notFound
// nežinomiems), tad neindeksuojam šiukšlinių URL'ų.
//
//   []                          → visi, abu blokai
//   lietuviska                  → LT, abu blokai
//   lietuviska/dabar            → LT, tik trending
//   lietuviska/populiariausia   → LT, tik visų laikų
//   uzsienio[/dabar|/populiariausia] → tas pats užsieniui
//
// Turinys server-rendered (tikri <a>), interaktyvumas (Tipo tab'ai, dropdown'ai)
// — plonas klientinis sluoksnis (MuzikaTabs), kuris tik perjungia matomumą.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE_URL, ltSlugify } from '@/lib/artist-browse'
import {
  type HubScope,
  getTrendingArtists, getPopularArtists,
  getNewestTracks, getPopularTracks,
  getLatestAlbums, getPopularAlbums,
  getGenreCounts, getCountryCounts, getSongCollectionCounts,
  genreHref,
} from '@/lib/muzika-hub'
import { muzikaStyles, SectionHead, ArtistRow, AlbumRow, TrackList } from '@/components/muzika-ui'
import { hubHref, type HubMode } from '@/components/muzika/MuzikaFilterBar'
import MuzikaTabs from '@/components/muzika/MuzikaTabs'
import { GenreCards } from '@/components/muzika/GenreCards'
import { CollectionLinks } from '@/components/muzika/CollectionLinks'
import { ALBUM_COLLECTIONS, albumCollectionHref } from '@/lib/collections'

// ISR — kartą per parą (trending atsinaujina, bet head term'ui stabilumas OK).
export const revalidate = 86400

/* ───────────────────────── Slug parsing ───────────────────────── */

type Variant = { scope: HubScope; mode: HubMode }

const VARIANTS: Record<string, Variant> = {
  '': { scope: 'all', mode: 'both' },
  'lietuviska': { scope: 'lt', mode: 'both' },
  'lietuviska/dabar': { scope: 'lt', mode: 'trending' },
  'lietuviska/populiariausia': { scope: 'lt', mode: 'alltime' },
  'uzsienio': { scope: 'world', mode: 'both' },
  'uzsienio/dabar': { scope: 'world', mode: 'trending' },
  'uzsienio/populiariausia': { scope: 'world', mode: 'alltime' },
}

function parseSlug(slug?: string[]): Variant | null {
  const key = (slug ?? []).join('/')
  return VARIANTS[key] ?? null
}

// Pre-render visus 7 variantus build metu (SEO + greitis).
export async function generateStaticParams() {
  return [
    { slug: [] },
    { slug: ['lietuviska'] },
    { slug: ['lietuviska', 'dabar'] },
    { slug: ['lietuviska', 'populiariausia'] },
    { slug: ['uzsienio'] },
    { slug: ['uzsienio', 'dabar'] },
    { slug: ['uzsienio', 'populiariausia'] },
  ]
}

/* ───────────────────────── Dinaminis H1 / meta ───────────────────────── */

function hubCopy(scope: HubScope, mode: HubMode): { h1: string; sub: string; title: string; description: string } {
  if (scope === 'all') {
    return {
      h1: 'Muzikos katalogas',
      sub: 'Visa muzika vienoje vietoje — populiarūs Lietuvos ir pasaulio atlikėjai, naujausi albumai ir dainos, naršymas pagal stilių.',
      title: 'Muzika — atlikėjai, albumai, dainos ir stiliai | music.lt',
      description: 'Atrask muziką music.lt kataloge: populiarūs Lietuvos ir pasaulio atlikėjai, naujausi albumai ir dainos, naršymas pagal stilių, šalį ir teminius rinkinius.',
    }
  }
  const lt = scope === 'lt'
  const nat = lt ? 'lietuvių' : 'užsienio'
  const Nat = lt ? 'Lietuvos' : 'pasaulio'
  if (mode === 'trending') {
    return {
      h1: `Dabar populiarūs ${nat} atlikėjai`,
      sub: `Šiuo metu klausomiausi ${Nat} atlikėjai — iš dabartinių topų ir naujausių pasirodymų.`,
      title: `Dabar populiarūs ${nat} atlikėjai | music.lt`,
      description: `Šiuo metu populiariausi ${nat} atlikėjai music.lt: dabartiniai topai, naujausi singlai ir albumai.`,
    }
  }
  if (mode === 'alltime') {
    return {
      h1: `Populiariausi ${nat} atlikėjai visų laikų`,
      sub: `Daugiausiai klausomi ${Nat} atlikėjai — visų laikų reitingas pagal populiarumą.`,
      title: `Populiariausi ${nat} atlikėjai visų laikų | music.lt`,
      description: `Visų laikų populiariausi ${nat} atlikėjai music.lt kataloge — legendos ir didžiausi vardai pagal populiarumą.`,
    }
  }
  // both
  return {
    h1: lt ? 'Lietuviška muzika' : 'Užsienio muzika',
    sub: lt
      ? 'Lietuvių atlikėjai, albumai ir dainos — nuo dabar populiariausių iki visų laikų klasikos.'
      : 'Užsienio atlikėjai, albumai ir dainos — nuo dabar populiariausių iki visų laikų klasikos.',
    title: lt
      ? 'Lietuviška muzika — atlikėjai, dainos, albumai | music.lt'
      : 'Užsienio muzika — atlikėjai, dainos, albumai | music.lt',
    description: lt
      ? 'Lietuviška muzika music.lt kataloge: populiariausi lietuvių atlikėjai, naujausi ir geriausi albumai bei dainos, teminiai rinkiniai.'
      : 'Užsienio muzika music.lt kataloge: populiariausi pasaulio atlikėjai, naujausi ir geriausi albumai bei dainos, teminiai rinkiniai.',
  }
}

type Props = { params: Promise<{ slug?: string[] }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const v = parseSlug(slug)
  if (!v) return { title: 'Puslapis nerastas | music.lt' }
  const { title, description } = hubCopy(v.scope, v.mode)
  const url = `${SITE_URL}${hubHref(v.scope, v.mode)}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
  }
}

/* ───────────────────────── Page ───────────────────────── */

export default async function MuzikaHubPage({ params }: Props) {
  const { slug } = await params
  const v = parseSlug(slug)
  if (!v) notFound()
  const { scope, mode } = v
  const copy = hubCopy(scope, mode)

  const showTrending = mode === 'both' || mode === 'trending'
  const showAlltime = mode === 'both' || mode === 'alltime'
  // Vienam blokui rodom daugiau atlikėjų; abiem — kuklesni rinkiniai.
  const artLimit = mode === 'both' ? 12 : 18
  const wantLt = scope === 'all' || scope === 'lt'
  const wantWorld = scope === 'all' || scope === 'world'

  const [
    trendLt, trendWorld, popLt, popWorld,
    newTracks, popTracks, newAlbums, popAlbums,
    genres, countries, songCounts,
  ] = await Promise.all([
    showTrending && wantLt ? getTrendingArtists('lt', artLimit) : Promise.resolve([]),
    showTrending && wantWorld ? getTrendingArtists('world', artLimit) : Promise.resolve([]),
    showAlltime && wantLt ? getPopularArtists('lt', artLimit) : Promise.resolve([]),
    showAlltime && wantWorld ? getPopularArtists('world', artLimit) : Promise.resolve([]),
    showTrending ? getNewestTracks(scope, 16) : Promise.resolve([]),
    showAlltime ? getPopularTracks(scope, 16) : Promise.resolve([]),
    showTrending ? getLatestAlbums(scope, 12) : Promise.resolve([]),
    showAlltime ? getPopularAlbums(scope, 12) : Promise.resolve([]),
    getGenreCounts(),
    getCountryCounts(),
    getSongCollectionCounts(),
  ])

  const topGenres = [...genres].sort((a, b) => b.n - a.n)
  const topCountries = [...countries].sort((a, b) => b.n - a.n)

  // Dropdown'ų opcijos (klientinė navigacija į esamus landing'us).
  const styleOptions = topGenres.slice(0, 14).map((g) => ({
    label: `${g.name.replace(/\s*muzika$/i, '')} muzika`,
    href: genreHref(g),
  }))
  const countryOptions = scope === 'world' || scope === 'all'
    ? topCountries.slice(0, 20).map((c) => ({ label: c.country, href: `/atlikejai?country=${ltSlugify(c.country)}` }))
    : []

  /* Atlikėjų blokai (server-rendered). */
  const artistsPanel = (
    <>
      {showTrending && (trendLt.length > 0 || trendWorld.length > 0) && (
        <section className="mz-sec">
          <SectionHead
            title={mode === 'trending' ? copy.h1 : 'Dabar populiarūs'}
            sub="Iš dabartinių topų ir naujausių pasirodymų"
            href="/atlikejai"
            hrefLabel="Visi atlikėjai"
          />
          {wantLt && trendLt.length > 0 && (<><div className="mz-subhead">🇱🇹 Lietuva</div><ArtistRow artists={trendLt} ranked /></>)}
          {wantWorld && trendWorld.length > 0 && (<><div className="mz-subhead">🌍 Pasaulis</div><ArtistRow artists={trendWorld} ranked /></>)}
        </section>
      )}
      {showAlltime && (popLt.length > 0 || popWorld.length > 0) && (
        <section className="mz-sec">
          <SectionHead
            title={mode === 'alltime' ? copy.h1 : 'Populiariausi visų laikų'}
            sub="Daugiausiai klausomi atlikėjai per visą laiką"
            href="/atlikejai"
            hrefLabel="Visi atlikėjai"
          />
          {wantLt && popLt.length > 0 && (<><div className="mz-subhead">🇱🇹 Lietuva</div><ArtistRow artists={popLt} ranked /></>)}
          {wantWorld && popWorld.length > 0 && (<><div className="mz-subhead">🌍 Pasaulis</div><ArtistRow artists={popWorld} ranked /></>)}
        </section>
      )}
    </>
  )

  /* Dainų blokai. */
  const tracksPanel = (
    <>
      {showTrending && newTracks.length > 0 && (
        <section className="mz-sec">
          <SectionHead title="Naujausios dainos" sub="Šviežiausi singlai ir vaizdo klipai" href="/dainos" hrefLabel="Visos dainos" />
          <TrackList tracks={newTracks} />
        </section>
      )}
      {showAlltime && popTracks.length > 0 && (
        <section className="mz-sec">
          <SectionHead title="Populiariausios dainos" sub="Daugiausiai klausomos dainos pagal peržiūras" href="/dainos" hrefLabel="Visos dainos" />
          <TrackList tracks={popTracks} />
        </section>
      )}
    </>
  )

  /* Albumų blokai. */
  const albumsPanel = (
    <>
      {showTrending && newAlbums.length > 0 && (
        <section className="mz-sec">
          <SectionHead title="Naujausi albumai" sub="Šviežiausi išleidimai kataloge" href="/albumai" hrefLabel="Visi albumai" />
          <AlbumRow albums={newAlbums} />
        </section>
      )}
      {showAlltime && popAlbums.length > 0 && (
        <section className="mz-sec">
          <SectionHead title="Populiariausi albumai" sub="Populiariausių atlikėjų albumai" href="/albumai" hrefLabel="Visi albumai" />
          <AlbumRow albums={popAlbums} />
        </section>
      )}
    </>
  )

  const canonical = `${SITE_URL}${hubHref(scope, mode)}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: copy.h1,
    description: copy.description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    hasPart: [
      ...topGenres.slice(0, 8).map((g) => ({ '@type': 'WebPage', name: `${g.name.replace(/\s*muzika$/i, '')} muzika`, url: `${SITE_URL}${genreHref(g)}` })),
      ...ALBUM_COLLECTIONS.map((c) => ({ '@type': 'WebPage', name: c.title, url: `${SITE_URL}${albumCollectionHref(c.slug)}` })),
    ],
  }

  return (
    <div className="mz">
      <style>{muzikaStyles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mz-hero">
        <div className="mz-hero-inner">
          <nav className="mz-crumbs" aria-label="Breadcrumb">
            <Link href="/">Pradžia</Link>
            <span aria-hidden>›</span>
            {scope === 'all' ? <span>Muzika</span> : <Link href="/muzika">Muzika</Link>}
            {scope !== 'all' && (<><span aria-hidden>›</span><span>{copy.h1}</span></>)}
          </nav>
          <h1>{copy.h1}</h1>
          <p className="mz-hero-lead">{copy.sub}</p>
        </div>
      </header>

      <div className="mz-wrap">
        <MuzikaTabs
          scope={scope}
          mode={mode}
          artists={artistsPanel}
          tracks={tracksPanel}
          albums={albumsPanel}
          styleOptions={styleOptions}
          countryOptions={countryOptions}
        />

        {/* Stiliai */}
        {topGenres.length > 0 && (
          <section className="mz-sec">
            <SectionHead title="Naršyk pagal stilių" sub="Rokas, popsas, hip-hopas, elektronika, klasika ir kiti" href="/muzikos-stilius" hrefLabel="Visi stiliai" />
            <GenreCards genres={topGenres} />
          </section>
        )}

        {/* Teminės kolekcijos */}
        <section className="mz-sec">
          <SectionHead title="Teminės kolekcijos" sub="Geriausi albumai pagal žanrą ir dainos pagal progą bei nuotaiką" />
          <CollectionLinks songCounts={songCounts} />
        </section>

        {/* SEO footer */}
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
              <h3>Geriausi albumai</h3>
              <ul>
                {ALBUM_COLLECTIONS.map((c) => (
                  <li key={c.slug}>
                    <Link href={albumCollectionHref(c.slug)} prefetch={false}><span>{c.title}</span></Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Naršyk toliau</h3>
              <ul>
                <li><Link href="/muzika/lietuviska" prefetch={false}><span>Lietuviška muzika</span></Link></li>
                <li><Link href="/muzika/uzsienio" prefetch={false}><span>Užsienio muzika</span></Link></li>
                <li><Link href="/atlikejai" prefetch={false}><span>Visi atlikėjai ir grupės</span></Link></li>
                <li><Link href="/muzikos-stilius" prefetch={false}><span>Visi stiliai</span></Link></li>
                <li><Link href="/albumai" prefetch={false}><span>Albumai</span></Link></li>
                <li><Link href="/dainos" prefetch={false}><span>Dainos</span></Link></li>
                <li><Link href="/topai" prefetch={false}><span>Topai ir reitingai</span></Link></li>
              </ul>
            </div>
          </div>
          <p className="mz-prose">
            <strong>music.lt</strong> — didžiausias lietuviškas muzikos katalogas. Čia rasi
            tūkstančius <Link href="/atlikejai">atlikėjų ir grupių</Link> su biografijomis,
            diskografijomis, <Link href="/dainos">dainomis</Link> ir <Link href="/albumai">albumais</Link>.
            Naršyk muziką <Link href="/muzikos-stilius">pagal stilių</Link>, atrask{' '}
            <Link href="/muzika/lietuviska">lietuvišką</Link> ir{' '}
            <Link href="/muzika/uzsienio">užsienio</Link> sceną, sek{' '}
            <Link href="/topai">topus</Link> — viskas vienoje vietoje.
          </p>
        </section>
      </div>
    </div>
  )
}
