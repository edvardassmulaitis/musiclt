// app/v2/page.tsx — SERVER component. Alternatyvus homepage variantas (/v2).
//
// Vientisas srautas (vienas skaitymo kelias, be konkuruojančių stulpelių):
//   Hero → Nauja muzika → Koncertai → Bendruomenė → Šiandien istorijoje.
//
// NATIVE stilius: naudoja TIKRUS svetainės komponentus/duomenis —
//   • Nauja muzika: muzika-hub (getNewestTracks/getLatestAlbums) + muzika-ui
//     kortelės (TrackList/AlbumRow/SectionHead) — identiška /muzika stiliui.
//   • Koncertai: atkurtas homepage afišos blokas (Tailwind, 1:1).
//   • Bendruomenė: tikras BendruomeneSection komponentas (self-fetching).
//   • Hero: HeroV2 kortelės stilius (Tailwind) iš naujienų + renginių.
// Neliečia main page. noindex.

import Link from 'next/link'
import { getNewestTracks, getLatestAlbums, type HubAlbum } from '@/lib/muzika-hub'
import { getUpcomingAlbumsForHome } from '@/lib/home-latest'
import { SectionHead, TrackList, AlbumRow, muzikaStyles } from '@/components/muzika-ui'
import BendruomeneSection from '@/components/home/BendruomeneSection'
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
  const age = Date.now() - t
  return age >= 0 && age < 24 * 60 * 60 * 1000
}
function FreshDot({ right = 8, top = 8 }: { right?: number; top?: number }) {
  return (
    <span
      className="absolute z-[3] block h-2.5 w-2.5 rounded-full"
      style={{ right, top, background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.25)' }}
      aria-hidden
    />
  )
}

async function jget(path: string): Promise<any> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3000)
    const r = await fetch(base + path, { next: { revalidate: 300 }, signal: ctrl.signal })
    clearTimeout(t)
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

function upcomingToHub(a: any): HubAlbum {
  return {
    id: a.id,
    slug: a.slug ?? null,
    title: a.title,
    year: a.year ?? null,
    cover_image_url: a.cover_image_url || a.artists?.cover_image_url || null,
    artist_id: a.artist_id,
    artist_name: a.artists?.name || '',
    artist_slug: a.artists?.slug || '',
  }
}

/* ─────────────────────────── HERO (HeroV2 stilius) ─────────────────────────── */
type Slide = { href: string; bgImg: string | null; chip: string | null; chipBg: string; title: string; subtitle?: string | null; fresh?: boolean }

function HeroCard({ s }: { s: Slide }) {
  return (
    <Link
      href={s.href}
      className="group relative block aspect-[16/9] overflow-hidden rounded-2xl border border-[var(--border-default)] no-underline shadow-[var(--hero-card-shadow)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--hero-card-shadow-hover)]"
      style={{ background: 'linear-gradient(135deg,#141b28 0%,#0a0e17 100%)' }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        {s.bgImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImgResized(s.bgImg, 1280)} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: 'center 25%' }} />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#141b28 0%,#0a0e17 100%)' }} />
        )}
      </div>
      {s.chip && (
        <span className="absolute left-3 top-3 z-[2] inline-flex rounded-md px-2 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.03em] text-white" style={{ background: s.chipBg }}>
          {s.chip}
        </span>
      )}
      {s.fresh && <FreshDot right={12} top={12} />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-end p-5">
        <h3 className="m-0 max-w-[460px] font-['Outfit',sans-serif] text-[28px] font-black leading-[1.08] tracking-tight text-white transition-opacity group-hover:opacity-90">
          {s.title}
        </h3>
        {s.subtitle && (
          <p className="m-0 mt-2 flex items-center gap-1.5 font-['Outfit',sans-serif] text-[14px] font-semibold text-white/85">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
            {s.subtitle}
          </p>
        )}
      </div>
    </Link>
  )
}

