// components/muzika/CollectionShowcase.tsx
//
// Teminių kolekcijų vitrina /muzika hub'e. Vietoj emoji kortelių sienos —
// tankios EILUTĖS (kaip /topai) dviejuose stulpeliuose pagal tipą: kairėje
// „Pagal progą ir temą", dešinėje „Pagal nuotaiką". Kiekviena eilutė: realus
// 2×2 albumų viršelių koliažas (iš pirmų dainų), pavadinimas, dainų skaičius.
// Rodom TIK užpildytas kolekcijas (count>0) — kad atrodytų pilna, ne tuščia.
// Server component, tikri <Link>'ai (SEO link juice į spoke puslapius).

import Link from 'next/link'
import { songCollectionHref } from '@/lib/collections'
import { getSongCollections } from '@/lib/collections-db'
import { getSongCollectionCounts, getCollectionThumbs } from '@/lib/muzika-hub'

function dainosWord(n: number): string {
  const d10 = n % 10, d100 = n % 100
  if (d10 === 0 || (d100 >= 11 && d100 <= 19)) return 'dainų'
  if (d10 === 1) return 'daina'
  return 'dainos'
}

function Collage({ thumbs }: { thumbs: string[] }) {
  const cells = [0, 1, 2, 3]
  return (
    <div className="mz-crow-art" aria-hidden>
      {cells.map((i) => (
        thumbs[i]
          ? <img key={i} src={thumbs[i]} alt="" loading="lazy" className="mz-crow-cell" />
          : <span key={i} className="mz-crow-cell mz-crow-cell--empty" />
      ))}
    </div>
  )
}

function CollRow({ href, title, count, thumbs }: { href: string; title: string; count: number; thumbs: string[] }) {
  return (
    <Link href={href} className="mz-crow" prefetch={false}>
      <Collage thumbs={thumbs} />
      <span className="mz-crow-body">
        <span className="mz-crow-title">{title}</span>
        <span className="mz-crow-meta">{count} {dainosWord(count)}</span>
      </span>
      <span className="mz-crow-go" aria-hidden>›</span>
    </Link>
  )
}

export async function SongCollectionShowcase() {
  const [all, counts, thumbs] = await Promise.all([
    getSongCollections(),
    getSongCollectionCounts(),
    getCollectionThumbs(),
  ])
  const populated = all.filter((c) => (counts[c.slug] || 0) > 0)
  const tema = populated.filter((c) => c.group === 'tema')
  const nuotaika = populated.filter((c) => c.group === 'nuotaika')

  const Col = ({ heading, items }: { heading: string; items: typeof tema }) => (
    <div className="mz-crow-col">
      <div className="mz-subhead">{heading}</div>
      <div className="mz-crow-list">
        {items.map((c) => (
          <CollRow
            key={c.slug}
            href={songCollectionHref(c.slug)}
            title={c.title}
            count={counts[c.slug] || 0}
            thumbs={thumbs[c.slug] || []}
          />
        ))}
      </div>
    </div>
  )

  return (
    <div className="mz-crow-cols">
      <Col heading="Pagal progą ir temą" items={tema} />
      <Col heading="Pagal nuotaiką" items={nuotaika} />
    </div>
  )
}
