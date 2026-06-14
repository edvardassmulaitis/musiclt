// components/muzika/CollectionShowcase.tsx
//
// Teminių kolekcijų vitrina — naudojama /muzika hub'o „Dainos" ir „Albumai"
// tab'uose. Vietoj „naujausių dainų/albumų" sąrašo (silpnas, dubliuoja /dainos)
// rodom GERAI PRISTATYTAS teminės kolekcijas (kortelės su emoji + pavadinimu +
// trumpu aprašu), kurios veda į /dainos/[collection] ir /albumai/geriausi/[genre].
// Server component, tikri <Link>'ai (SEO link juice į spoke puslapius).

import Link from 'next/link'
import { songCollectionHref, albumCollectionHref } from '@/lib/collections'
import { getSongCollections, getAlbumCollections } from '@/lib/collections-db'

// Trumpas aprašas kortelei = pirmas meta description sakinys.
function shortDesc(d: string): string {
  const first = d.split('. ')[0]
  return first.replace(/\.$/, '')
}

function CollCard({ href, emoji, title, desc }: { href: string; emoji: string; title: string; desc: string }) {
  return (
    <Link href={href} className="mz-coll" prefetch={false}>
      <div className="mz-coll-name">{emoji} {title}</div>
      <div className="mz-coll-desc">{desc}</div>
    </Link>
  )
}

export async function SongCollectionShowcase() {
  const all = await getSongCollections()
  const tema = all.filter((c) => c.group === 'tema')
  const nuotaika = all.filter((c) => c.group === 'nuotaika')
  return (
    <>
      <div className="mz-subhead">Pagal progą ir temą</div>
      <div className="mz-coll-grid">
        {tema.map((c) => (
          <CollCard key={c.slug} href={songCollectionHref(c.slug)} emoji={c.emoji} title={c.title} desc={shortDesc(c.description)} />
        ))}
      </div>
      <div className="mz-subhead" style={{ marginTop: 20 }}>Pagal nuotaiką</div>
      <div className="mz-coll-grid">
        {nuotaika.map((c) => (
          <CollCard key={c.slug} href={songCollectionHref(c.slug)} emoji={c.emoji} title={c.title} desc={shortDesc(c.description)} />
        ))}
      </div>
    </>
  )
}

export async function AlbumCollectionShowcase() {
  const ALBUM_COLLECTIONS = await getAlbumCollections()
  return (
    <div className="mz-coll-grid">
      {ALBUM_COLLECTIONS.map((c) => (
        <CollCard key={c.slug} href={albumCollectionHref(c.slug)} emoji={c.emoji} title={c.title} desc={shortDesc(c.description)} />
      ))}
    </div>
  )
}
