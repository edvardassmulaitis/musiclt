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
import { eventHref } from '@/lib/event-href'

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
async function jget(path: string): Promise<any> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3000)
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
/* Šalies juosta iš kairės (taupo vietą vietoj LT/Pasaulis antraščių). */
function FlagLane({ flag, ariaLabel, children }: { flag: string; ariaLabel: string; children: React.ReactNode }) {
  return (
    <div className="v2-lane">
      <span className="v2-flag" title={ariaLabel}>{flag}</span>
      <div className="v2-lane-s"><Scroller ariaLabel={ariaLabel}>{children}</Scroller></div>
    </div>
  )
}

/* ─────────────── sekcijos antraštė su filtrais (Viltės pasiūlymas) ─────────────── */
function MusicHead({ title, browseHref }: { title: string; browseHref: string }) {
  return (
    <div className="v2-mh">
      <h2>{title}</h2>
      <div className="v2-chips">
        <span className="v2-chip on">Naujausios</span>
        <Link href={browseHref} className="v2-chip">Populiariausios</Link>
        <Link href={browseHref} className="v2-chip">⚙ Filtruoti</Link>
      </div>
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

/* ─────────────── Bendruomenės šoninė juosta (praturtinta) ─────────────── */
function kindLabel(it: any): string {
  if (it.editorial_type) return it.editorial_type
  switch (it.type) {
    case 'discussion': return 'Diskusija'
    case 'atradimas': return 'Atradimas'
    case 'blog': return 'Įrašas'
    default: return 'Bendruomenė'
  }
}
function CommunityRail({ community, top }: { community: any[]; top: any[] }) {
  const dd = community.find((c) => c.type === 'dd')
  const ddCands: any[] = (dd?.candidates || []).slice(0, 4)
  const movers = (top || []).slice(0, 5)
  const highlights = community.filter((c) => c.type !== 'dd').slice(0, 1)

  return (
    <aside className="v2-side">
      {ddCands.length > 0 && (
        <div className="v2-cw">
          <div className="v2-ch"><span className="v2-ch-bar" style={{ background: 'var(--accent-orange)' }} />Dienos daina</div>
          <div className="v2-csub">{dd?.subtype === 'yesterday_winner' ? 'Vakar laimėjo' : 'Šiandien pirmauja'}</div>
          {ddCands.map((c: any, i: number) => (
            <div key={i} className="v2-row">
              <span className="v2-row-rank">{c.rank ?? i + 1}</span>
              <span className="v2-row-cov">{c.cover
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={proxyImgResized(c.cover, 72)} alt="" loading="lazy" /> : null}</span>
              <span className="v2-row-txt"><b>{c.title}</b><span>{c.artist}</span></span>
              {typeof c.votes === 'number' && <span className="v2-row-right">{c.votes}★</span>}
            </div>
          ))}
          <Link href="/dienos-daina" className="v2-clink">Balsuoti / siūlyti →</Link>
        </div>
      )}

      {movers.length > 0 && (
        <div className="v2-cw">
          <div className="v2-ch"><span className="v2-ch-bar" style={{ background: 'var(--accent-green)' }} />Topai · kyla</div>
          {movers.map((m: any) => {
            const tr = m.tracks || {}
            const art = Array.isArray(tr.artists) ? tr.artists[0] : tr.artists
            const delta = m.prev_position != null ? m.prev_position - m.position : null
            return (
              <div key={m.id} className="v2-row">
                <span className="v2-row-rank">{m.position}</span>
                <span className="v2-row-cov">{(tr.cover_url || art?.cover_image_url)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={proxyImgResized(tr.cover_url || art?.cover_image_url, 64)} alt="" loading="lazy" /> : null}</span>
                <span className="v2-row-txt"><b>{tr.title}</b><span>{art?.name}</span></span>
                <span className="v2-row-right">{delta == null ? <em className="v2-d n">NAUJA</em> : delta > 0 ? <em className="v2-d u">▲{delta}</em> : delta < 0 ? <em className="v2-d d">▼{-delta}</em> : <em className="v2-d z">–</em>}</span>
              </div>
            )
          })}
          <Link href="/top40" className="v2-clink">Visas topas →</Link>
        </div>
      )}

      {highlights.length > 0 && (
        <div className="v2-cw">
          <div className="v2-ch"><span className="v2-ch-bar" style={{ background: 'var(--accent-blue)' }} />Bendruomenėje</div>
          {highlights.map((h: any) => (
            <Link key={h.id} href={h.href || '/bendruomene'} className="v2-hl">
              <span className="v2-hl-cov">{h.cover
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={proxyImgResized(h.cover, 96)} alt="" loading="lazy" /> : <span className="v2-hl-ph">♪</span>}</span>
              <span className="v2-hl-txt">
                <span className="v2-hl-kind">{kindLabel(h)}</span>
                <b>{sanitizeTitle(h.title)}</b>
                {h.author_name ? <span className="v2-hl-author">{h.author_name}</span> : null}
              </span>
            </Link>
          ))}
          <Link href="/bendruomene" className="v2-clink">Į bendruomenę →</Link>
        </div>
      )}

      {/* Gilyn — atradimų žaidimo intro (startas iš homepage) */}
      <Link href="/zaidimai/gilyn" className="v2-cw v2-gilyn">
        <div className="v2-ch"><span className="v2-ch-bar" style={{ background: 'var(--accent-blue)' }} />🗺️ Gilyn</div>
        <div className="v2-gilyn-txt">Muzikos atradimų žaidimas — <b>20 albumų kasdien</b>. Kiek atspėsi negirdėtų?</div>
        <span className="v2-gilyn-cta">Pradėti →</span>
      </Link>
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
  const main = all.filter(e => !e.is_abroad && (e.is_festival || e.is_featured || scoreOf(e) >= 10) && (!!e.cover_image_url || (e.event_artists || []).some((ea: any) => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return !!a?.cover_image_url }))).slice(0, foreign.length ? 9 : 10)

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
function histKind(t: string): { label: string; cls: string } {
  if (t === 'birthday') return { label: 'Gimė', cls: 'g' }
  if (t === 'death_anniversary') return { label: 'Netektis', cls: 'd' }
  return { label: 'Sukaktis', cls: 's' }
}
function Istorija({ items }: { items: any[] }) {
  const all = items || []
  // Viena eilutė, mišri: top sukaktys + gimtadieniai + netektys (tik top atlikėjai).
  const albums = all.filter((h) => h.type === 'album_anniversary').slice(0, 8)
  const births = all.filter((h) => h.type === 'birthday').slice(0, 4)
  const deaths = all.filter((h) => h.type === 'death_anniversary').slice(0, 2)
  const list = [...albums, ...births, ...deaths]
  if (!list.length) return null
  return (
    <section style={{ marginTop: 'var(--page-section-gap)' }}>
      <div className="v2-mh"><h2>Šiandien muzikos istorijoje</h2>
        <div className="v2-chips">
          <Link href="/istorija" className="v2-chip">Išleisti albumai</Link>
          <Link href="/istorija" className="v2-chip">Gimimo / mirties datos</Link>
          <Link href="/istorija" className="v2-chip">Visi →</Link>
        </div>
      </div>
      <Scroller ariaLabel="Šiandien muzikos istorijoje">
        {list.map((h: any) => {
          const k = histKind(h.type)
          return (
            <Link key={h.id} href={h.href} className="v2-cc">
              <span className="v2-cc-img">
                {h.cover
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={proxyImgResized(h.cover, 240)} alt="" loading="lazy" /> : <span className="v2-cc-ph">{h.emoji || '♪'}</span>}
                <span className={`v2-hkind ${k.cls}`}>{k.label}{h.year ? ` · ${new Date().getFullYear() - h.year}m` : h.age ? ` · ${h.age}m` : ''}</span>
              </span>
              <span className="v2-cc-t">{h.title}</span>
              <span className="v2-cc-s">{h.subtitle || h.artist || ''}</span>
            </Link>
          )
        })}
      </Scroller>
    </section>
  )
}

/* ─────────────── Žaidimų zona + aktyviausi nariai ─────────────── */
const GAMES = [
  { href: '/zaidimai/dienos-issukis', emoji: '🎯', title: 'Dienos iššūkis', sub: 'Kasdienė viktorina · ×2 taškai' },
  { href: '/zaidimai/gilyn', emoji: '🗺️', title: 'Gilyn', sub: '20 albumų atradimų žaidimas' },
  { href: '/zaidimai/vadybininkas', emoji: '📈', title: 'Vadybininkas', sub: 'Fantasy — sudaryk komandą' },
  { href: '/zaidimai/koncertas', emoji: '🎤', title: 'Koncertas', sub: 'Atspėk iš pasirodymo' },
  { href: '/zaidimai/gaudykle', emoji: '🕹️', title: 'Gaudyklė', sub: 'Refleksų žaidimas' },
  { href: '/zaidimai', emoji: '🎮', title: 'Visi žaidimai', sub: 'Daugiau →' },
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
              <span className="v2-game-emoji">{g.emoji}</span>
              <span className="v2-game-txt"><b>{g.title}</b><span>{g.sub}</span></span>
            </Link>
          ))}
        </div>
      </div>
      {top.length > 0 && (
        <div className="v2-gz-members">
          <div className="v2-mh"><h2>Aktyviausi nariai</h2></div>
          <div className="v2-cw">
            {top.map((m: any, i: number) => (
              <Link key={m.user_id || i} href={m.username ? `/vartotojas/${m.username}` : '/nariai'} className="v2-mem">
                <span className="v2-mem-rank">{i + 1}</span>
                <span className="v2-mem-av">{m.avatar
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={proxyImgResized(m.avatar, 72)} alt="" loading="lazy" /> : <span>{(m.name || m.username || '?')[0]}</span>}</span>
                <span className="v2-mem-txt"><b>{m.name || m.username}</b><span>{m.headline || ''}</span></span>
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
  const [music, upcomingR, newsR, eventsR, vertaR, istorijaR, communityR, topR, membersR] = await Promise.all([
    getMusic(),
    getUpcomingAlbumsForHome().catch(() => ({ items: [] as any[] })),
    jget('/api/news?limit=10&include=songs&since_days=21'),
    jget('/api/events?homepage=1&compact=1&limit=12&period=all&order=asc'),
    jget('/api/verta-keliones'),
    jget('/api/istorija/today'),
    jget('/api/home/community'),
    jget('/api/top/entries?type=top40'),
    jget('/api/atradimai/active-members'),
  ])
  const members: any[] = membersR?.members ?? []

  const upcoming: HubAlbum[] = ((upcomingR?.items ?? []) as any[]).slice(0, 8).map(toHubAlbum)
  const events: any[] = eventsR?.events ?? []
  const verta: any[] = vertaR?.concerts ?? []
  const istorija: any[] = istorijaR?.items ?? []
  const community: any[] = communityR?.items ?? []
  const top: any[] = topR?.entries ?? []

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

  const trackCards = (arr: TrackItem[]) => arr.slice(0, 12).map((t) => <TrackCard key={t.id} t={t} />)
  const albumCards = (arr: HubAlbum[]) => arr.slice(0, 12).map((a) => <AlbumCard key={a.id} href={albumHref(a)} cover={a.cover_image_url} title={a.title} sub={a.artist_name} />)

  return (
    <div className="v2-shell">
      <style>{muzikaStyles}</style>
      <style>{V2_EXTRA}</style>

      <Hero slides={slides} />

      <div className="v2-split">
        <div className="v2-main">
          <section>
            <MusicHead title="Naujos dainos" browseHref="/dainos" />
            <FlagLane flag="🇱🇹" ariaLabel="Lietuva">{trackCards(music.tLt)}</FlagLane>
            <FlagLane flag="🌍" ariaLabel="Pasaulis">{trackCards(music.tW)}</FlagLane>
          </section>

          <section style={{ marginTop: 'var(--page-section-gap)' }}>
            <MusicHead title="Nauji albumai" browseHref="/albumai" />
            <FlagLane flag="🇱🇹" ariaLabel="Lietuva">{albumCards(music.aLt)}</FlagLane>
            <FlagLane flag="🌍" ariaLabel="Pasaulis">{albumCards(music.aW)}</FlagLane>
          </section>

          {upcoming.length > 0 && (
            <section style={{ marginTop: 'var(--page-section-gap)' }}>
              <div className="v2-mh"><h2>Greitai pasirodys</h2></div>
              <div className="v2-lane"><span className="v2-flag">🔜</span><div className="v2-lane-s"><Scroller ariaLabel="Greitai pasirodys">{albumCards(upcoming)}</Scroller></div></div>
            </section>
          )}
        </div>

        <CommunityRail community={community} top={top} />
      </div>

      <Koncertai events={events} verta={verta} />
      <Istorija items={istorija} />
      <GamesZone members={members} />
    </div>
  )
}

const V2_EXTRA = `
.v2-shell{max-width:var(--page-max);margin:0 auto;padding:var(--page-pad-top) var(--page-pad-x) var(--page-pad-bottom);}
.v2-shell a{color:inherit;text-decoration:none}

/* sekcijos antraštė + filtrai */
.v2-mh{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.v2-mh h2{font-family:'Outfit',sans-serif;font-weight:800;letter-spacing:-.02em;font-size:20px;line-height:1.1;color:var(--text-primary);margin:0}
.v2-chips{margin-left:auto;display:flex;gap:6px;align-items:center}
.v2-chip{border:1px solid var(--border-default);background:transparent;color:var(--text-secondary);border-radius:var(--radius-pill);padding:5px 12px;font-family:'Outfit',sans-serif;font-size:12.5px;font-weight:700;white-space:nowrap}
.v2-chip.on{background:var(--text-primary);color:var(--bg-body);border-color:var(--text-primary)}
.v2-chip:hover{border-color:rgba(249,115,22,.45)}
.v2-msub{font-family:'Outfit',sans-serif;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-faint);margin:14px 0 9px}

/* albumo (kvadratas) + dainos (16:9) kortelės — kompaktiškos, responsive */
.v2-cc{display:block;width:clamp(94px,26vw,112px);flex:none}
.v2-cc-img{position:relative;display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:1;border-radius:11px;overflow:hidden;background:var(--bg-elevated)}
.v2-tc{display:block;width:clamp(150px,44vw,176px);flex:none}
.v2-tc-img{position:relative;display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:var(--bg-elevated)}
.v2-cc-img img,.v2-tc-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}
.v2-cc:hover .v2-cc-img img,.v2-tc:hover .v2-tc-img img{transform:scale(1.05)}
.v2-cc-ph{font-size:26px;color:rgba(255,255,255,.14)}
.v2-cc-t{display:block;font-family:'Outfit',sans-serif;font-weight:700;font-size:12.5px;margin-top:7px;color:var(--text-primary);line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v2-cc:hover .v2-cc-t,.v2-tc:hover .v2-cc-t{color:var(--accent-orange)}
.v2-cc-s{display:block;font-size:11.5px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* šalies juosta iš kairės */
.v2-lane{display:flex;align-items:stretch;gap:10px;margin-top:12px}
.v2-flag{flex:none;width:30px;display:flex;align-items:center;justify-content:center;font-size:17px;border-radius:9px;background:var(--bg-hover);align-self:stretch}
.v2-lane-s{flex:1;min-width:0}

/* istorijos tipo žymė ant viršelio */
.v2-hkind{position:absolute;left:6px;bottom:6px;font-size:9.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:2px 6px;border-radius:6px;color:#fff;backdrop-filter:blur(3px)}
.v2-hkind.s{background:rgba(29,78,216,.85)} .v2-hkind.g{background:rgba(22,163,74,.85)} .v2-hkind.d{background:rgba(120,113,108,.9)}

/* split */
.v2-split{display:grid;grid-template-columns:minmax(0,1.9fr) minmax(0,1fr);gap:26px;align-items:start;margin-top:8px}
.v2-main{min-width:0}
.v2-side{display:flex;flex-direction:column;gap:16px;position:sticky;top:14px}
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
.v2-games-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.v2-game{display:flex;align-items:center;gap:11px;padding:13px 14px;border-radius:var(--radius-xl);border:1px solid var(--card-border-default);background:var(--card-surface);transition:border-color .15s,transform .15s}
.v2-game:hover{border-color:rgba(249,115,22,.45);transform:translateY(-2px)}
.v2-game-emoji{font-size:24px;flex:none}
.v2-game-txt{min-width:0;display:flex;flex-direction:column}
.v2-game-txt b{font-family:'Outfit',sans-serif;font-weight:700;font-size:14px;color:var(--text-primary)}
.v2-game-txt span{font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-mem{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--card-border-subtle)}
.v2-mem:last-of-type{border-bottom:none}
.v2-mem-rank{width:16px;text-align:center;font-family:'Outfit',sans-serif;font-weight:800;font-size:13px;color:var(--text-faint);flex:none}
.v2-mem-av{width:34px;height:34px;border-radius:50%;overflow:hidden;background:var(--bg-elevated);flex:none;display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;font-weight:700;color:var(--text-muted);font-size:13px}
.v2-mem-av img{width:100%;height:100%;object-fit:cover;display:block}
.v2-mem-txt{flex:1;min-width:0;display:flex;flex-direction:column}
.v2-mem-txt b{font-family:'Outfit',sans-serif;font-weight:700;font-size:13.5px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-mem-txt span{font-size:11.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-mem-pts{flex:none;font-family:'Outfit',sans-serif;font-weight:800;font-size:12.5px;color:var(--accent-orange)}

/* istorija */
.v2-hist-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}
.v2-hist-card{display:block}
.v2-hist-img{display:flex;align-items:center;justify-content:center;position:relative;width:100%;aspect-ratio:1;border-radius:var(--radius-lg);overflow:hidden;background:var(--bg-elevated)}
.v2-hist-img img{width:100%;height:100%;object-fit:cover;display:block}
.v2-hist-emoji{font-size:34px;opacity:.5}
.v2-hist-title{display:block;font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;margin-top:8px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-hist-sub{display:block;color:var(--text-muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

@media(max-width:980px){.v2-split,.v2-gz{grid-template-columns:1fr}.v2-side{position:static;flex-direction:row;flex-wrap:wrap}.v2-cw,.v2-gilyn{flex:1;min-width:250px}}
@media(max-width:560px){.v2-games-grid{grid-template-columns:1fr}}
@media(max-width:900px){.v2-hist-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:640px){.v2-shell{padding-left:var(--page-pad-x-sm);padding-right:var(--page-pad-x-sm)}.v2-hist-grid{grid-template-columns:repeat(2,1fr)}}
`
