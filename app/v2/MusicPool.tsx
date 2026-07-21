'use client'
// Muzikos pool'as (/v2): vienas bendras rinkinys (LT + pasaulis) su viršuje
// esančiais valdikliais — rikiavimas [Nauja | Populiariausi] + LT vėliavelės
// switch'as (Visi ↔ tik LT). Be desktop side-scroll — grid, kuris apsivynioja.
//
// Numatytai rikiuojama pagal DATĄ (naujausi releasai iš populiarių atlikėjų);
// „Populiariausi" perrikiuoja pagal atlikėjo score. Aukštesnė populiarumo
// kartelė (lane-aware) taikoma dar server'yje (žr. getMusicPool page.tsx).
import { useState } from 'react'
import Link from 'next/link'

type Track = { id: number; href: string; thumb: string | null; title: string; artist: string; score: number; isLt: boolean; dateMs: number }
type Album = { id: number; href: string; cover: string | null; title: string; artist: string; score: number; isLt: boolean; dateMs: number }
type Upc = { id: number; href: string; cover: string | null; name: string; isLt: boolean }

function TrackCard({ t }: { t: Track }) {
  return (
    <Link href={t.href} className="v2-tc">
      <span className="v2-tc-img">{t.thumb
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={t.thumb} alt="" loading="lazy" decoding="async" /> : <span className="v2-cc-ph">♪</span>}</span>
      <span className="v2-cc-t">{t.title}</span>
      <span className="v2-cc-s">{t.artist}</span>
    </Link>
  )
}
function AlbumCard({ a }: { a: Album }) {
  return (
    <Link href={a.href} className="v2-cc">
      <span className="v2-cc-img">{a.cover
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={a.cover} alt="" loading="lazy" decoding="async" /> : <span className="v2-cc-ph">♪</span>}</span>
      <span className="v2-cc-t">{a.title}</span>
      <span className="v2-cc-s">{a.artist}</span>
    </Link>
  )
}

export default function MusicPool({ tracks, albums, upcoming, upcomingMore }: {
  tracks: Track[]; albums: Album[]; upcoming: Upc[]; upcomingMore: number
}) {
  const [ltOnly, setLtOnly] = useState(false)
  const [sort, setSort] = useState<'new' | 'pop'>('new')

  const byNew = (x: { dateMs: number; score: number }, y: { dateMs: number; score: number }) => (y.dateMs - x.dateMs) || (y.score - x.score)
  const byPop = (x: { dateMs: number; score: number }, y: { dateMs: number; score: number }) => (y.score - x.score) || (y.dateMs - x.dateMs)

  const tv = (ltOnly ? tracks.filter((t) => t.isLt) : tracks).slice().sort(sort === 'pop' ? byPop : byNew).slice(0, 12)
  const av = (ltOnly ? albums.filter((a) => a.isLt) : albums).slice().sort(sort === 'pop' ? byPop : byNew).slice(0, 12)
  const uv = (ltOnly ? upcoming.filter((u) => u.isLt) : upcoming).slice(0, 6)

  return (
    <div className="v2-mpool">
      <div className="v2-mbar">
        <div className="v2-mseg" role="tablist" aria-label="Rikiavimas">
          <button type="button" role="tab" aria-selected={sort === 'new'} className={sort === 'new' ? 'on' : ''} onClick={() => setSort('new')}>Nauja</button>
          <button type="button" role="tab" aria-selected={sort === 'pop'} className={sort === 'pop' ? 'on' : ''} onClick={() => setSort('pop')}>Populiariausi</button>
        </div>
        <button
          type="button"
          className={`v2-mlt${ltOnly ? ' on' : ''}`}
          onClick={() => setLtOnly((v) => !v)}
          aria-pressed={ltOnly}
          title={ltOnly ? 'Rodoma tik lietuviška muzika — spausk, kad matytum visą' : 'Rodoma visa muzika — spausk, kad matytum tik lietuvišką'}
        >
          <span className="v2-mlt-flag" aria-hidden />
          {ltOnly ? 'Tik LT' : 'Visi'}
        </button>
      </div>

      <section>
        <div className="v2-rub"><h2>Nauja muzika</h2></div>
        {tv.length ? <div className="v2-mgrid">{tv.map((t) => <TrackCard key={t.id} t={t} />)}</div> : <p className="v2-mempty">Šiuo metu įrašų nėra.</p>}
      </section>

      <section style={{ marginTop: 'var(--page-section-gap)' }}>
        <div className="v2-rub"><h2>Neseniai išleista</h2></div>
        {av.length ? <div className="v2-mgrid v2-mgrid-cc">{av.map((a) => <AlbumCard key={a.id} a={a} />)}</div> : <p className="v2-mempty">Šiuo metu įrašų nėra.</p>}
      </section>

      {uv.length > 0 && (
        <section style={{ marginTop: 'var(--page-section-gap)' }}>
          <div className="v2-rub"><h2>Greitai pasirodys</h2></div>
          <div className="v2-upc2">
            {uv.map((u, i) => (
              <Link key={u.id} href={u.href} className={`v2-upc2-cell${i === 0 ? ' big' : ''}`} title={u.name}>
                {u.cover && (/* eslint-disable-next-line @next/next/no-img-element */<img src={u.cover} alt="" loading="lazy" />)}
                <span className="v2-upc2-grad" />
                <span className="v2-upc2-name">{u.name}</span>
              </Link>
            ))}
            <Link href="/albumai" className="v2-upc2-cell v2-upc2-more"><span>+{Math.max(1, upcomingMore)} daugiau</span></Link>
          </div>
        </section>
      )}
    </div>
  )
}
