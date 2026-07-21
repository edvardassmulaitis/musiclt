'use client'
// Muzikos pool'as (/v2): vienas bendras rinkinys (LT + pasaulis) su /topai
// stiliaus filtrų juosta kairėje — visi filtrai vienoje vietoje, mobile telpa
// vienoj eilutėj (horizontalus scroll + žanrų „settings" ikona popover'e).
//
// Būsenos:
//   • Rikiavimas (toggle, default = niekas): default → „most relevant" (tik
//     populiarūs+švieži = hot, rikiuota pagal relevance). „Nauja" → VISKAS pagal
//     datą (be populiarumo kartelės) + laiko badge'ai. „Populiariausi" → viskas
//     pagal atlikėjo score.
//   • Regionas (toggle, default = niekas = LT+pasaulis mix): LT arba Pasaulis.
//   • Stilius (žanras) — gear ikona → popover; veikia KARTU su kitais filtrais.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Track = { id: number; href: string; thumb: string | null; title: string; artist: string; score: number; isLt: boolean; dateMs: number; rel: number; hot: boolean; genres: string[] }
type Album = { id: number; href: string; cover: string | null; title: string; artist: string; score: number; isLt: boolean; dateMs: number; rel: number; hot: boolean; genres: string[] }
type Upc = { id: number; href: string; cover: string | null; name: string; isLt: boolean }

function agoLabel(ms: number): string | null {
  if (!ms) return null
  const d = Math.floor((Date.now() - ms) / 86_400_000)
  if (d < 0) return null
  if (d === 0) return 'šiandien'
  if (d === 1) return 'vakar'
  if (d < 7) return `prieš ${d} d.`
  if (d < 30) return `prieš ${Math.floor(d / 7)} sav.`
  if (d < 365) return `prieš ${Math.floor(d / 30)} mėn.`
  return `prieš ${Math.floor(d / 365)} m.`
}

function TrackCard({ t, badge }: { t: Track; badge: boolean }) {
  const ago = badge ? agoLabel(t.dateMs) : null
  return (
    <Link href={t.href} className="v2-tc">
      <span className="v2-tc-img">
        {t.thumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={t.thumb} alt="" loading="lazy" decoding="async" /> : <span className="v2-cc-ph">♪</span>}
        {ago && <span className="v2-mbadge">{ago}</span>}
      </span>
      <span className="v2-cc-t">{t.title}</span>
      <span className="v2-cc-s">{t.artist}</span>
    </Link>
  )
}
function AlbumCard({ a, badge }: { a: Album; badge: boolean }) {
  const ago = badge ? agoLabel(a.dateMs) : null
  return (
    <Link href={a.href} className="v2-cc">
      <span className="v2-cc-img">
        {a.cover
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={a.cover} alt="" loading="lazy" decoding="async" /> : <span className="v2-cc-ph">♪</span>}
        {ago && <span className="v2-mbadge">{ago}</span>}
      </span>
      <span className="v2-cc-t">{a.title}</span>
      <span className="v2-cc-s">{a.artist}</span>
    </Link>
  )
}

export default function MusicPool({ tracks, albums, genres, upcoming, upcomingMore }: {
  tracks: Track[]; albums: Album[]; genres: string[]; upcoming: Upc[]; upcomingMore: number
}) {
  const [sort, setSort] = useState<'' | 'new' | 'pop'>('')
  const [region, setRegion] = useState<'' | 'lt' | 'world'>('')
  const [genre, setGenre] = useState<string>('')
  const [gearOpen, setGearOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!gearOpen) return
    const onDown = (e: MouseEvent) => { if (!ddRef.current?.contains(e.target as Node)) setGearOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setGearOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [gearOpen])

  const tog = <T extends string>(cur: T, next: T, set: (v: T) => void, base: T) => set(cur === next ? base : next)

  function pick<T extends Track | Album>(items: T[], cap: number): T[] {
    let a = region === 'lt' ? items.filter((x) => x.isLt) : region === 'world' ? items.filter((x) => !x.isLt) : items
    if (genre) a = a.filter((x) => x.genres.includes(genre))
    if (sort === '') a = a.filter((x) => x.hot).sort((x, y) => y.rel - x.rel)
    else if (sort === 'new') a = [...a].sort((x, y) => y.dateMs - x.dateMs)
    else a = [...a].sort((x, y) => (y.score - x.score) || (y.dateMs - x.dateMs))
    return a.slice(0, cap)
  }
  const cap = sort === '' ? 10 : 18
  const tv = pick(tracks, cap)
  const av = pick(albums, cap)
  const uv = (region === 'lt' ? upcoming.filter((u) => u.isLt) : region === 'world' ? upcoming.filter((u) => !u.isLt) : upcoming).slice(0, 6)
  const badge = sort === 'new'

  return (
    <div className="v2-mpool">
      <div className="v2-mf">
        <div className="v2-mf-scroll">
          <div className="v2-mf-grp">
            <button type="button" className={`v2-mf-chip${sort === 'new' ? ' on' : ''}`} onClick={() => tog(sort, 'new', setSort, '')}>Nauja</button>
            <button type="button" className={`v2-mf-chip${sort === 'pop' ? ' on' : ''}`} onClick={() => tog(sort, 'pop', setSort, '')}>Populiariausi</button>
          </div>
          <span className="v2-mf-divider" aria-hidden />
          <div className="v2-mf-grp">
            <button type="button" className={`v2-mf-chip${region === 'lt' ? ' on' : ''}`} onClick={() => tog(region, 'lt', setRegion, '')}>
              <span className="v2-mf-flag lt" aria-hidden />LT
            </button>
            <button type="button" className={`v2-mf-chip${region === 'world' ? ' on' : ''}`} onClick={() => tog(region, 'world', setRegion, '')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3.5 9.5h17M3.5 14.5h17" /><path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></svg>Pasaulis
            </button>
          </div>
        </div>

        {genres.length > 0 && (
          <div className="v2-mf-dd" ref={ddRef}>
            <button type="button" className={`v2-mf-icon${genre ? ' on' : ''}${gearOpen ? ' open' : ''}`} aria-label="Stilius" aria-expanded={gearOpen} aria-haspopup="menu" onClick={() => setGearOpen((v) => !v)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </button>
            <div className={`v2-mf-pop${gearOpen ? ' open' : ''}`} role="menu">
              <button type="button" role="menuitemradio" aria-checked={!genre} className={`v2-mf-opt${!genre ? ' on' : ''}`} onClick={() => { setGenre(''); setGearOpen(false) }}>Visi stiliai</button>
              {genres.map((g) => (
                <button key={g} type="button" role="menuitemradio" aria-checked={genre === g} className={`v2-mf-opt${genre === g ? ' on' : ''}`} onClick={() => { setGenre((cur) => cur === g ? '' : g); setGearOpen(false) }}>{g}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <section>
        <div className="v2-rub"><h2>Nauja muzika</h2></div>
        {tv.length ? <div className="v2-mgrid">{tv.map((t) => <TrackCard key={t.id} t={t} badge={badge} />)}</div> : <p className="v2-mempty">Pagal pasirinktus filtrus įrašų nėra.</p>}
      </section>

      <section style={{ marginTop: 'var(--page-section-gap)' }}>
        <div className="v2-rub"><h2>Neseniai išleista</h2></div>
        {av.length ? <div className="v2-mgrid v2-mgrid-cc">{av.map((a) => <AlbumCard key={a.id} a={a} badge={badge} />)}</div> : <p className="v2-mempty">Pagal pasirinktus filtrus įrašų nėra.</p>}
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
