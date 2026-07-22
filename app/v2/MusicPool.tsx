'use client'
// Muzikos pool'as (/v2): vienas bendras rinkinys (LT + pasaulis) su /topai
// stiliaus filtrų juosta kairėje — visi filtrai vienoj vietoj, mobile telpa
// vienoj eilutėj (sumažinti chip'ai + horizontalus scroll + žanrų gear popover).
//
// Būsenos:
//   • Rikiavimas (toggle, default = niekas): default → „most relevant" (tik hot);
//     „Nauja" → viskas pagal datą + laiko badge'ai; „Top" → pagal atlikėjo score.
//   • Regionas (toggle, default = mix): LT / Pasaulis.
//   • Stilius (žanras) — gear popover; kombinuojasi + platina pool'ą.
//   • „Rodyti daugiau" po kiekvienu grid'u — atskleidžia likusį pool'ą.
//
// Admin: ant kortelės rodomas atlikėjo score (threshold tuningui).
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

type Track = { id: number; href: string; thumb: string | null; fallback: string | null; title: string; artist: string; score: number; isLt: boolean; dateMs: number; rel: number; hot: boolean; genres: string[] }
type Album = { id: number; href: string; cover: string | null; title: string; artist: string; score: number; isLt: boolean; dateMs: number; rel: number; hot: boolean; genres: string[] }
type Upc = { id: number; href: string; cover: string | null; name: string; isLt: boolean; genres: string[]; score: number }

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

function SecHead({ kind, label }: { kind: 'songs' | 'albums' | 'soon'; label: string }) {
  const ic = kind === 'songs'
    ? <path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none" />
    : kind === 'albums'
      ? <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" /></>
      : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
  return (
    <div className="v2-msec">
      <svg className="v2-msec-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ic}</svg>
      <span className="v2-msec-lbl">{label}</span>
    </div>
  )
}

function ScoreTag({ score, hot }: { score: number; hot: boolean }) {
  return <span className={`v2-mscore${hot ? ' hot' : ''}`} title="Atlikėjo score (threshold)">{score}</span>
}