function Hero({ slides }: { slides: Slide[] }) {
  if (!slides.length) return null
  return (
    <section className="hp-scroll -mx-1 flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {slides.map((s, i) => (
        <div key={i} className="w-[86vw] shrink-0 snap-start sm:w-[560px]">
          <HeroCard s={s} />
        </div>
      ))}
    </section>
  )
}

/* ─────────────────────────── KONCERTAI (afiša — 1:1 iš homepage) ─────────────────────────── */
function Koncertai({ events, verta }: { events: any[]; verta: any[] }) {
  const filtEvt = events || []
  const cardCls = "group relative flex aspect-[3/4] w-[188px] shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] no-underline shadow-[0_5px_14px_rgba(0,0,0,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(249,115,22,0.5)] hover:shadow-[0_14px_30px_rgba(249,115,22,0.18)] lg:w-auto"
  const capCls = "border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-2"
  const isAbroad = (e: any) => !!e.is_abroad
  const scoreOf = (e: any) => Math.max(0, ...(e.event_artists || []).map((ea: any) => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return a?.score || 0 }))
  const all = [...filtEvt].sort((x, y) => new Date((x.start_date || x.event_date || 0) as any).getTime() - new Date((y.start_date || y.event_date || 0) as any).getTime())
  const foreign = verta || []
  const main = all.filter(e => !isAbroad(e) && (e.is_festival || e.is_featured || scoreOf(e) >= 10) && (!!e.cover_image_url || (e.event_artists || []).some((ea: any) => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return !!a?.cover_image_url }))).slice(0, foreign.length ? 9 : 10)

  const cards: React.ReactNode[] = main.map((ev: any) => {
    const dateRaw = ev.start_date || ev.event_date
    const d = dateRaw ? new Date(dateRaw) : null
    const dayNum = d && !isNaN(d.getTime()) ? d.getDate() : null
    const monthLbl = d && !isNaN(d.getTime()) ? MONTHS_LT[d.getMonth()] : null
    const eas = (ev.event_artists || [])
      .map((ea: any) => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return a ? { ...a, is_headliner: ea.is_headliner, sort_order: ea.sort_order } : null })
      .filter(Boolean) as { name: string; country?: string | null; cover_image_url?: string | null; is_headliner?: boolean; sort_order?: number }[]
    const ranked = [...eas].sort((p, q) => (q.is_headliner ? 1 : 0) - (p.is_headliner ? 1 : 0) || ((p.sort_order ?? 99) - (q.sort_order ?? 99)))
    const photos = ranked.filter(a => a.cover_image_url)
    const adminCover = ev.cover_image_url
    const useCollage = !adminCover && photos.length >= 2
    const singleImg = adminCover || photos[0]?.cover_image_url || null
    const flag = countryFlag(ranked.find(a => a.country)?.country)
    const city = ev.city || ev.venues?.city || ''
    const artistList = eas.filter(a => a.name).map(a => a.name)
    const title = ev.is_festival
      ? sanitizeTitle(ev.title)
      : artistList.length > 0
        ? artistList.slice(0, 2).join(', ') + (artistList.length > 2 ? ` +${artistList.length - 2}` : '')
        : sanitizeTitle(ev.title)
    const smalls = photos.slice(1, 3)
    return (
      <Link key={ev.id} href={eventHref({ title: ev.title, slug: ev.slug, legacy_id: ev.legacy_id })} className={cardCls}>
        <div className="relative flex-1 overflow-hidden">
          {useCollage ? (
            <div className="grid h-full w-full grid-cols-2 grid-rows-[3fr_2fr] gap-px">
              <div className="col-span-2 bg-cover bg-top" style={{ backgroundImage: `url(${proxyImgResized(photos[0].cover_image_url!, 480)})` }} />
              {smalls.map((a, idx) => (
                <div key={idx} className={`bg-cover bg-top ${smalls.length === 1 ? 'col-span-2' : ''}`} style={{ backgroundImage: `url(${proxyImgResized(a.cover_image_url!, 320)})` }} />
              ))}
            </div>
          ) : singleImg ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxyImgResized(singleImg, 64)} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxyImgResized(singleImg, 640)} alt={title} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]" />
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>
          )}
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
            {fImgs.map((src, i) => (
              <div key={i} className="bg-cover bg-top" style={{ backgroundImage: `url(${proxyImgResized(src, 320)})` }} />
            ))}
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
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-x-visible lg:pb-0">
          {cards}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────── ISTORIJA (nostalgija) ─────────────────────────── */
