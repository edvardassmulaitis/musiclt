// app/v2/page.tsx — SERVER component. Alternatyvus homepage variantas (/v2).
//
// STRUKTŪRA:
//   Hero (full) → [ Nauja muzika (kompaktiška, vizuali, su filtrais) ~65%
//                   |  Bendruomenės šoninė juosta (praturtinta) ~35% ]
//   → Koncertai (afiša, full, kaip yra) → Šiandien muzikos istorijoje (full).
//
// NATIVE stilius + TIKRI duomenys. Neliečia main page. noindex.

import Link from 'next/link'
import { muzikaStyles } from '@/components/muzika-ui'
import { type HubAlbum, albumHref } from '@/lib/muzika-hub'
import Scroller from '@/components/ui/Scroller'
import { readHomeSnapshot } from '@/lib/home-snapshot'
import {
  getLatestTracksForHome, getLatestAlbumsForHome, getUpcomingAlbumsForHome,
  mapTrackForHome, mapAlbumForHome,
} from '@/lib/home-latest'
import { proxyImgResized } from '@/lib/img-proxy'
import { countryFlag } from '@/lib/country-flags'
import { createAdminClient } from '@/lib/supabase'
import { LT_COUNTRY } from '@/lib/artist-browse'
import { eventHref } from '@/lib/event-href'
import { DienosDainaSection } from '@/components/DienosDainaSection'
import CommunityIcons from './CommunityIcons'
import GilynCrate from './GilynCrate'
import HeroCarousel from './HeroCarousel'
import MusicPool from './MusicPool'

export const revalidate = 300
export const metadata = {
  title: 'Music.lt v2 — alternatyvus variantas',
  robots: { index: false, follow: false },
}

const MONTHS_LT = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rgp', 'Rgs', 'Spa', 'Lap', 'Gru']
function sanitizeTitle(raw: string): string {
  return (raw || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
function isFresh24(input: string | null | undefined): boolean {
  if (!input) return false
  const t = Date.parse(input)
  if (isNaN(t)) return false
  return Date.now() - t >= 0 && Date.now() - t < 24 * 60 * 60 * 1000
}
function FreshDot({ right = 8, top = 8 }: { right?: number; top?: number }) {
  return <span className="absolute z-[3] block h-2.5 w-2.5 rounded-full" style={{ right, top, background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.25)' }} aria-hidden />
}
async function jget(path: string, timeoutMs = 3000): Promise<any> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const r = await fetch(base + path, { next: { revalidate: 300 }, signal: ctrl.signal })
    clearTimeout(t)
    return r.ok ? await r.json() : null
  } catch { return null }
}

type TrackItem = { id: number; href: string; thumb: string | null; title: string; artist: string }

function ytId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || (/^[\w-]{11}$/.test(url) ? [null, url] : null)
  return m ? (m[1] as string) : null
}
function trackThumb(t: any): string | null {
  const id = ytId(t.video_url)
  if (id) return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
  return proxyImgResized(t.cover_url || t.artists?.cover_image_url || null, 320) || null
}
function toTrackItem(t: any): TrackItem {
  const slug = t.slug, aslug = t.artist_slug || t.artists?.slug
  const href = aslug && slug ? `/dainos/${aslug}-${slug}-${t.id}` : `/dainos/${slug ? slug + '-' : ''}${t.id}`
  return { id: t.id, href, thumb: trackThumb(t), title: t.title, artist: t.artist_name || t.artists?.name || '' }
}
function toHubAlbum(a: any): HubAlbum {
  return {
    id: a.id, slug: a.slug ?? null, title: a.title, year: a.year ?? null,
    cover_image_url: proxyImgResized(a.cover_image_url || a.cover_url || a.artists?.cover_image_url || null, 240) || null,
    artist_id: a.artist_id, artist_name: a.artist_name || a.artists?.name || '', artist_slug: a.artist_slug || a.artists?.slug || '',
  }
}

async function getMusic() {
  const snap = await readHomeSnapshot()
  if (snap) {
    return { tLt: snap.tracks.lt.map(toTrackItem), tW: snap.tracks.world.map(toTrackItem), aLt: snap.albums.lt.map(toHubAlbum), aW: snap.albums.world.map(toHubAlbum) }
  }
  const [t, a] = await Promise.all([
    getLatestTracksForHome().catch(() => ({ lt: [], world: [] } as any)),
    getLatestAlbumsForHome().catch(() => ({ lt: [], world: [] } as any)),
  ])
  return {
    tLt: (t.lt || []).map(mapTrackForHome).map(toTrackItem), tW: (t.world || []).map(mapTrackForHome).map(toTrackItem),
    aLt: (a.lt || []).map(mapAlbumForHome).map(toHubAlbum), aW: (a.world || []).map(mapAlbumForHome).map(toHubAlbum),
  }
}

/* ─────────────── Muzikos pool'as (/v2) ───────────────
   PER-LANE užklausos TIESIAI į DB (kaip /dainos), NE per /api/home/list —
   home-list naudoja bendrą 250-kandidatų limitą per VISUS lane'us, tad pasaulio
   releasai užpildo jį iki ~2 sav. senumo ir LT dainos 15–90 d. senumo IŠKRENTA
   (Edvardo pastebėta: LT eina 1 sav. → šoka į 6 mėn.). Per-lane užklausa duoda
   PILNĄ 90 d. LT aprėptį (LT scena maža — nenukertama).
   Kartelė LANE-AWARE (LT balai žemesni). Rikiavimą/filtrą daro klientas. */