function TrackCard({ t, badge, admin }: { t: Track; badge: boolean; admin: boolean }) {
  const ago = badge ? agoLabel(t.dateMs) : null
  return (
    <Link href={t.href} className="v2-tc">
      <span className="v2-tc-img">
        {t.thumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={t.thumb} alt="" loading="lazy" decoding="async" onError={(e) => { const el = e.currentTarget; if (t.fallback && el.src !== t.fallback) el.src = t.fallback }} /> : <span className="v2-cc-ph">♪</span>}
        {ago && <span className="v2-mbadge">{ago}</span>}
        {admin && <ScoreTag score={t.score} hot={t.hot} />}
      </span>
      <span className="v2-cc-t">{t.title}</span>
      <span className="v2-cc-s">{t.artist}</span>
    </Link>
  )
}
function AlbumCard({ a, badge, admin }: { a: Album; badge: boolean; admin: boolean }) {
  const ago = badge ? agoLabel(a.dateMs) : null
  return (
    <Link href={a.href} className="v2-cc">
      <span className="v2-cc-img">
        {a.cover
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={a.cover} alt="" loading="lazy" decoding="async" /> : <span className="v2-cc-ph">♪</span>}
        {ago && <span className="v2-mbadge">{ago}</span>}
        {admin && <ScoreTag score={a.score} hot={a.hot} />}
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
  const [extraT, setExtraT] = useState(0)
  const [extraA, setExtraA] = useState(0)
  const ddRef = useRef<HTMLDivElement>(null)
  const { data: session } = useSession()
  const role = (session?.user as any)?.role
  const admin = role === 'admin' || role === 'super_admin'

  // Pasikeitus filtrams — atstatom „Rodyti daugiau" skaitiklius.
  useEffect(() => { setExtraT(0); setExtraA(0) }, [sort, region, genre])

  useEffect(() => {
    if (!gearOpen) return
    const onDown = (e: MouseEvent) => { if (!ddRef.current?.contains(e.target as Node)) setGearOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setGearOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [gearOpen])

  const tog = <T extends string>(cur: T, next: T, set: (v: T) => void, base: T) => set(cur === next ? base : next)
  const baseCap = 16

  // Žanro filtras + rikiavimas (default=relevance, new=data, pop=score).
  function sortLane<T extends Track | Album>(arr: T[]): T[] {
    let a = genre ? arr.filter((x) => x.genres.includes(genre)) : arr
    if (sort === 'new') a = [...a].sort((x, y) => y.dateMs - x.dateMs)
    else if (sort === 'pop') a = [...a].sort((x, y) => (y.score - x.score) || (y.dateMs - x.dateMs))
    else a = [...a].sort((x, y) => y.rel - x.rel)
    return a
  }
  // „Visi": alternuojam viena užsienio / viena LT (kad LT patektų į mišrų sąrašą).
  function interleave<T>(a: T[], b: T[]): T[] {
    const out: T[] = []
    for (let i = 0; i < Math.max(a.length, b.length); i++) { if (i < a.length) out.push(a[i]); if (i < b.length) out.push(b[i]) }
    return out
  }
  function build<T extends Track | Album>(items: T[]): T[] {
    if (region === 'lt') return sortLane(items.filter((x) => x.isLt))
    if (region === 'world') return sortLane(items.filter((x) => !x.isLt))
    if (sort === 'new') return sortLane(items) // chronologiškai (globalus merge)
    return interleave(sortLane(items.filter((x) => !x.isLt)), sortLane(items.filter((x) => x.isLt)))
  }
  const tFull = build(tracks)
  const aFull = build(albums)
  const tv = tFull.slice(0, baseCap + extraT)
  const av = aFull.slice(0, baseCap + extraA)
  const badge = sort === 'new'

  let uf = region === 'lt' ? upcoming.filter((u) => u.isLt) : region === 'world' ? upcoming.filter((u) => !u.isLt) : upcoming
  if (genre) uf = uf.filter((u) => u.genres.includes(genre))
  uf = [...uf].sort((x, y) => y.score - x.score) // populiarumas
  const uv = uf.slice(0, 7)

  return (
    <div className="v2-mpool">
      <div className="v2-mhead">
        <span className="v2-mhead-label"><span className="v2-mhead-dot" />Muzika</span>
        <div className="v2-mf">
        <div className="v2-mf-scroll">
          <div className="v2-mf-grp">
            <button type="button" className={`v2-mf-chip${sort === 'new' ? ' on' : ''}`} onClick={() => tog(sort, 'new', setSort, '')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>Nauja
            </button>
            <button type="button" className={`v2-mf-chip${sort === 'pop' ? ' on' : ''}`} onClick={() => tog(sort, 'pop', setSort, '')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>Top
            </button>
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
      </div>

      <section>
        <SecHead kind="songs" label="Dainos" />
        {tv.length ? <div className="v2-mgrid">{tv.map((t) => <TrackCard key={t.id} t={t} badge={badge} admin={admin} />)}</div> : <p className="v2-mempty">Pagal pasirinktus filtrus įrašų nėra.</p>}
        {tFull.length > tv.length && <button type="button" className="v2-mmore" onClick={() => setExtraT((e) => e + 12)}>Rodyti daugiau <span>({tFull.length - tv.length})</span></button>}
      </section>

      <section style={{ marginTop: 'var(--page-section-gap)' }}>
        <SecHead kind="albums" label="Albumai" />
        {av.length ? <div className="v2-mgrid v2-mgrid-cc">{av.map((a) => <AlbumCard key={a.id} a={a} badge={badge} admin={admin} />)}</div> : <p className="v2-mempty">Pagal pasirinktus filtrus įrašų nėra.</p>}
        {aFull.length > av.length && <button type="button" className="v2-mmore" onClick={() => setExtraA((e) => e + 12)}>Rodyti daugiau <span>({aFull.length - av.length})</span></button>}
      </section>

      {uv.length > 0 && (
        <section style={{ marginTop: 'var(--page-section-gap)' }}>
          <SecHead kind="soon" label="Greitai pasirodys" />
          <div className="v2-upc2">
            {uv.map((u) => (
              <Link key={u.id} href={u.href} className="v2-upc2-cell" title={u.name}>
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
