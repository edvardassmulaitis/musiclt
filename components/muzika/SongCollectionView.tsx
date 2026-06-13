// components/muzika/SongCollectionView.tsx
//
// Teminės DAINŲ kolekcijos puslapio turinys (pvz. /dainos/meiles-dainos).
// KURUOTA: dainas valdo adminas per collection_tracks lentelę. Kol kolekcijoje
// mažiau nei SONG_COLLECTION_MIN_INDEX dainų → puslapis NEINDEKSUOJAMAS
// (robots noindex) ir siūlo naršyti /dainos — kad neturėtume plono turinio.
//
// Render'inamas per /dainos/[slugId] route'ą (interception), nes Next.js
// neleidžia dviejų dinaminių segmentų tame pačiame lygyje.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE_URL } from '@/lib/artist-browse'
import { getCollectionTracks, trackHref } from '@/lib/muzika-hub'
import { muzikaStyles, SectionHead, TrackList } from '@/components/muzika-ui'
import {
  SONG_COLLECTIONS, findSongCollection, songCollectionHref, SONG_COLLECTION_MIN_INDEX,
} from '@/lib/collections'

/** Metadata kolekcijos puslapiui (kviečiama iš /dainos/[slugId] generateMetadata). */
export async function songCollectionMetadata(slug: string): Promise<Metadata> {
  const c = findSongCollection(slug)
  if (!c) return { title: 'Kolekcija nerasta | music.lt' }
  const url = `${SITE_URL}${songCollectionHref(c.slug)}`
  const tracks = await getCollectionTracks(c.slug, SONG_COLLECTION_MIN_INDEX)
  const meta: Metadata = {
    title: c.metaTitle,
    description: c.description,
    alternates: { canonical: url },
    openGraph: { title: c.metaTitle, description: c.description, url, type: 'website' },
  }
  if (tracks.length < SONG_COLLECTION_MIN_INDEX) meta.robots = { index: false, follow: true }
  return meta
}

export default async function SongCollectionView({ slug }: { slug: string }) {
  const c = findSongCollection(slug)
  if (!c) notFound()

  const tracks = await getCollectionTracks(c.slug, 80)
  const url = `${SITE_URL}${songCollectionHref(c.slug)}`
  const others = SONG_COLLECTIONS.filter((x) => x.slug !== c.slug).slice(0, 8)
  const enough = tracks.length >= SONG_COLLECTION_MIN_INDEX

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: c.title,
    description: c.description,
    url,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    ...(enough ? {
      mainEntity: {
        '@type': 'ItemList',
        name: c.title,
        itemListElement: tracks.slice(0, 25).map((t, i) => ({
          '@type': 'ListItem', position: i + 1, name: t.title, url: `${SITE_URL}${trackHref(t)}`,
        })),
      },
    } : {}),
  }

  return (
    <div className="mz">
      <style>{muzikaStyles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mz-hero">
        <div className="mz-hero-inner">
          <nav className="mz-crumbs" aria-label="Breadcrumb">
            <Link href="/">Pradžia</Link><span aria-hidden>›</span>
            <Link href="/dainos">Dainos</Link><span aria-hidden>›</span>
            <span>{c.title}</span>
          </nav>
          <h1>{c.emoji} {c.title}</h1>
          <p className="mz-hero-lead">{c.intro}</p>
        </div>
      </header>

      <div className="mz-wrap">
        {enough ? (
          <section className="mz-sec" style={{ marginTop: 24 }}>
            <TrackList tracks={tracks} />
          </section>
        ) : (
          <section className="mz-empty">
            <div className="mz-empty-ic" aria-hidden>🎵</div>
            <h3>Ši kolekcija dar ruošiama</h3>
            <p>Dainos netrukus bus atrinktos. Kol kas naršyk <Link href="/dainos">visas dainas</Link>{' '}
            arba <Link href="/muzika">muzikos katalogą</Link>.</p>
          </section>
        )}

        {others.length > 0 && (
          <section className="mz-sec">
            <SectionHead title="Kitos kolekcijos" />
            <div className="mz-pills">
              {others.map((x) => (
                <Link key={x.slug} href={songCollectionHref(x.slug)} className="mz-pill" prefetch={false}>
                  <span>{x.emoji} {x.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mz-seo">
          <p className="mz-prose">
            {c.title} — dalis <Link href="/muzika">music.lt muzikos katalogo</Link>. Atrask daugiau{' '}
            <Link href="/dainos">dainų</Link>, naršyk <Link href="/muzikos-stilius">stilius</Link> ir{' '}
            <Link href="/topai">topus</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