const LT_COUNTRIES = ['Lietuva', 'LT', 'Lithuania']
const isLtCountry = (c?: string | null) => !!c && LT_COUNTRIES.includes(c)
const TRACK_BAR = { lt: 35, world: 63 }
const ALBUM_BAR = { lt: 35, world: 60 }
const POOL_DAYS = 90        // dainų langas
const ALBUM_POOL_DAYS = 180 // albumų langas (albumai retesni)
function releaseMs(r: any, kind: 'track' | 'album'): number {
  const s = kind === 'track'
    ? (r.video_uploaded_at || r.release_date || (r.release_year ? `${r.release_year}-01-01` : null))
    : (r.release_date || (r.year ? `${r.year}-${String(r.month || 1).padStart(2, '0')}-${String(r.day || 1).padStart(2, '0')}` : null))
  const ms = s ? Date.parse(s) : NaN
  return isNaN(ms) ? 0 : ms
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function genreMap(sb: any, artistIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>()
  if (!artistIds.length) return map
  const { data } = await sb.from('artist_genres').select('artist_id, genres(name)').in('artist_id', artistIds)
  for (const r of (data || []) as any[]) {
    const n = r.genres?.name
    if (!n) continue
    const l = map.get(r.artist_id) || []
    if (!l.includes(n)) l.push(n)
    map.set(r.artist_id, l)
  }
  return map
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchLaneTracks(sb: any, lane: 'lt' | 'world', sinceIso: string): Promise<any[]> {
  let q = sb.from('tracks')
    .select('id, slug, title, cover_url, video_url, video_uploaded_at, release_date, release_year, video_views, hide_from_homepage, artist_id, artists!tracks_artist_id_fkey!inner(id, name, slug, cover_image_url, country, score)')
    .not('video_url', 'is', null)
    .not('video_uploaded_at', 'is', null)
    .gte('video_uploaded_at', sinceIso)
    .order('video_uploaded_at', { ascending: false })
    .limit(lane === 'lt' ? 400 : 150)
  q = lane === 'lt' ? q.eq('artists.country', LT_COUNTRY) : q.neq('artists.country', LT_COUNTRY)
  const { data } = await q
  return ((data || []) as any[]).filter((t) => t.artists && t.title && t.title !== t.artists.name && !t.hide_from_homepage && t.artists.country !== 'Rusija')
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchLaneAlbums(sb: any, lane: 'lt' | 'world', currentYear: number, albumSinceMs: number): Promise<any[]> {
  let q = sb.from('albums')
    .select('id, title, slug, cover_image_url, year, month, day, is_upcoming, artist_id, artists!albums_artist_id_fkey!inner(id, name, slug, cover_image_url, country, score)')
    .not('year', 'is', null).gte('year', currentYear - 1)
    .order('year', { ascending: false }).order('month', { ascending: false, nullsFirst: false }).order('day', { ascending: false, nullsFirst: false })
    .limit(lane === 'lt' ? 400 : 150)
  q = lane === 'lt' ? q.eq('artists.country', LT_COUNTRY) : q.neq('artists.country', LT_COUNTRY)
  const { data } = await q
  return ((data || []) as any[]).filter((a) => a.artists && !a.is_upcoming && a.artists.country !== 'Rusija' && releaseMs(a, 'album') >= albumSinceMs)
}
async function getMusicPool() {
  const sb = createAdminClient()
  const nowMs = Date.now()
  const sinceIso = new Date(nowMs - POOL_DAYS * 86_400_000).toISOString()
  const albumSinceMs = nowMs - ALBUM_POOL_DAYS * 86_400_000
  const currentYear = new Date().getFullYear()
  const [tLt, tW, aLt, aW] = await Promise.all([
    fetchLaneTracks(sb, 'lt', sinceIso).catch(() => []),
    fetchLaneTracks(sb, 'world', sinceIso).catch(() => []),
    fetchLaneAlbums(sb, 'lt', currentYear, albumSinceMs).catch(() => []),
    fetchLaneAlbums(sb, 'world', currentYear, albumSinceMs).catch(() => []),
  ])
  const allArtistIds = [...new Set([...tLt, ...tW, ...aLt, ...aW].map((r) => r.artist_id).filter(Boolean))] as number[]
  const gmap = await genreMap(sb, allArtistIds).catch(() => new Map<number, string[]>())

  const REL_WIN = POOL_DAYS * 86_400_000
  const relOf = (dateMs: number, score: number) => {
    const fresh = dateMs ? Math.max(0, Math.min(1, (dateMs - (nowMs - REL_WIN)) / REL_WIN)) : 0
    const pop = Math.min(1, (score || 0) / 80)
    return fresh * 0.55 + pop * 0.45
  }
  const genreCount = new Map<string, number>()
  const addG = (gs: string[]) => { for (const g of gs) genreCount.set(g, (genreCount.get(g) || 0) + 1) }
  const mapT = (r: any, isLt: boolean) => {
    const ti = toTrackItem(r), score = r.artists?.score ?? 0, dateMs = releaseMs(r, 'track'), gs = gmap.get(r.artist_id) || []
    addG(gs)
    return { id: ti.id, href: ti.href, thumb: ti.thumb, title: ti.title, artist: ti.artist, score, isLt, dateMs, rel: relOf(dateMs, score), hot: score >= (isLt ? TRACK_BAR.lt : TRACK_BAR.world), genres: gs }
  }
  const mapA = (r: any, isLt: boolean) => {
    const ha = toHubAlbum(r), score = r.artists?.score ?? 0, dateMs = releaseMs(r, 'album'), gs = gmap.get(r.artist_id) || []
    addG(gs)
    return { id: ha.id, href: albumHref(ha), cover: ha.cover_image_url, title: ha.title, artist: ha.artist_name, score, isLt, dateMs, rel: relOf(dateMs, score), hot: score >= (isLt ? ALBUM_BAR.lt : ALBUM_BAR.world), genres: gs }
  }
  const tracks = [...tLt.map((r) => mapT(r, true)), ...tW.map((r) => mapT(r, false))]
  const albums = [...aLt.map((r) => mapA(r, true)), ...aW.map((r) => mapA(r, false))]
  const genres = [...genreCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'lt')).slice(0, 24).map((e) => e[0])
  return { tracks, albums, genres }
}

/* ─────────────── kompaktiška viršelio kortelė (vizuali, be peržiūrų) ─────────────── */
function AlbumCard({ href, cover, title, sub }: { href: string; cover: string | null; title: string; sub?: string }) {
  return (
    <Link href={href} className="v2-cc">
      <span className="v2-cc-img">{cover
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <span className="v2-cc-ph">♪</span>}</span>
      <span className="v2-cc-t">{title}</span>
      {sub ? <span className="v2-cc-s">{sub}</span> : null}
    </Link>
  )
}
/* Dainos kortelė — stačiakampis (16:9) video thumbnail. */
function TrackCard({ t }: { t: TrackItem }) {
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
/* Greiti filtrai prie „Dainos"/„Albumai" — populiariausi / naujausi / stilius.
   Nuorodos į realų /dainos|/albumai katalogą su ?country + ?sort + #stiliai. */
function QuickFilters({ base, country }: { base: string; country: 'lt' | 'world' }) {
  const c = `country=${country}`
  return (
    <span className="v2-qf">
      <Link href={`${base}?${c}`} className="v2-qf-link" title="Populiariausi">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
        <span className="v2-qf-txt">Populiarūs</span>
      </Link>
      <Link href={`${base}?${c}&sort=newest`} className="v2-qf-link" title="Naujausi">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        <span className="v2-qf-txt">Naujausi</span>
      </Link>
      <Link href={`${base}?${c}#stiliai`} className="v2-qf-link" title="Filtruoti pagal stilių">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>
        <span className="v2-qf-txt">Stilius</span>
      </Link>
    </span>
  )
}
/* Šalies juostelė iš kairės — siaura spalvų juosta (ne ikona). */
function FlagLane({ variant, ariaLabel, children }: { variant: 'lt' | 'world' | 'soon'; ariaLabel: string; children: React.ReactNode }) {
  return (
    <div className="v2-lane">
      <span className={`v2-flagbar ${variant}`} title={ariaLabel} aria-label={ariaLabel} />
      <div className="v2-lane-s"><Scroller ariaLabel={ariaLabel}>{children}</Scroller></div>
    </div>
  )
}

/* ─────────────── sekcijos antraštė su filtrais (Viltės pasiūlymas) ─────────────── */
function MusicHead({ title, browseHref }: { title: string; browseHref: string }) {
  return (
    <div className="v2-mh">
      <h2>{title}</h2>
      <Link href={browseHref} className="v2-mh-filter" aria-label="Filtruoti ir naršyti visas">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
        Filtruoti
      </Link>
    </div>
  )
}

/* ─────────────── HERO ─────────────── */
type Slide = { href: string; bgImg: string | null; chip: string | null; chipBg: string; title: string; subtitle?: string | null; fresh?: boolean }
function HeroCard({ s }: { s: Slide }) {
  return (
    <Link href={s.href} className="group relative block aspect-[16/9] overflow-hidden rounded-2xl border border-[var(--border-default)] no-underline shadow-[var(--hero-card-shadow)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--hero-card-shadow-hover)]" style={{ background: 'linear-gradient(135deg,#141b28 0%,#0a0e17 100%)' }}>
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        {s.bgImg
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={proxyImgResized(s.bgImg, 1280)} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: 'center 25%' }} />
          : <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#141b28 0%,#0a0e17 100%)' }} />}
      </div>
      {s.chip && <span className="absolute left-3 top-3 z-[2] inline-flex rounded-md px-2 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.03em] text-white" style={{ background: s.chipBg }}>{s.chip}</span>}
      {s.fresh && <FreshDot right={12} top={12} />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-end p-5">
        <h3 className="m-0 max-w-[460px] font-['Outfit',sans-serif] text-[28px] font-black leading-[1.08] tracking-tight text-white transition-opacity group-hover:opacity-90">{s.title}</h3>
        {s.subtitle && <p className="m-0 mt-2 flex items-center gap-1.5 font-['Outfit',sans-serif] text-[14px] font-semibold text-white/85"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>{s.subtitle}</p>}
      </div>
    </Link>
  )
}
function Hero({ slides }: { slides: Slide[] }) {
  if (!slides.length) return null
  return (
    <section className="hp-scroll -mx-1 mb-1 flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {slides.map((s, i) => <div key={i} className="w-[86vw] shrink-0 snap-start sm:w-[520px]"><HeroCard s={s} /></div>)}
    </section>
  )
}

/* ─────────────── Bendruomenės šoninė juosta (vientisas srautas) ─────────────── */
// Tipo ikonos (vietoj spalvotų pavadinimų) + engagement ikonos.
const CO_ICON: Record<string, string> = {
  muzika: 'M12 17.3l-6.18 3.7 1.64-7.03L4 9.24l7.19-.61L12 2l0.81 6.63 7.19.61-3.46 4.73 1.64 7.03z', // žvaigždė (muzikos apžvalga)
  koncertas: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3', // mikrofonas (koncerto apžvalga)
  topas: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z', // taurė (topas)
  diskusija: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z', // pokalbis (diskusija)
}
const CO_COLOR: Record<string, string> = { muzika: '#ef4444', koncertas: '#06b6d4', topas: '#f59e0b', diskusija: '#8b5cf6' }
const CO_LABEL: Record<string, string> = { muzika: 'Muzikos apžvalga', koncertas: 'Koncerto apžvalga', topas: 'Topas', diskusija: 'Diskusija' }
function COIc({ kind }: { kind: string }) {
  const d = CO_ICON[kind] || CO_ICON.muzika
  const filled = kind === 'muzika'
  return <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: CO_COLOR[kind] || 'var(--text-faint)', flex: 'none' }} aria-label={CO_LABEL[kind]}><path d={d} /></svg>
}
function coAvatar(av: string | null, nm: string | null) {
  return av
    ? (/* eslint-disable-next-line @next/next/no-img-element */<img className="v2-crow-av" src={proxyImgResized(av, 40)} alt="" loading="lazy" />)
    : <span className="v2-crow-av v2-crow-av-ph">{(nm || '?').charAt(0).toUpperCase()}</span>
}
function CRow({ n }: { n: any }) {
  return (
    <Link href={n.href} className="v2-crow group">
      <span className="v2-crow-cov">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={proxyImgResized(n.cover, 200)} alt="" loading="lazy" /></span>
      <span className="v2-crow-body">
        <b className="v2-crow-title">{n.title}</b>
        {(n.kind === 'diskusija' ? n.cmt : n.intro) && <span className="v2-crow-cmt2">{n.kind === 'diskusija' ? n.cmt : n.intro}</span>}
        <span className="v2-crow-meta">
          <COIc kind={n.kind} />
          {coAvatar(n.avatar, n.author)}
          <span className="v2-crow-au-n">{n.author}</span>
          <span className="v2-crow-eng">
            {n.comments > 0 && (
              <span className="v2-crow-eng-i"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>{n.comments}</span>
            )}
            {n.likes != null && n.likes > 0 && (
              <span className="v2-crow-eng-i"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.9 8.8-8.9a5.5 5.5 0 0 0 0-7.8z" /></svg>{n.likes}</span>
            )}
          </span>
        </span>
      </span>
    </Link>
  )
}
// Nukerpa senų forumo temų ID galūnę („Rush l317152" → „Rush").
function cleanCoTitle(t: string): string { return sanitizeTitle(t).replace(/\s+[lI]\s?\d{4,}$/, '').replace(/\s*[|\-–]\s*$/, '').trim() }
function feedHref(p: any): string { return p.blog_slug ? `/blogas/${p.blog_slug}/${p.slug || p.id}` : '/blogas' }
function meaningfulCmt(t: string | null | undefined): boolean {
  const s = sanitizeTitle(t || '')
  if (!s) return false
  if (/^https?:\/\/\S+$/.test(s.replace(/\s+/g, ''))) return false
  return s.length >= 25
}
function CommunityRail({ posts, disks }: { posts: any[]; disks: any[] }) {
  const norm: any[] = []
  for (const p of posts) {
    if (!p.cover) continue // reikia vizualo (nepriskirta grupė → nerodom)
    const ed = p.editorial_type, pt = p.post_type
    const kind = ed === 'koncertai' ? 'koncertas' : (ed === 'recenzija' || pt === 'review') ? 'muzika' : pt === 'topas' ? 'topas' : null
    if (!kind) continue
    const intro = p.excerpt ? sanitizeTitle(p.excerpt).slice(0, 160) : null
    norm.push({ kind, title: cleanCoTitle(p.title), href: feedHref(p), cover: p.cover, intro, author: p.author?.username || p.author?.full_name || null, avatar: p.author?.avatar_url || null, likes: p.like_count || 0, comments: p.comment_count || 0, date: p.published_at })
  }
  for (const d of disks) {
    if (!d.artist_image) continue // reikia vizualo
    let cmt: string | null = null, cmtA: string | null = null, cmtAv: string | null = null
    for (const c of (d.latest_comments || [])) { if (meaningfulCmt(c.excerpt)) { cmt = sanitizeTitle(c.excerpt).slice(0, 150); cmtA = c.author; cmtAv = c.avatar; break } }
    if (!cmt) continue // reikia prasmingo komentaro (ne URL / ne per trumpo)
    norm.push({ kind: 'diskusija', title: cleanCoTitle(d.title), href: `/diskusijos/${d.slug || d.id}`, cover: d.artist_image, author: cmtA, avatar: cmtAv, cmt, comments: d.comment_count || 0, likes: null, date: d.last_comment_at || d.created_at })
  }
  // Įvairiai: 1 muzikos apžvalga + 1 koncerto apžvalga + 1 topas + 2 diskusijos, rikiuota pagal datą.
  const muz = norm.filter((n) => n.kind === 'muzika').slice(0, 1)
  const konc = norm.filter((n) => n.kind === 'koncertas').slice(0, 1)
  const top = norm.filter((n) => n.kind === 'topas').slice(0, 1)
  const dis = norm.filter((n) => n.kind === 'diskusija').slice(0, 2)
  const stream = [...muz, ...konc, ...top, ...dis].sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0)).slice(0, 5)

  return (
    <aside className="v2-side">
      <div className="v2-comm-panel">
        <div className="v2-side-headrow">
          <div className="v2-side-head"><span className="v2-side-dot" />Kas naujo?</div>
          <CommunityIcons />
        </div>
        <div className="v2-dd-embed v2-feed-sec"><DienosDainaSection variant="list" /></div>

        {stream.length > 0 && (
          <div className="v2-feed-sec">
            <h3 className="v2-cstream-head">Naujausi įrašai</h3>
            <div className="v2-cstream">
              {stream.map((n, i) => <CRow key={i} n={n} />)}
            </div>
          </div>
        )}

        <Link href="/bendruomene" className="v2-clink v2-feed-more">Daugiau bendruomenėje →</Link>
      </div>
    </aside>
  )
}