function Istorija({ items }: { items: any[] }) {
  const list = (items || []).slice(0, 12)
  if (!list.length) return null
  return (
    <section style={{ marginTop: 'var(--page-section-gap)' }}>
      <SectionHead title="Šiandien muzikos istorijoje" href="/istorija" hrefLabel="Daugiau" />
      <div className="v2-hist-grid">
        {list.map((h: any) => (
          <Link key={h.id} href={h.href} className="v2-hist-card">
            <span className="v2-hist-img">
              {h.cover
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={proxyImgResized(h.cover, 240)} alt="" loading="lazy" />
                : <span className="v2-hist-emoji">{h.emoji || '♪'}</span>}
            </span>
            <span className="v2-hist-title">{h.title}</span>
            <span className="v2-hist-sub">{h.subtitle || h.artist || ''}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ─────────────────────────── PAGE ─────────────────────────── */
export default async function V2Page() {
  const [ltTracks, wTracks, ltAlbums, wAlbums, upcomingR, newsR, eventsR, vertaR, istorijaR] = await Promise.all([
    getNewestTracks('lt', 8).catch(() => []),
    getNewestTracks('world', 8).catch(() => []),
    getLatestAlbums('lt', 6).catch(() => []),
    getLatestAlbums('world', 6).catch(() => []),
    getUpcomingAlbumsForHome().catch(() => ({ items: [] as any[], total: 0, full: [] as any[] })),
    jget('/api/news?limit=10&include=songs&since_days=21'),
    jget('/api/events?homepage=1&compact=1&limit=12&period=all&order=asc'),
    jget('/api/verta-keliones'),
    jget('/api/istorija/today'),
  ])

  const upcoming: HubAlbum[] = ((upcomingR?.items ?? []) as any[]).slice(0, 6).map(upcomingToHub)
  const events: any[] = eventsR?.events ?? []
  const verta: any[] = vertaR?.concerts ?? []
  const istorija: any[] = istorijaR?.items ?? []

  // Hero slides: naujienos su vizualu + keli renginiai.
  const news: any[] = newsR?.news ?? []
  const newsSlides: Slide[] = news
    .filter((n) => n.image_title_url || n.image_small_url)
    .slice(0, 6)
    .map((n) => ({
      href: `/naujienos/${n.slug}`,
      bgImg: n.image_title_url || n.image_small_url,
      chip: null,
      chipBg: 'var(--accent-orange)',
      title: sanitizeTitle(n.title),
      fresh: isFresh24(n.published_at),
    }))
  const eventSlides: Slide[] = events
    .filter((e) => e.cover_image_url || (e.event_artists || []).some((ea: any) => { const a = Array.isArray(ea.artists) ? ea.artists[0] : ea.artists; return a?.cover_image_url }))
    .slice(0, 3)
    .map((e) => {
      const a0 = (e.event_artists || []).map((ea: any) => Array.isArray(ea.artists) ? ea.artists[0] : ea.artists).find((a: any) => a?.cover_image_url)
      const dt = e.start_date ? new Date(e.start_date) : null
      const dateLbl = dt && !isNaN(dt.getTime()) ? `${dt.getDate()} ${MONTHS_LT[dt.getMonth()]}` : ''
      const city = e.city || e.venues?.city || ''
      return {
        href: eventHref({ title: e.title, slug: e.slug, legacy_id: e.legacy_id }),
        bgImg: e.cover_image_url || a0?.cover_image_url || null,
        chip: 'Renginys',
        chipBg: 'var(--accent-blue)',
        title: sanitizeTitle(e.title),
        subtitle: [city, dateLbl].filter(Boolean).join(' · '),
      }
    })
  // Sumaišom: 1 renginys po kelių naujienų, kad hero būtų įvairus.
  const slides: Slide[] = []
  newsSlides.forEach((s, i) => {
    slides.push(s)
    if (i === 1 && eventSlides[0]) slides.push(eventSlides[0])
    if (i === 3 && eventSlides[1]) slides.push(eventSlides[1])
  })
  if (eventSlides[2]) slides.push(eventSlides[2])

  return (
    <div className="v2-shell">
      <style>{muzikaStyles}</style>
      <style>{V2_EXTRA}</style>

      <header className="v2-head">
        <div>
          <h1>Music.lt <span className="v2-badge">v2</span></h1>
          <p>Alternatyvus pagrindinio puslapio variantas — su tikrais duomenimis.</p>
        </div>
        <Link href="/" className="v2-headlink">← Į dabartinį puslapį</Link>
      </header>

      <Hero slides={slides} />

      {/* ── Nauja muzika ── */}
      <section style={{ marginTop: 'var(--page-section-gap)' }}>
        <SectionHead title="Naujos dainos" href="/muzika" hrefLabel="Visos" />
        <div className="v2-msub">Lietuva</div>
        <TrackList tracks={ltTracks} />
        <div className="v2-msub">Pasaulis</div>
        <TrackList tracks={wTracks} />
      </section>

      <section style={{ marginTop: 'var(--page-section-gap)' }}>
        <SectionHead title="Nauji albumai" href="/albumai" hrefLabel="Visi" />
        <div className="v2-msub">Lietuva</div>
        <AlbumRow albums={ltAlbums} />
        <div className="v2-msub">Pasaulis</div>
        <AlbumRow albums={wAlbums} />
      </section>

      {upcoming.length > 0 && (
        <section style={{ marginTop: 'var(--page-section-gap)' }}>
          <SectionHead title="Greitai pasirodys" />
          <AlbumRow albums={upcoming} />
        </section>
      )}

      {/* ── Koncertai (afiša kaip yra) ── */}
      <Koncertai events={events} verta={verta} />

      {/* ── Bendruomenė (tikras komponentas) ── */}
      <section style={{ marginTop: 'var(--page-section-gap)' }}>
        <BendruomeneSection />
      </section>

      {/* ── Šiandien muzikos istorijoje ── */}
      <Istorija items={istorija} />
    </div>
  )
}

const V2_EXTRA = `
.v2-shell{max-width:var(--page-max);margin:0 auto;padding:var(--page-pad-top) var(--page-pad-x) var(--page-pad-bottom);}
.v2-shell a{color:inherit;text-decoration:none}
.v2-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:22px}
.v2-head h1{font-family:'Outfit',sans-serif;font-size:var(--page-h1-size);font-weight:var(--page-h1-weight);letter-spacing:var(--page-h1-tracking);line-height:1.05;margin:0;color:var(--text-primary)}
.v2-badge{font-size:.5em;vertical-align:middle;background:var(--accent-orange);color:#fff;border-radius:var(--radius-pill);padding:.2em .6em;font-weight:800;letter-spacing:0}
.v2-head p{margin:.35rem 0 0;font-size:var(--page-sub-size);color:var(--page-sub-color)}
.v2-headlink{font-size:13px;color:var(--text-muted);white-space:nowrap}
.v2-msub{font-family:'Outfit',sans-serif;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-faint);margin:16px 0 10px}
.v2-hist-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}
.v2-hist-card{display:block}
.v2-hist-img{display:flex;align-items:center;justify-content:center;position:relative;width:100%;aspect-ratio:1;border-radius:var(--radius-lg);overflow:hidden;background:var(--bg-elevated)}
.v2-hist-img img{width:100%;height:100%;object-fit:cover;display:block}
.v2-hist-emoji{font-size:34px;opacity:.5}
.v2-hist-title{display:block;font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;margin-top:8px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v2-hist-sub{display:block;color:var(--text-muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media(max-width:900px){.v2-hist-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:640px){.v2-shell{padding-left:var(--page-pad-x-sm);padding-right:var(--page-pad-x-sm)}.v2-hist-grid{grid-template-columns:repeat(2,1fr)}}
`
