// components/muzika/CollectionLinks.tsx
//
// Teminių kolekcijų nuorodos (SEO link juice). Geriausi albumai rodomi VISADA
// (užklausomas realus turinys). Dainų kolekcijos rodomos TIK kai jos jau
// kuruotos (>= SONG_COLLECTION_MIN_INDEX dainų) — kad neturėtume nuorodų į
// plonus/tuščius puslapius.

import Link from 'next/link'
import {
  SONG_COLLECTIONS, ALBUM_COLLECTIONS, SONG_COLLECTION_MIN_INDEX,
  songCollectionHref, albumCollectionHref,
} from '@/lib/collections'

export function CollectionLinks({ songCounts }: { songCounts: Record<string, number> }) {
  const populated = (slug: string) => (songCounts[slug] || 0) >= SONG_COLLECTION_MIN_INDEX
  const tema = SONG_COLLECTIONS.filter((c) => c.group === 'tema' && populated(c.slug))
  const nuotaika = SONG_COLLECTIONS.filter((c) => c.group === 'nuotaika' && populated(c.slug))
  const hasSongs = tema.length + nuotaika.length > 0

  return (
    <div className="mz-coll-cols">
      <div className="mz-coll-col">
        <div className="mz-subhead">Geriausi albumai</div>
        <div className="mz-coll-list">
          {ALBUM_COLLECTIONS.map((c) => (
            <Link key={c.slug} href={albumCollectionHref(c.slug)} className="mz-collrow" prefetch={false}>
              <span className="mz-collrow-emoji" aria-hidden>{c.emoji}</span>
              <span className="mz-collrow-name">{c.title}</span>
            </Link>
          ))}
        </div>
      </div>

      {hasSongs && (
        <div className="mz-coll-col">
          {tema.length > 0 && (
            <>
              <div className="mz-subhead">Dainų kolekcijos</div>
              <div className="mz-coll-list">
                {tema.map((c) => (
                  <Link key={c.slug} href={songCollectionHref(c.slug)} className="mz-collrow" prefetch={false}>
                    <span className="mz-collrow-emoji" aria-hidden>{c.emoji}</span>
                    <span className="mz-collrow-name">{c.title}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
          {nuotaika.length > 0 && (
            <>
              <div className="mz-subhead" style={{ marginTop: 16 }}>Pagal nuotaiką</div>
              <div className="mz-pills">
                {nuotaika.map((c) => (
                  <Link key={c.slug} href={songCollectionHref(c.slug)} className="mz-pill" prefetch={false}>
                    <span>{c.emoji} {c.title}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