/* ─────────────── KONCERTAI (afiša 1:1) ─────────────── */
function Koncertai({ events, verta }: { events: any[]; verta: any[] }) {
  const filtEvt = events || []
  const cardCls = "group relative flex aspect-[3/4] w-[188px] shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] no-underline shadow-[0_5px_14px_rgba(0,0,0,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)] hover:shadow-[0_14px_30px_rgba(249,115,22,0.18)] lg:w-auto"
  const capCls = "border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-2"
  const scoreOf = (e: any) => Math.max(0, ...(e.event_artists || []).map((ea: any) => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return a?.score || 0 }))
  const all = [...filtEvt].sort((x, y) => new Date((x.start_date || x.event_date || 0) as any).getTime() - new Date((y.start_date || y.event_date || 0) as any).getTime())
  const foreign = verta || []
  // 2 pilnos eilės (10 kortelių) — imam su vizualu, populiaresni pirmiau, bet neapkarpom iki kelių.
  const hasImg = (e: any) => !!e.cover_image_url || (e.event_artists || []).some((ea: any) => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return !!a?.cover_image_url })
  const withImg = all.filter(e => !e.is_abroad && hasImg(e))
  const prio = withImg.filter(e => e.is_festival || e.is_featured || scoreOf(e) >= 10)
  const rest = withImg.filter(e => !(e.is_festival || e.is_featured || scoreOf(e) >= 10))
  const main = [...prio, ...rest].slice(0, foreign.length ? 9 : 10)

  const cards: React.ReactNode[] = main.map((ev: any) => {
    const dateRaw = ev.start_date || ev.event_date
    const d = dateRaw ? new Date(dateRaw) : null
    const dayNum = d && !isNaN(d.getTime()) ? d.getDate() : null
    const monthLbl = d && !isNaN(d.getTime()) ? MONTHS_LT[d.getMonth()] : null
    const eas = (ev.event_artists || []).map((ea: any) => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return a ? { ...a, is_headliner: ea.is_headliner, sort_order: ea.sort_order } : null }).filter(Boolean) as any[]
    const ranked = [...eas].sort((p, q) => (q.is_headliner ? 1 : 0) - (p.is_headliner ? 1 : 0) || ((p.sort_order ?? 99) - (q.sort_order ?? 99)))
    const photos = ranked.filter((a: any) => a.cover_image_url)
    const adminCover = ev.cover_image_url
    const useCollage = !adminCover && photos.length >= 2
    const singleImg = adminCover || photos[0]?.cover_image_url || null
    const flag = countryFlag(ranked.find((a: any) => a.country)?.country)
    const city = ev.city || ev.venues?.city || ''
    const artistList = eas.filter((a: any) => a.name).map((a: any) => a.name)
    const title = ev.is_festival ? sanitizeTitle(ev.title) : artistList.length > 0 ? artistList.slice(0, 2).join(', ') + (artistList.length > 2 ? ` +${artistList.length - 2}` : '') : sanitizeTitle(ev.title)
    const smalls = photos.slice(1, 3)
    return (
      <Link key={ev.id} href={eventHref({ title: ev.title, slug: ev.slug, legacy_id: ev.legacy_id })} className={cardCls}>
        <div className="relative flex-1 overflow-hidden">
          {useCollage ? (
            <div className="grid h-full w-full grid-cols-2 grid-rows-[3fr_2fr] gap-px">
              <div className="col-span-2 bg-cover bg-top" style={{ backgroundImage: `url(${proxyImgResized(photos[0].cover_image_url!, 480)})` }} />
              {smalls.map((a: any, idx: number) => <div key={idx} className={`bg-cover bg-top ${smalls.length === 1 ? 'col-span-2' : ''}`} style={{ backgroundImage: `url(${proxyImgResized(a.cover_image_url!, 320)})` }} />)}
            </div>
          ) : singleImg ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxyImgResized(singleImg, 64)} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxyImgResized(singleImg, 640)} alt={title} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]" />
            </>
          ) : <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>}
          {dayNum && (
            <span className="absolute left-2 top-2 flex flex-col items-center rounded-lg bg-white px-2 py-1 leading-none shadow-[0_3px_10px_rgba(0,0,0,0.3)]">
              <b className="font-['Outfit',sans-serif] text-[16px] font-black text-[#10203a]">{dayNum}</b>
              <i className="mt-0.5 not-italic text-[12px] font-extrabold uppercase tracking-[0.04em] text-[var(--accent-orange)]">{monthLbl}</i>
            </span>
          )}
        </div>
        {isFresh24(ev.created_at) && <FreshDot right={8} top={8} />}
        <div className={capCls}>
          {city && <p className="m-0 truncate font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]">{city}</p>}
          <h3 className="m-0 mt-0.5 flex items-start gap-1 font-['Outfit',sans-serif] text-[14px] font-black leading-tight text-[var(--text-primary)]">
            {flag && <span className="shrink-0 text-[14px] leading-tight">{flag}</span>}
            <span className="line-clamp-2">{title}</span>
          </h3>
        </div>
      </Link>
    )
  })

  if (foreign.length) {
    const fImgs = foreign.map((c: any) => c.image).filter(Boolean).slice(0, 6) as string[]
    cards.push(
      <Link key="abroad" href="/verta-keliones" className={cardCls}>
        <div className="relative flex-1 overflow-hidden bg-[#15203a]">
          <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-px">
            {fImgs.map((src, i) => <div key={i} className="bg-cover bg-top" style={{ backgroundImage: `url(${proxyImgResized(src, 320)})` }} />)}
          </div>
        </div>
        <div className={capCls}>
          <p className="m-0 font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]">Užsienis</p>
          <h3 className="m-0 mt-0.5 font-['Outfit',sans-serif] text-[14px] font-black leading-tight text-[var(--text-primary)]">Koncertai, verti kelionės</h3>
          <p className="m-0 mt-1 font-['Outfit',sans-serif] text-[12px] font-bold text-[var(--accent-orange)]">Daugiau →</p>
        </div>
      </Link>
    )
  }
  if (cards.length === 0) return null
  return (
    <section style={{ marginTop: 'var(--page-section-gap)' }}>
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 font-['Outfit',sans-serif] text-[20px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">Koncertai</h2>
          <Link href="/koncertai" className="font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70">Daugiau →</Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-x-visible lg:pb-0">{cards}</div>
      </div>
    </section>
  )
}

