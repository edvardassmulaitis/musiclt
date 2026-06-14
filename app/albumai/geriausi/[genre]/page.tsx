// app/albumai/geriausi/[genre]/page.tsx
//
// „Geriausi [žanro] albumai" kolekcijų puslapiai (/albumai/geriausi/roko ir t.t.).
// UŽKLAUSOMAS realus turinys (getCollectionAlbums pagal žanrą / substilį / šalį)
// — ne plonas auto-generated puslapis. Kiekvienas turi unikalų H1, meta, intro.
//
// Du segmentai (geriausi/[genre]) → NEsikerta su /albumai/[slugId] (1 segmentas).

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE_URL } from '@/lib/artist-browse'
import { getCollectionAlbums } from '@/lib/muzika-hub'
import { muzikaStyles, SectionHead, AlbumRow } from '@/components/muzika-ui'
import { albumCollectionHref } from '@/lib/collections'
import { getAlbumCollections, findAlbumCollection } from '@/lib/collections-db'

export const revalidate = 86400
// dynamicParams=true: admin'e pridėtos naujos kolekcijos render'inamos on-demand
// (ISR), o nežinomi slug'ai → notFound() per findAlbumCollection.
export const dynamicParams = true

// Mažiausiai albumų, kad puslapis būtų vertas indeksavimo (kitaip noindex).
const MIN_INDEX = 4

export async function generateStaticParams() {
  return (await getAlbumCollections()).map((c) => ({ genre: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ genre: string }> }): Promise<Metadata> {
  const { genre } = await params
  const c = await findAlbumCollection(genre)
  if (!c) return { title: 'Kolekcija nerasta | music.lt' }
  const url = `${SITE_URL}${albumCollectionHref(c.slug)}`
  const albums = await getCollectionAlbums({ genreName: c.genreName, scope: c.scope, substyleSlug: c.substyleSlug }, MIN_INDEX)
  const meta: Metadata = {
    title: c.metaTitle,
    description: c.description,
    alternates: { canonical: url },
    openGraph: { title: c.metaTitle, description: c.description, url, type: 'website' },
  }
  // Per tuščia kolekcija (pvz. dar nėra duomenų) → neindeksuojam plono puslapio.
  if (albums.length < MIN_INDEX) meta.robots = { index: false, follow: true }
  return meta
}

export default async function AlbumCollectionPage({ params }: { params: Promise<{ genre: string }> }) {
  const { genre } = await params
  const c = await findAlbumCollection(genre)
  if (!c) notFound()

  const albums = await getCollectionAlbums({ genreName: c.genreName, scope: c.scope, substyleSlug: c.substyleSlug }, 36)
  const url = `${SITE_URL}${albumCollectionHref(c.slug)}`
  const others = (await getAlbumCollections()).filter((x) => x.slug !== c.slug)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: c.title,
    description: c.description,
    url,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      name: c.title,
      itemListElement: albums.slice(0, 20).map((al, i) => ({
        '@type': 'ListItem', position: i + 1, name: al.title,
        url: `${SITE_URL}/albumai/${al.artist_slug}-${al.slug}-${al.id}`,
      })),
    },
  }

  return (
    <div className="mz">
      <style>{muzikaStyles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mz-hero">
        <div className="mz-hero-inner">
          <nav className="mz-crumbs" aria-label="Breadcrumb">
            <Link href="/">Pradžia</Link><span aria-hidden>›</span>
            <Link href="/albumai">Albumai</Link><span aria-hidden>›</span>
            <span>{c.title}</span>
          </nav>
          <h1>{c.emoji} {c.title}</h1>
          <p className="mz-hero-lead">{c.intro}</p>
        </div>
      </header>

      <div className="mz-wrap">
        {albums.length > 0 ? (
          <section className="mz-sec" style={{ marginTop: 24 }}>
            <AlbumRow albums={albums} />
          </section>
        ) : (
          <section className="mz-empty">
            <div className="mz-empty-ic" aria-hidden>💿</div>
            <h3>Ši kolekcija dar pildoma</h3>
            <p>Kol kas naršyk <Link href="/albumai">visus albumus</Link> arba kitas kolekcijas žemiau.</p>
          </section>
        )}

        {/* Kitos albumų kolekcijos */}
        <section className="mz-sec">
          <SectionHead title="Kitos albumų kolekcijos" />
          <div className="mz-coll-list mz-coll-list-row">
            {others.map((x) => (
              <Link key={x.slug} href={albumCollectionHref(x.slug)} className="mz-collrow" prefetch={false}>
                <span className="mz-collrow-emoji" aria-hidden>{x.emoji}</span>
                <span className="mz-collrow-name">{x.title}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mz-seo">
          <p className="mz-prose">
            {c.title} — dalis <Link href="/muzika">music.lt muzikos katalogo</Link>. Naršyk daugiau{' '}
            <Link href="/albumai">albumų</Link>, atrask <Link href="/muzikos-stilius">muzikos stilius</Link> ar
            sek <Link href="/topai">topus</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