/* ─────────────── ISTORIJA ─────────────── */
function HistBig({ h, meta, round }: { h: any; meta: string; round?: boolean }) {
  return (
    <Link href={h.href} className={`v2-hbig${round ? ' round' : ''}`}>
      <span className="v2-hbig-cov">{h.cover
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={proxyImgResized(h.cover, 160)} alt="" loading="lazy" /> : <span className="v2-hbig-ph">{h.emoji || (round ? '🎤' : '♪')}</span>}</span>
      <span className="v2-hbig-txt"><b>{h.title}</b><span>{h.subtitle || h.artist || ''}</span>{meta && <span className="v2-hbig-meta">{meta}</span>}</span>
    </Link>
  )
}
function Istorija({ items }: { items: any[] }) {
  const all = items || []
  const byPop = (a: any, b: any) => (b.pop ?? 0) - (a.pop ?? 0) || (b.score ?? 0) - (a.score ?? 0)
  const byScore = (a: any, b: any) => (b.score ?? 0) - (a.score ?? 0)
  const albums = [...all.filter((h) => h.type === 'album_anniversary')].sort(byPop).slice(0, 2)
  const births = [...all.filter((h) => h.type === 'birthday')].sort(byScore).slice(0, 2)
  const deaths = [...all.filter((h) => h.type === 'death_anniversary')].sort(byScore).slice(0, 2)
  if (!albums.length && !births.length && !deaths.length) return null
  const yr = new Date().getFullYear()
  const Col = ({ icon, title, list, metaFn, round }: { icon: string; title: string; list: any[]; metaFn: (h: any) => string; round?: boolean }) => (
    list.length === 0 ? null : (
      <div className={`v2-hcol${round ? ' people' : ''}`}>
        <div className="v2-hcol-h">{icon} {title}</div>
        {list.map((h: any) => <HistBig key={h.id} h={h} meta={metaFn(h)} round={round} />)}
        <Link href="/istorija" className="v2-clink">Daugiau →</Link>
      </div>
    )
  )
  return (
    <section style={{ marginTop: 'var(--page-section-gap)' }}>
      <div className="v2-mh"><h2>Šiandien muzikos istorijoje</h2></div>
      <div className="v2-hcols3">
        <Col icon="💿" title="Išleisti albumai" list={albums} metaFn={(h) => h.year ? `prieš ${yr - h.year} m.` : ''} />
        <Col icon="🎂" title="Gimę" list={births} metaFn={(h) => h.age ? `${h.age} m.` : ''} round />
        <Col icon="🕯️" title="Netektys" list={deaths} metaFn={(h) => h.year ? `${yr - h.year} m.` : ''} round />
      </div>
    </section>
  )
}

/* ─────────────── Žaidimų zona + aktyviausi nariai ─────────────── */
const GAMES = [
  { href: '/zaidimai/dienos-issukis', emoji: '🎯', title: 'Dienos iššūkis', sub: 'Kasdienė viktorina · ×2 taškai', grad: 'linear-gradient(135deg,#fb923c,#c2410c)' },
  { href: '/zaidimai/gilyn', emoji: '🗺️', title: 'Gilyn', sub: '20 albumų atradimų žaidimas', grad: 'linear-gradient(135deg,#60a5fa,#1e40af)' },
  { href: '/zaidimai/vadybininkas', emoji: '📈', title: 'Vadybininkas', sub: 'Fantasy — sudaryk komandą', grad: 'linear-gradient(135deg,#4ade80,#15803d)' },
  { href: '/zaidimai/koncertas', emoji: '🎤', title: 'Koncertas', sub: 'Atspėk iš pasirodymo', grad: 'linear-gradient(135deg,#c084fc,#6d28d9)' },
  { href: '/zaidimai/gaudykle', emoji: '🕹️', title: 'Gaudyklė', sub: 'Refleksų žaidimas', grad: 'linear-gradient(135deg,#f472b6,#be185d)' },
  { href: '/zaidimai', emoji: '🎮', title: 'Visi žaidimai', sub: 'Daugiau →', grad: 'linear-gradient(135deg,#94a3b8,#334155)' },
]
function GamesZone({ members }: { members: any[] }) {
  const top = (members || []).slice(0, 6)
  return (
    <section className="v2-gz" style={{ marginTop: 'var(--page-section-gap)' }}>
      <div className="v2-gz-games">
        <div className="v2-mh"><h2>Žaidimai</h2><Link href="/zaidimai" className="v2-chip">Visi →</Link></div>
        <div className="v2-games-grid">
          {GAMES.map((g) => (
            <Link key={g.href} href={g.href} className="v2-game">
              <span className="v2-game-head" style={{ background: g.grad }}><span className="v2-game-emoji">{g.emoji}</span></span>
              <span className="v2-game-body">
                <b>{g.title}</b>
                <span className="v2-game-sub">{g.sub}</span>
                <span className="v2-game-cta">Žaisti →</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
      {top.length > 0 && (
        <div className="v2-gz-members">
          <div className="v2-mh"><h2>Savaitės lyderiai</h2></div>
          <div className="v2-cw">
            {top.map((m: any, i: number) => (
              <Link key={m.user_id || i} href={m.username ? `/vartotojas/${m.username}` : '/nariai'} className="v2-mem">
                <span className={`v2-mem-rank${i < 3 ? ' top' : ''}`}>{i + 1}</span>
                <span className="v2-mem-av">{m.avatar
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={proxyImgResized(m.avatar, 72)} alt="" loading="lazy" /> : <span>{(m.name || m.username || '?')[0]}</span>}</span>
                <span className="v2-mem-txt"><b>{m.username ? `@${m.username}` : m.name}</b></span>
                {typeof m.total === 'number' && <span className="v2-mem-pts">{m.total}</span>}
              </Link>
            ))}
            <Link href="/nariai" className="v2-clink">Visi nariai →</Link>
          </div>
        </div>
      )}
    </section>
  )
}

/* ─────────────── PAGE ─────────────── */
export default async function V2Page() {
  const [musicPool, upcomingR, newsR, eventsR, vertaR, istorijaR, feedR, membersR, gilynR, disksR] = await Promise.all([
    getMusicPool(),
    jget('/api/home/list?type=upcoming&limit=100', 8000),
    jget('/api/news?limit=10&include=songs&since_days=21'),
    jget('/api/events?homepage=1&compact=1&limit=24&period=all&order=asc'),
    jget('/api/verta-keliones'),
    jget('/api/istorija/today'),
    jget('/api/atradimai/feed?nodedup=1&exclude_type=creation,translation,quick&limit=20', 8000),
    jget('/api/atradimai/active-members'),
    jget('/api/zaidimai/gilyn', 8000),
    jget('/api/diskusijos/recent?limit=15', 6000),
  ])
  const members: any[] = membersR?.members ?? []
  const gilynBox: any[] = gilynR?.box ?? []

  const upcomingRaw: any[] = (upcomingR?.items ?? []) as any[]
  const daysUntil = (a: any) => { if (!a.year || !a.month) return 9999; const d = new Date(a.year, a.month - 1, a.day ?? 15); return Math.round((d.getTime() - Date.now()) / 86_400_000) }
  const hasCov = (a: any) => a.cover_image_url || a.artists?.cover_image_url
  let upcomingSoon: any[] = upcomingRaw.map((a) => ({ ...a, _d: daysUntil(a) }))
    .filter((a) => a._d >= 0 && a._d <= 30 && (a.artists?.score ?? 0) >= 20 && hasCov(a))
    .sort((x, y) => (y.artists?.score ?? 0) - (x.artists?.score ?? 0))
  if (upcomingSoon.length < 4) {
    upcomingSoon = upcomingRaw.map((a) => ({ ...a, _d: daysUntil(a) }))
      .filter((a) => a._d >= 0 && a._d <= 60 && hasCov(a))
      .sort((x, y) => (y.artists?.score ?? 0) - (x.artists?.score ?? 0))
  }
  upcomingSoon = upcomingSoon.slice(0, 10)
  const events: any[] = eventsR?.events ?? []
  const verta: any[] = vertaR?.concerts ?? []
  const istorija: any[] = istorijaR?.items ?? []
  const feedPosts: any[] = feedR?.posts ?? []
  const disks: any[] = disksR?.items ?? []

  const news: any[] = newsR?.news ?? []
  const newsSlides: Slide[] = news.filter((n) => n.image_title_url || n.image_small_url).slice(0, 6).map((n) => ({ href: `/naujienos/${n.slug}`, bgImg: n.image_title_url || n.image_small_url, chip: null, chipBg: 'var(--accent-orange)', title: sanitizeTitle(n.title), fresh: isFresh24(n.published_at) }))
  const eventSlides: Slide[] = events.filter((e) => e.cover_image_url || (e.event_artists || []).some((ea: any) => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return a?.cover_image_url })).slice(0, 3).map((e) => {
    const a0 = (e.event_artists || []).map((ea: any) => Array.isArray(ea.artists) ? ea.artists[0] : ea.artists).find((a: any) => a?.cover_image_url)
    const dt = e.start_date ? new Date(e.start_date) : null
    const dateLbl = dt && !isNaN(dt.getTime()) ? `${dt.getDate()} ${MONTHS_LT[dt.getMonth()]}` : ''
    const city = e.city || e.venues?.city || ''
    return { href: eventHref({ title: e.title, slug: e.slug, legacy_id: e.legacy_id }), bgImg: e.cover_image_url || a0?.cover_image_url || null, chip: 'Renginys', chipBg: 'var(--accent-blue)', title: sanitizeTitle(e.title), subtitle: [city, dateLbl].filter(Boolean).join(' · ') }
  })
  const slides: Slide[] = []
  newsSlides.forEach((s, i) => { slides.push(s); if (i === 1 && eventSlides[0]) slides.push(eventSlides[0]); if (i === 3 && eventSlides[1]) slides.push(eventSlides[1]) })
  if (eventSlides[2]) slides.push(eventSlides[2])

  const upcomingItems = upcomingSoon.slice(0, 10).map((a: any) => ({
    id: a.id,
    href: a.slug && a.artists?.slug ? `/albumai/${a.artists.slug}-${a.slug}-${a.id}` : '/albumai',
    cover: proxyImgResized(a.cover_image_url || a.artists?.cover_image_url, 400) || null,
    name: a.artists?.name || a.title,
    isLt: isLtCountry(a.artists?.country),
    genres: (a.genres || []) as string[],
    score: a.artists?.score ?? 0,
  }))

  return (
    <div className="v2-shell">
      <style>{muzikaStyles}</style>
      <style>{V2_EXTRA}</style>

      <HeroCarousel slides={slides} />

      <div className="v2-split">
        <div className="v2-main">
          <MusicPool
            tracks={musicPool.tracks}
            albums={musicPool.albums}
            genres={musicPool.genres}
            upcoming={upcomingItems}
            upcomingMore={Math.max(1, (upcomingR?.total ?? upcomingRaw.length) - 6)}
          />
        </div>

        <CommunityRail posts={feedPosts} disks={disks} />
      </div>

      <Koncertai events={events} verta={verta} />
      {gilynBox.length > 0 && (
        <section style={{ marginTop: 'var(--page-section-gap)' }}>
          <div className="v2-rub"><h2>Atrask muziką</h2></div>
          <div className="v2-atrad">
            <div className="v2-atrad-txt">
              <p className="v2-atrad-lead">Šios dienos pasiūlymai — versk plokšteles ir pasirink, nuo ko pradėti klausytis.</p>
              <Link href="/zaidimai/gilyn" className="v2-atrad-cta">Atrasti visas →</Link>
            </div>
            <div className="v2-atrad-crate"><GilynCrate box={gilynBox} /></div>
          </div>
        </section>
      )}
      <Istorija items={istorija} />
      <GamesZone members={members} />
    </div>
  )
}

const V2_EXTRA = `
.v2-shell{max-width:var(--page-max);margin:0 auto;padding:var(--page-pad-top) var(--page-pad-x) var(--page-pad-bottom);overflow-x:clip}
.v2-shell a{color:inherit;text-decoration:none}

/* sekcijos antraštė + filtrai */
.v2-mh{display:flex;align-items:center;gap:12px 14px;margin-bottom:4px;flex-wrap:wrap}
.v2-mh h2{font-family:'Outfit',sans-serif;font-weight:800;letter-spacing:-.02em;font-size:20px;line-height:1.1;color:var(--text-primary);margin:0}
.v2-chips{margin-left:auto;display:flex;gap:6px;align-items:center;max-width:100%;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.v2-chips::-webkit-scrollbar{display:none}
.v2-chip{border:1px solid var(--border-default);background:transparent;color:var(--text-secondary);border-radius:var(--radius-pill);padding:5px 12px;font-family:'Outfit',sans-serif;font-size:12.5px;font-weight:700;white-space:nowrap;flex:none}
.v2-chip.on{background:var(--text-primary);color:var(--bg-body);border-color:var(--text-primary)}
.v2-chip:hover{border-color:rgba(249,115,22,.45)}
@media(max-width:560px){.v2-mh{gap:8px}.v2-mh h2{flex:1 0 auto}}
/* subtilus filtro link'as (ne juodas chip'as) */
.v2-mh-filter{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;color:var(--text-muted);flex:none}
.v2-mh-filter:hover{color:var(--accent-orange)}
.v2-mh-filter svg{opacity:.8}

/* greitai pasirodys — data badge ant nuotraukos */
.v2-soon-badge{position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.62);color:#fff;font-size:10px;font-weight:800;border-radius:6px;padding:2px 7px;backdrop-filter:blur(3px)}

/* bendruomenės įrašas — kompaktiškas (badge+username eilutėj) */
.v2-feat2{display:block}
/* sekcijos viename „Kas naujo?" bokse — atskirtos plona linija */
.v2-comm-panel>.v2-feed-sec+.v2-feed-sec{border-top:1px solid var(--card-border-subtle);padding-top:14px}
.v2-feed-more{display:inline-block;margin-top:2px}
/* bendruomenės kortelės — erdvios, su rėmeliu, didesnis viršelis */
.v2-cstream-head{margin:0 0 12px;font-family:'Outfit',sans-serif;font-weight:800;font-size:16px;letter-spacing:-.01em;color:var(--text-primary)}
.v2-cstream{display:flex;flex-direction:column;gap:12px}
.v2-crow{display:flex;gap:13px;align-items:flex-start;padding:13px;border:1px solid var(--card-border-default);border-radius:14px;background:var(--card-surface);text-decoration:none;transition:border-color .15s}
.v2-crow:hover{border-color:rgba(249,115,22,.4)}
.v2-crow-cov{width:72px;height:72px;flex:none;border-radius:11px;overflow:hidden;background:var(--bg-elevated)}
.v2-crow-cov img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
.v2-crow:hover .v2-crow-cov img{transform:scale(1.05)}
.v2-crow-body{min-width:0;flex:1;display:flex;flex-direction:column}
.v2-crow-title{font-family:'Outfit',sans-serif;font-weight:800;font-size:15px;line-height:1.3;color:var(--text-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.v2-crow:hover .v2-crow-title{color:var(--accent-orange)}
.v2-crow-cmt2{font-size:13px;line-height:1.45;color:var(--text-muted);margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.v2-crow-meta{display:flex;align-items:center;gap:6px;min-width:0;margin-top:9px}
.v2-crow-au-n{font-size:12.5px;font-weight:600;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v2-crow-av{width:17px;height:17px;border-radius:50%;object-fit:cover;flex:none}
.v2-crow-av-ph{display:flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;background:var(--bg-active);font-size:9px;font-weight:800;color:var(--text-faint);flex:none}
.v2-crow-eng{margin-left:auto;display:flex;align-items:center;gap:10px;flex:none;padding-left:8px}
.v2-crow-eng-i{display:flex;align-items:center;gap:3px;font-size:12px;font-weight:700;color:var(--text-faint)}
/* Atrask muziką — atskira sekcija po koncertais (horizontalus card'as) */
.v2-atrad{display:flex;align-items:center;gap:26px;padding:18px 20px;border:1px solid var(--border-default);border-radius:var(--radius-2xl);background:var(--bg-elevated)}
.v2-atrad-txt{flex:1;min-width:0}
.v2-atrad-lead{font-size:14px;color:var(--text-secondary);line-height:1.5;margin:0 0 10px;max-width:440px}
.v2-atrad-cta{font-family:'Outfit',sans-serif;font-weight:800;font-size:13.5px;color:var(--accent-orange)}
.v2-atrad-cta:hover{opacity:.75}
.v2-atrad-crate{flex:none;width:min(320px,50%)}
@media(max-width:640px){.v2-atrad{flex-direction:column;align-items:stretch;gap:16px}.v2-atrad-crate{width:100%}}
.v2-feat2-top{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.v2-feat2-kind{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#fff;background:var(--accent-blue);border-radius:5px;padding:2px 7px}
.v2-feat2-author{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text-secondary);margin-left:auto}
.v2-feat2-av{width:20px;height:20px;border-radius:50%;object-fit:cover}
.v2-feat2-body{display:flex;gap:11px}
.v2-feat2-cov{width:66px;height:66px;border-radius:9px;overflow:hidden;flex:none;background:var(--bg-elevated)}
.v2-feat2-cov img{width:100%;height:100%;object-fit:cover;display:block}
.v2-feat2-txt{min-width:0;display:flex;flex-direction:column}
.v2-feat2-txt b{font-family:'Outfit',sans-serif;font-weight:700;font-size:14px;color:var(--text-primary);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.v2-feat2:hover .v2-feat2-txt b{color:var(--accent-orange)}
.v2-feat2-ex{font-size:12px;color:var(--text-muted);line-height:1.4;margin-top:4px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

/* Gilyn atradimų zona + interaktyvi dėžė */
.v2-gilyn-zone{display:grid;grid-template-columns:1fr 1fr;gap:26px;align-items:center;background:linear-gradient(135deg,rgba(59,130,246,.08),transparent 60%),var(--card-surface);border:1px solid var(--card-border-default);border-radius:var(--radius-2xl);padding:22px 24px}
.v2-gz-lead{color:var(--text-secondary);font-size:14px;line-height:1.5;margin:6px 0 14px;max-width:38ch}
.v2-gc{margin-top:2px}
.v2-gc-stage{display:flex;align-items:center;gap:8px;justify-content:space-between}
.v2-gc-nav{flex:none;width:30px;height:30px;border-radius:50%;border:1px solid var(--border-default);background:var(--card-surface);color:var(--text-secondary);font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
.v2-gc-nav:hover{border-color:var(--accent-orange);color:var(--accent-orange)}
.v2-gc-cover{flex:1;max-width:132px;margin:0 auto;aspect-ratio:1;border-radius:10px;overflow:hidden;display:block;box-shadow:0 8px 20px rgba(0,0,0,.28)}
.v2-gc-cover img{width:100%;height:100%;object-fit:cover;display:block}
.v2-gc-cap{margin-top:10px;text-align:center;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v2-gc-cap b{font-family:'Outfit',sans-serif;font-weight:700;color:var(--text-primary)}
.v2-gc-cap span{color:var(--text-muted)}
.v2-gc-row{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
.v2-gc-meta{font-size:11.5px;color:var(--text-faint)}
.v2-gc-cta{font-family:'Outfit',sans-serif;font-weight:800;font-size:12.5px;color:var(--accent-link)}

/* istorija — 3 skiltys, po 2 didesniu formatu */
.v2-hcols3{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.v2-hbig{display:flex;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--card-border-subtle)}
.v2-hbig:last-of-type{border-bottom:none}
.v2-hbig-cov{width:60px;height:60px;border-radius:10px;overflow:hidden;flex:none;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center}
.v2-hbig-cov img{width:100%;height:100%;object-fit:cover;display:block}
.v2-hbig-ph{font-size:22px;opacity:.5}
.v2-hbig-txt{min-width:0;display:flex;flex-direction:column}
.v2-hbig-txt b{font-family:'Outfit',sans-serif;font-weight:700;font-size:14px;color:var(--text-primary);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-hbig-txt>span{font-size:12.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-hbig-meta{font-size:11px;color:var(--text-faint);font-weight:700;margin-top:2px}
@media(max-width:760px){.v2-hcols3{grid-template-columns:1fr;gap:20px}.v2-gilyn-zone{grid-template-columns:1fr;gap:18px}}
.v2-msub{font-family:'Outfit',sans-serif;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-faint);margin:14px 0 9px}

/* albumo (kvadratas) + dainos (16:9) kortelės — kompaktiškos, responsive */
.v2-cc{display:block;width:clamp(116px,32vw,136px);flex:none}
.v2-cc-img{position:relative;display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:1;border-radius:11px;overflow:hidden;background:var(--bg-elevated)}
.v2-tc{display:block;width:clamp(150px,44vw,176px);flex:none}
.v2-tc-img{position:relative;display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:var(--bg-elevated)}
.v2-cc-img img,.v2-tc-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
.v2-cc:hover .v2-cc-img img,.v2-tc:hover .v2-tc-img img{transform:scale(1.05)}
.v2-cc-ph{font-size:26px;color:rgba(255,255,255,.14)}
.v2-cc-t{display:block;font-family:'Outfit',sans-serif;font-weight:700;font-size:14px;margin-top:7px;color:var(--text-primary);line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v2-cc:hover .v2-cc-t,.v2-tc:hover .v2-cc-t{color:var(--accent-orange)}
.v2-cc-s{display:block;font-size:12.5px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* ── Muzikos pool'as: /topai stiliaus filtrų juosta + auto-fill grid ── */
.v2-mpool{min-width:0}
.v2-mf{display:flex;align-items:center;gap:10px;margin-bottom:18px;font-family:'Outfit',sans-serif;min-width:0}
.v2-mf-scroll{display:flex;align-items:center;gap:10px;min-width:0}
.v2-mf-grp{display:flex;align-items:center;gap:8px}
.v2-mf-chip{display:inline-flex;align-items:center;gap:7px;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600;line-height:1;white-space:nowrap;background:var(--bg-hover);border:1px solid var(--border-default);color:var(--text-secondary);cursor:pointer;transition:color .15s,border-color .15s,background .15s}
.v2-mf-chip:hover{color:var(--text-primary);border-color:var(--accent-orange)}
.v2-mf-chip.on{background:var(--accent-orange);border-color:var(--accent-orange);color:#fff}
.v2-mf-chip svg{display:block}
.v2-mf-flag{width:20px;height:14px;flex:none;border-radius:3px;background-size:cover;background-position:center;box-shadow:0 0 0 1px rgba(0,0,0,.08);background-image:url(https://flagcdn.com/w40/lt.png)}
.v2-mf-divider{width:1px;height:22px;background:var(--border-default);flex:none;margin:0 2px}
.v2-mf-dd{position:relative;flex:none}
.v2-mf-icon{display:inline-flex;align-items:center;justify-content:center;padding:7px 11px;border-radius:999px;background:var(--bg-hover);border:1px solid var(--border-default);color:var(--text-secondary);cursor:pointer;line-height:1;transition:color .15s,border-color .15s}
.v2-mf-icon:hover{color:var(--text-primary);border-color:var(--accent-orange)}
.v2-mf-icon.on,.v2-mf-icon.open{color:var(--accent-orange);border-color:var(--accent-orange)}
.v2-mf-pop{position:absolute;top:calc(100% + 8px);right:0;z-index:50;min-width:190px;max-height:320px;overflow:auto;display:none;flex-direction:column;gap:2px;padding:7px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.18)}
.v2-mf-pop.open{display:flex}
.v2-mf-opt{display:flex;align-items:center;width:100%;padding:8px 11px;border-radius:9px;font-size:13px;font-weight:600;font-family:'Outfit',sans-serif;text-align:left;white-space:nowrap;background:transparent;border:1px solid transparent;color:var(--text-secondary);cursor:pointer}
.v2-mf-opt:hover{background:var(--bg-hover);color:var(--text-primary)}
.v2-mf-opt.on{color:var(--accent-orange)}
/* Subtilus sekcijos skirtukas (vietoj didelio h2): ikona + mažas užrašas + linija */
.v2-msec{display:flex;align-items:center;gap:9px;margin:0 0 13px}
.v2-msec-ic{color:var(--accent-orange);flex:none}
.v2-msec-lbl{font-family:'Outfit',sans-serif;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint);flex:none}
.v2-msec-rule{flex:1;height:1px;background:var(--card-border-subtle)}
.v2-mgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px 14px}
.v2-mgrid-cc{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:18px 16px}
.v2-mgrid>.v2-tc,.v2-mgrid>.v2-cc{width:auto}
.v2-mbadge{position:absolute;left:7px;top:7px;z-index:2;padding:3px 7px;border-radius:7px;font-family:'Outfit',sans-serif;font-size:10.5px;font-weight:700;color:#fff;background:rgba(0,0,0,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);letter-spacing:.01em}
.v2-mscore{position:absolute;right:7px;top:7px;z-index:2;min-width:20px;text-align:center;padding:2px 6px;border-radius:6px;font-family:'Outfit',sans-serif;font-size:11px;font-weight:800;color:#fff;background:rgba(120,120,130,.85);box-shadow:0 1px 4px rgba(0,0,0,.3)}
.v2-mscore.hot{background:rgba(22,163,74,.9)}
.v2-mempty{color:var(--text-muted);font-size:14px;margin:6px 0 0}
.v2-mmore{display:inline-flex;align-items:center;gap:6px;margin-top:14px;padding:9px 18px;border-radius:999px;font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;color:var(--text-secondary);background:var(--bg-hover);border:1px solid var(--border-default);cursor:pointer;transition:color .15s,border-color .15s}
.v2-mmore:hover{color:var(--accent-orange);border-color:var(--accent-orange)}
.v2-mmore span{color:var(--text-faint);font-weight:600}
@media(max-width:980px){
  .v2-mf-scroll{flex:1;overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .v2-mf-scroll::-webkit-scrollbar{display:none}
  .v2-mf-grp,.v2-mf-chip,.v2-mf-divider{flex:0 0 auto}
  .v2-mgrid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}
  .v2-mgrid-cc{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}
}
/* Mobile: sumažinti filtrai, kad viskas tilptų vienoj eilutėj be spūsties */
@media(max-width:560px){
  .v2-mf{gap:7px}
  .v2-mf-scroll{gap:7px}
  .v2-mf-grp{gap:6px}
  .v2-mf-chip{padding:6px 10px;font-size:12px;gap:5px}
  .v2-mf-chip svg{width:13px;height:13px}
  .v2-mf-flag{width:16px;height:11px}
  .v2-mf-divider{height:19px;margin:0}
  .v2-mf-icon{padding:6px 9px}
}

/* šalies juostelė iš kairės — siaura spalvų juosta */
.v2-lane{display:flex;align-items:flex-start;gap:9px;margin-top:12px}
.v2-flagbar{flex:none;width:4px;border-radius:2px;height:86px}
.v2-flagbar.lt{background:linear-gradient(to bottom,#FDB913 0 33.3%,#006A44 33.3% 66.6%,#C1272D 66.6% 100%)}
.v2-flagbar.world{background:transparent}
.v2-flagbar.soon{background:var(--accent-orange)}
.v2-lane-s{flex:1;min-width:0}

/* istorijos tipo žymė ant viršelio */
.v2-hkind{position:absolute;left:6px;bottom:6px;font-size:9.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:2px 6px;border-radius:6px;color:#fff;backdrop-filter:blur(3px)}
.v2-hkind.s{background:rgba(29,78,216,.85)} .v2-hkind.g{background:rgba(22,163,74,.85)} .v2-hkind.d{background:rgba(120,113,108,.9)}

/* split */
.v2-split{display:grid;grid-template-columns:minmax(0,1.9fr) minmax(0,1fr);gap:26px;align-items:start;margin-top:26px;padding-top:22px;border-top:1px solid var(--border-subtle)}
.v2-main{min-width:0}
.v2-side{display:flex;flex-direction:column;gap:16px}
/* bendruomenės panelis — neutralus atskyrimas (be oranžinio tint'o) */
.v2-comm-panel{display:flex;flex-direction:column;gap:14px;padding:16px 15px;border-radius:var(--radius-2xl);
  background:var(--bg-elevated);border:1px solid var(--border-default)}
.v2-side-headrow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:-2px 0 0;padding-bottom:12px;border-bottom:1px solid var(--card-border-subtle)}
.v2-side-head{display:flex;align-items:center;gap:8px;font-family:'Outfit',sans-serif;font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint)}
.v2-side-dot{width:7px;height:7px;border-radius:50%;background:var(--accent-green);flex:none}
/* bendruomenės antraštės ikonos (chat + kas vyksta) */
.v2-cicons{display:flex;align-items:center;gap:6px}
.v2-cic{position:relative;display:flex;align-items:center;justify-content:center;gap:5px;width:30px;height:30px;border-radius:9px;border:1px solid var(--border-default);background:var(--bg-surface);color:var(--text-muted);cursor:pointer;transition:color .15s,border-color .15s,background .15s}
.v2-cic-chat{width:auto;padding:0 9px}
.v2-cic-time{font-family:'Outfit',sans-serif;font-size:11px;font-weight:700;color:var(--text-secondary);letter-spacing:0;text-transform:none}
.v2-cic-av{width:16px;height:16px;border-radius:50%;object-fit:cover;flex:none}
.v2-cic:hover{color:var(--accent-orange);border-color:var(--accent-orange);background:var(--bg-hover)}
.v2-cic-dot{position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:var(--accent-orange);border:2px solid var(--bg-elevated)}
.v2-cic-live{position:absolute;top:-3px;right:-3px;width:8px;height:8px;border-radius:50%;background:#22c55e;border:2px solid var(--bg-elevated)}
/* įdėtas tikrasis v1 „Dienos daina" komponentas (stacked/compact) — neišsiplečia už panelio */
.v2-dd-embed{min-width:0}
.v2-dd-embed h2{font-size:16px!important}
.v2-gilyn-card{border-color:var(--border-default);background:var(--bg-elevated)}
.v2-gilyn-sub{font-size:12px;color:var(--text-muted);margin:7px 0 6px;line-height:1.4}
.v2-dd-empty{font-size:13px;color:var(--text-muted);padding:8px 2px}

/* rubrikos antraštė (Lietuva / Pasaulis) */
.v2-rub{display:flex;align-items:center;gap:12px;margin-bottom:6px}
.v2-rub h2{display:flex;align-items:center;gap:9px;font-family:'Outfit',sans-serif;font-weight:800;letter-spacing:-.02em;font-size:22px;line-height:1.1;color:var(--text-primary);margin:0}
.v2-rub-flag{width:16px;height:12px;border-radius:2px;flex:none;display:inline-block}
.v2-rub-flag.lt{background:linear-gradient(to bottom,#FDB913 0 33.3%,#006A44 33.3% 66.6%,#C1272D 66.6% 100%)}
.v2-rub-flag.world{background:radial-gradient(circle at 40% 40%,#60a5fa,#1e40af)}
.v2-subrow{display:flex;align-items:baseline;gap:10px;margin:16px 0 9px}
.v2-subrow>span{font-family:'Outfit',sans-serif;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-faint)}
.v2-sublink{margin-left:auto;font-family:'Outfit',sans-serif;font-weight:700;font-size:12.5px;color:var(--accent-orange)}
.v2-sublink:hover{opacity:.75}
/* greiti filtrai (populiarūs / naujausi / stilius) */
.v2-qf{margin-left:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.v2-qf-link{display:inline-flex;align-items:center;gap:5px;font-family:'Outfit',sans-serif;font-weight:700;font-size:11.5px;color:var(--text-muted);padding:3px 9px;border-radius:999px;border:1px solid var(--border-subtle);background:var(--bg-surface);transition:color .15s,border-color .15s,background .15s;white-space:nowrap}
.v2-qf-link:hover{color:var(--accent-orange);border-color:var(--accent-orange);background:var(--bg-hover)}
.v2-qf-link svg{width:12px;height:12px;flex:none}
@media(max-width:600px){.v2-qf-txt{display:none}.v2-qf-link{padding:5px}}

/* greitai pasirodys — collage su pavadinimu ant nuotraukos */
.v2-upc2{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.v2-upc2-cell{position:relative;display:block;border-radius:11px;overflow:hidden;aspect-ratio:1;background:var(--bg-elevated)}
.v2-upc2-cell.big{grid-column:span 2;grid-row:span 2}
.v2-upc2-cell img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
.v2-upc2-cell:hover img{transform:scale(1.05)}
.v2-upc2-grad{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.8) 0%,rgba(0,0,0,.22) 42%,transparent 66%)}
.v2-upc2-name{position:absolute;left:9px;right:9px;bottom:8px;color:#fff;font-family:'Outfit',sans-serif;font-weight:800;font-size:12px;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v2-upc2-cell.big .v2-upc2-name{font-size:16px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.v2-upc2-more{display:flex;align-items:center;justify-content:center;background:var(--bg-hover);border:1px dashed var(--border-default)}
.v2-upc2-more span{font-family:'Outfit',sans-serif;font-weight:800;font-size:12.5px;color:var(--accent-orange);text-align:center;padding:6px;line-height:1.2}
@media(max-width:560px){.v2-upc2{grid-template-columns:repeat(3,1fr)}}

/* interaktyvus hero */
.v2-hero{margin-bottom:2px}
.v2-hero-wrap{position:relative}
.v2-htrack{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:2px}
.v2-htrack::-webkit-scrollbar{display:none}
.v2-hslot{flex:none;width:min(560px,86vw);scroll-snap-align:start}
.v2-hcard{position:relative;display:block;aspect-ratio:16/9;border-radius:16px;overflow:hidden;border:1px solid var(--border-default);background:linear-gradient(135deg,#141b28,#0a0e17)}
.v2-hcard-img{position:absolute;inset:0;overflow:hidden}
.v2-hcard-img img{width:100%;height:100%;object-fit:cover;object-position:center 25%;display:block;transition:transform .5s ease}
.v2-hcard:hover .v2-hcard-img img{transform:scale(1.045)}
.v2-hcard-chip{position:absolute;left:14px;top:14px;z-index:2;font-family:'Outfit',sans-serif;font-size:12px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#fff;border-radius:6px;padding:4px 9px}
.v2-hcard-scrim{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.85),rgba(0,0,0,.3) 40%,transparent 70%)}
.v2-hcard-body{position:absolute;left:0;right:0;bottom:0;padding:22px}
.v2-hcard-title{font-family:'Outfit',sans-serif;font-weight:900;font-size:28px;line-height:1.08;letter-spacing:-.02em;color:#fff;max-width:460px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.v2-hcard-sub{display:flex;align-items:center;gap:6px;margin-top:8px;font-family:'Outfit',sans-serif;font-weight:600;font-size:14px;color:rgba(255,255,255,.85)}
.v2-hero-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:4;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.55);color:#fff;font-size:22px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s}
.v2-hero-wrap:hover .v2-hero-arrow{opacity:1}
.v2-hero-arrow.left{left:8px} .v2-hero-arrow.right{right:8px}
.v2-hero-arrow:hover{background:rgba(0,0,0,.8)}
/* „Daugiau naujienų" dashed kortelė (kaip v1) */
.v2-hslot-more .v2-hmore{aspect-ratio:16/9;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;border:1px dashed var(--border-strong);border-radius:16px;background:var(--bg-surface);text-decoration:none;transition:border-color .2s}
.v2-hslot-more .v2-hmore:hover{border-color:var(--accent-orange)}
.v2-hmore-ic{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;border:1px solid var(--border-strong);color:var(--text-muted);transition:color .2s,border-color .2s}
.v2-hslot-more .v2-hmore:hover .v2-hmore-ic{color:var(--accent-orange);border-color:var(--accent-orange)}
.v2-hmore-t{font-family:'Outfit',sans-serif;font-weight:800;font-size:16px;color:var(--text-primary);transition:color .2s}
.v2-hslot-more .v2-hmore:hover .v2-hmore-t{color:var(--accent-orange)}
.v2-hdots{display:flex;gap:6px;justify-content:center;margin-top:12px}
.v2-hdot{width:7px;height:7px;border-radius:50%;background:var(--border-strong);border:none;padding:0;cursor:pointer;transition:all .2s}
.v2-hdot.on{width:22px;border-radius:4px;background:var(--accent-orange)}
@media(pointer:coarse){.v2-hero-arrow{display:none}}

/* istorija — žmonės apvalūs (atskiria nuo albumų) */
.v2-hcol.people .v2-hbig-cov,.v2-hbig.round .v2-hbig-cov{border-radius:50%}
/* lyderių top-3 rank spalva */
.v2-mem-rank.top{color:var(--accent-orange)}
.v2-cw{background:var(--card-surface);border:1px solid var(--card-border-default);border-radius:var(--radius-xl);padding:15px 16px}
.v2-ch{display:flex;align-items:center;gap:9px;font-family:'Outfit',sans-serif;font-weight:800;font-size:15px;color:var(--text-primary)}
.v2-ch-bar{width:4px;height:16px;border-radius:3px;display:inline-block}
.v2-csub{font-size:11.5px;color:var(--text-muted);margin:9px 0 2px}
.v2-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--card-border-subtle)}
.v2-row:last-of-type{border-bottom:none}
.v2-row-rank{width:16px;text-align:center;font-family:'Outfit',sans-serif;font-weight:800;font-size:13px;color:var(--text-faint);flex:none}
.v2-row-cov{width:38px;height:38px;border-radius:7px;overflow:hidden;background:var(--bg-elevated);flex:none;display:block}
.v2-row-cov img{width:100%;height:100%;object-fit:cover;display:block}
.v2-row-txt{flex:1;min-width:0;display:flex;flex-direction:column}
.v2-row-txt b{font-family:'Outfit',sans-serif;font-weight:600;font-size:13.5px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-row-txt span{font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-row-right{flex:none;font-size:12px;font-weight:700;color:var(--text-secondary)}
.v2-d{font-style:normal;font-weight:800;font-size:11.5px}
.v2-d.u{color:var(--accent-green)} .v2-d.d{color:var(--accent-red)} .v2-d.n{color:var(--accent-orange)} .v2-d.z{color:var(--text-faint)}
.v2-clink{display:inline-block;margin-top:11px;font-family:'Outfit',sans-serif;font-weight:700;font-size:12.5px;color:var(--accent-orange)}

/* bendruomenės highlight eilutė (su viršeliu + autoriumi) */
.v2-hl{display:flex;gap:11px;padding:9px 0;border-bottom:1px solid var(--card-border-subtle)}
.v2-hl:last-of-type{border-bottom:none}
.v2-hl-cov{width:48px;height:48px;border-radius:8px;overflow:hidden;background:var(--bg-elevated);flex:none;display:flex;align-items:center;justify-content:center}
.v2-hl-cov img{width:100%;height:100%;object-fit:cover;display:block}
.v2-hl-ph{font-size:18px;color:rgba(255,255,255,.15)}
.v2-hl-txt{min-width:0;display:flex;flex-direction:column}
.v2-hl-kind{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-faint)}
.v2-hl-txt b{font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;color:var(--text-primary);line-height:1.3;margin-top:1px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.v2-hl:hover .v2-hl-txt b{color:var(--accent-orange)}
.v2-hl-author{font-size:11.5px;color:var(--text-muted);margin-top:2px}

/* Gilyn intro */
.v2-gilyn{display:block;background:linear-gradient(180deg,rgba(29,78,216,.10),transparent),var(--card-surface);border-color:rgba(29,78,216,.28)}
.v2-gilyn-txt{font-size:12.5px;color:var(--text-secondary);line-height:1.45;margin:9px 0 10px}
.v2-gilyn-cta{font-family:'Outfit',sans-serif;font-weight:800;font-size:12.5px;color:var(--accent-link)}

/* Žaidimų zona + nariai */
.v2-gz{display:grid;grid-template-columns:minmax(0,1.9fr) minmax(0,1fr);gap:26px;align-items:start}
.v2-games-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.v2-game{display:flex;flex-direction:column;border-radius:var(--radius-xl);border:1px solid var(--card-border-default);background:var(--card-surface);overflow:hidden;transition:border-color .15s,transform .15s,box-shadow .15s}
.v2-game:hover{border-color:rgba(249,115,22,.45);transform:translateY(-3px);box-shadow:0 12px 26px rgba(0,0,0,.16)}
.v2-game-head{height:74px;display:flex;align-items:center;justify-content:center}
.v2-game-emoji{font-size:34px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))}
.v2-game-body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:2px}
.v2-game-body b{font-family:'Outfit',sans-serif;font-weight:800;font-size:15px;color:var(--text-primary)}
.v2-game-sub{font-size:12px;color:var(--text-muted);line-height:1.35}
.v2-game-cta{font-family:'Outfit',sans-serif;font-weight:700;font-size:12.5px;color:var(--accent-orange);margin-top:6px}
@media(max-width:560px){.v2-games-grid{grid-template-columns:1fr 1fr}}
.v2-mem{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--card-border-subtle)}
.v2-mem:last-of-type{border-bottom:none}
.v2-mem-rank{width:16px;text-align:center;font-family:'Outfit',sans-serif;font-weight:800;font-size:13px;color:var(--text-faint);flex:none}
.v2-mem-av{width:34px;height:34px;border-radius:50%;overflow:hidden;background:var(--bg-elevated);flex:none;display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;font-weight:700;color:var(--text-muted);font-size:13px}
.v2-mem-av img{width:100%;height:100%;object-fit:cover;display:block}
.v2-mem-txt{flex:1;min-width:0;display:flex;flex-direction:column}
.v2-mem-txt b{font-family:'Outfit',sans-serif;font-weight:700;font-size:13.5px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-mem-txt span{font-size:11.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-mem-pts{flex:none;font-family:'Outfit',sans-serif;font-weight:800;font-size:12.5px;color:var(--accent-orange)}

/* dienos daina lyderis (didesnis) */
.v2-dd-lead{display:flex;gap:12px;margin:11px 0 6px;align-items:center}
.v2-dd-cov{position:relative;width:78px;height:78px;border-radius:11px;overflow:hidden;flex:none;background:var(--bg-elevated)}
.v2-dd-cov img{width:100%;height:100%;object-fit:cover;display:block}
.v2-dd-badge{position:absolute;top:5px;left:5px;background:var(--accent-orange);color:#fff;font-family:'Outfit',sans-serif;font-weight:800;font-size:12px;border-radius:6px;padding:1px 6px;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.v2-dd-info{min-width:0;display:flex;flex-direction:column}
.v2-dd-tag{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--accent-orange)}
.v2-dd-info b{font-family:'Outfit',sans-serif;font-weight:800;font-size:16px;color:var(--text-primary);line-height:1.15;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-dd-art{font-size:12.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-dd-votes{font-size:11.5px;color:var(--text-secondary);font-weight:700}
.v2-dd-prop{font-size:11px;color:var(--text-faint);margin-top:3px}
.v2-dd-leadrow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 0 8px;padding-bottom:9px;border-bottom:1px solid var(--card-border-subtle)}
.v2-vote{flex:none;border:1px solid rgba(249,115,22,.4);background:rgba(249,115,22,.12);color:var(--accent-orange);border-radius:var(--radius-pill);width:34px;height:28px;font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center}
.v2-vote:hover{background:rgba(249,115,22,.2)}
.v2-vote.on{background:var(--accent-orange);color:#fff;border-color:var(--accent-orange)}
.v2-vote:disabled{cursor:default}
.v2-row .v2-vote{margin-left:2px}

/* gilyn — vinilų dėžės vizualas (versk) */
.v2-crate{display:flex;align-items:center;justify-content:flex-start;height:118px;margin:10px 0 8px;padding-left:4px}
.v2-crate-lp{flex:none;width:74px;height:74px;border-radius:8px;overflow:hidden;margin-left:-30px;box-shadow:0 6px 16px rgba(0,0,0,.28);border:2px solid var(--card-surface);transform:rotate(-4deg);transition:transform .2s}
.v2-crate-lp:first-child{margin-left:0}
.v2-crate-lp.front{width:104px;height:104px;transform:rotate(0);z-index:30;border-radius:10px}
.v2-crate:hover .v2-crate-lp{transform:rotate(0) translateY(-2px)}
.v2-crate-lp img{width:100%;height:100%;object-fit:cover;display:block}
.v2-crate-cap{margin-top:2px}
.v2-crate-cap b{font-family:'Outfit',sans-serif;font-weight:800;font-size:14px;color:var(--text-primary);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-crate-cap span{font-size:12px;color:var(--text-muted)}

/* greitai pasirodys — varijuojantis collage + atlikėjų vardai */
.v2-upc-cell.big{grid-column:span 2;grid-row:span 2}
.v2-upc-names{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-content:center;gap:7px}
.v2-upc-name{font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;color:var(--text-secondary);background:var(--bg-hover);border:1px solid var(--border-default);border-radius:var(--radius-pill);padding:5px 12px;white-space:nowrap}

/* istorija — 2 stulpeliai (tik svarbiausi) */
.v2-hcols{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.v2-hcol-h{font-family:'Outfit',sans-serif;font-weight:800;font-size:13px;color:var(--text-secondary);margin-bottom:8px}
.v2-hrow{display:flex;align-items:center;gap:11px;padding:7px 0;border-bottom:1px solid var(--card-border-subtle)}
.v2-hrow:last-of-type{border-bottom:none}
.v2-hrow-cov{width:44px;height:44px;border-radius:8px;overflow:hidden;flex:none;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center}
.v2-hrow-cov img{width:100%;height:100%;object-fit:cover;display:block}
.v2-hrow-ph{font-size:18px;opacity:.5}
.v2-hrow-txt{flex:1;min-width:0;display:flex;flex-direction:column}
.v2-hrow-txt b{font-family:'Outfit',sans-serif;font-weight:700;font-size:13.5px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-hrow-txt span{font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-hrow-meta{flex:none;font-size:11.5px;font-weight:700;color:var(--text-faint)}
@media(max-width:760px){.v2-hcols{grid-template-columns:1fr;gap:22px}}

/* bendruomenės featured — daugiau turinio */
.v2-feat{display:block;padding-bottom:2px}
.v2-feat-cov{display:block;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:var(--bg-elevated);margin:10px 0 9px}
.v2-feat-cov img{width:100%;height:100%;object-fit:cover;display:block}
.v2-feat-kind{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-faint)}
.v2-feat-title{display:block;font-family:'Outfit',sans-serif;font-weight:700;font-size:14.5px;color:var(--text-primary);line-height:1.3;margin-top:3px}
.v2-feat:hover .v2-feat-title{color:var(--accent-orange)}
.v2-feat-ex{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;color:var(--text-muted);line-height:1.45;margin-top:5px}
.v2-feat-author{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);font-weight:600;margin-top:9px}
.v2-feat-av{width:20px;height:20px;border-radius:50%;object-fit:cover}

/* gilyn — pirmas albumas + juostelė */
.v2-gilyn-lead{display:flex;gap:12px;align-items:center;margin:11px 0 10px}
.v2-gilyn-cov{width:66px;height:66px;border-radius:10px;overflow:hidden;flex:none;background:var(--bg-elevated)}
.v2-gilyn-cov img{width:100%;height:100%;object-fit:cover;display:block}
.v2-gilyn-info{min-width:0;display:flex;flex-direction:column}
.v2-gilyn-info b{font-family:'Outfit',sans-serif;font-weight:800;font-size:15px;color:var(--text-primary);line-height:1.15;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-gilyn-strip{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;margin-bottom:10px}
.v2-gilyn-strip::-webkit-scrollbar{display:none}
.v2-gilyn-th{flex:none;width:40px;height:40px;border-radius:7px;overflow:hidden;background:var(--bg-elevated)}
.v2-gilyn-th img{width:100%;height:100%;object-fit:cover;display:block}

/* greitai pasirodys — collage */
.v2-upc{display:flex;gap:16px;align-items:stretch;margin-top:12px;background:var(--card-surface);border:1px solid var(--card-border-default);border-radius:var(--radius-xl);padding:14px}
.v2-upc-grid{flex:none;width:208px;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr);gap:4px}
.v2-upc-cell{background-size:cover;background-position:center;aspect-ratio:1;border-radius:6px;background-color:var(--bg-elevated)}
.v2-upc-list{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:7px}
.v2-upc-row{display:flex;flex-direction:column;min-width:0}
.v2-upc-row b{font-family:'Outfit',sans-serif;font-weight:700;font-size:13.5px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-upc-row span{font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-upc-more{font-family:'Outfit',sans-serif;font-weight:700;font-size:12.5px;color:var(--accent-orange);margin-top:2px}
@media(max-width:560px){.v2-upc{flex-direction:column}.v2-upc-grid{width:100%;max-width:280px}}

/* istorija */
.v2-hist-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}
.v2-hist-card{display:block}
.v2-hist-img{display:flex;align-items:center;justify-content:center;position:relative;width:100%;aspect-ratio:1;border-radius:var(--radius-lg);overflow:hidden;background:var(--bg-elevated)}
.v2-hist-img img{width:100%;height:100%;object-fit:cover;display:block}
.v2-hist-emoji{font-size:34px;opacity:.5}
.v2-hist-title{display:block;font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;margin-top:8px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-hist-sub{display:block;color:var(--text-muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

@media(max-width:980px){.v2-split,.v2-gz{grid-template-columns:1fr}.v2-side{position:static}.v2-comm-panel{min-width:0}}
@media(max-width:560px){.v2-games-grid{grid-template-columns:1fr}}
@media(max-width:900px){.v2-hist-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:640px){.v2-shell{padding-left:var(--page-pad-x-sm);padding-right:var(--page-pad-x-sm)}.v2-hist-grid{grid-template-columns:repeat(2,1fr)}}
`
