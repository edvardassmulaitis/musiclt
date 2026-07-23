'use client'
// /v2 hero — tiksli v1 pagrindinio puslapio hero kortelių kopija (HeroV2Slider).
// Kortelės = <Link> (paspaudus atidaro puslapį); reader modalas NEperkeltas
// (jis v1 yra atskira mobile funkcija). Kortelių tipai: chart_lt / chart_world
// (čartų mosaic), daily_winner (dienos dainos koliažas), news / blog / event /
// promo (bg foto + chip + antraštė). Duomenys (HeroSlide[]) suformuojami
// server-side (app/v2/page.tsx) pagal tą pačią v1 logiką.
import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { proxyImgResized } from '@/lib/img-proxy'
import { useHeroSeen } from './useHeroSeen'

export type TopEntry = { pos: number; track_id?: number; title: string; artist: string; cover_url: string | null; artist_image: string | null; trend: string; prevPos?: number | null; wks?: number; slug?: string; artist_slug?: string; videoId?: string | null }

// PILNAS v1 HeroSlide tipas (app/HomeClient.tsx) — vienas bendras šaltinis
// HeroSlider (desktop), MobileHero (mobile strip) ir reels reader'iui. Visi
// papildomi (reader v3) laukai OPTIONAL, kad esamas server-side slide builder
// (HomeView.buildHeroSlides) toliau kompiliuotųsi be pakeitimų.
export type HeroSlide = {
  type: string; chip: string; chipBg: string; title: string; subtitle?: string
  subtitleShort?: string  // kompaktiška meta mobile kortelei (be venue/metų)
  href: string; bgImg?: string | null; videoId?: string | null
  songTitle?: string | null; songArtist?: string | null; songCover?: string | null
  artist?: { id?: number | null; name: string; slug: string; image?: string | null } | null
  chartTops?: TopEntry[]
  collage?: { cover: string; title: string; artist: string; isWinner: boolean }[]
  // ── Reader v3 papildomi laukai ──
  newsId?: number | null            // pilno body lazy-fetch'ui (/api/news/[id])
  blogId?: string | null            // bendruomenės įrašo pilno body lazy-fetch'ui (/api/blog/posts/[id])
  body?: string | null              // jau turimas pilnas/preview HTML (be fetch'o)
  excerpt?: string | null           // ilgesnis preview tekstas (verta/discovery/recording)
  metaLine?: string | null          // vieta · data / trukmė ir pan.
  ctaLabel?: string | null          // pirminis veiksmas: „Skaityti" / „Žiūrėti" / „Žemėlapis"
  ticketUrl?: string | null         // renginiams — „Pirkti bilietą"
  authorName?: string | null        // user content — autorius
  authorAvatar?: string | null
  likeable?: boolean                // ar rodyti ♥ (news kol kas)
  publishedAt?: string | null       // ISO data — reader'yje rodom santykiškai („prieš X d.")
  likeCount?: number                // ♥ skaičius kortelei (neįėjus į naujieną)
  commentCount?: number             // 💬 skaičius kortelei
  fresh24?: boolean                 // (deprecated — nebenaudojam; border rodo „neskaityta")
  songs?: { videoId: string; title: string; artist?: string | null; songId?: number | null; score?: number; video_views?: number }[]  // news „susijusi muzika" (tikri track'ai su song_id → native grotuvas; score/video_views → populiarumo rikiavimui)
  lineup?: { name: string; slug: string; image?: string | null }[]      // event — pilnas lineup (avatarai + nuorodos)
}

// „Peržiūrėta" raktas — TAS PAT formatas kaip reels ReelsReader.slideKey
// (type::href), kad localStorage 'reels_seen' sutaptų tarp desktop ir mobile
// (lokaliai apibrėžta, kad išvengtume circular import su ReelsReader).
const slideKey = (s: HeroSlide) => `${s.type}::${s.href}`

/* ─────────────── Hero v2 karuselė (rodyklės + taškai) ─────────────── */
export default function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  // „Neskaityta" žymėjimas — border rodomas kol vartotojas neatidarė kortelės.
  // Prisijungusiems SURIŠTA per įrenginius (server), svečiams — localStorage.
  const { seen, ready, markSeen } = useHeroSeen()
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const update = () => {
      const card = el.querySelector('.hp-hero-slot') as HTMLElement | null
      if (card) setActiveIdx(Math.round(el.scrollLeft / (card.offsetWidth + 16)))
      const max = el.scrollWidth - el.clientWidth - 2
      setAtStart(el.scrollLeft <= 2)
      setAtEnd(el.scrollLeft >= max)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (ro) ro.observe(el)
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); ro?.disconnect() }
  }, [slides])
  const many = slides.length > 1
  const stepEl = () => trackRef.current?.querySelector('.hp-hero-slot') as HTMLElement | null
  const scrollTo = (i: number) => {
    const el = trackRef.current, card = stepEl()
    if (!el || !card) return
    el.scrollTo({ left: i * (card.offsetWidth + 16), behavior: 'smooth' })
  }
  const scrollByDir = (dir: -1 | 1) => {
    const el = trackRef.current
    if (!el) return
    const card = stepEl()
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.9
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }
  return (
    <section className="hp-hero-v2">
      <style>{`
        .hp-hero-v2{display:block}
        @media(max-width:768px){.hp-hero-v2{display:none}} /* mobile → v1 story strip (MobileHero) */
        .hp-scroll{overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-behavior:smooth}
        .hp-scroll::-webkit-scrollbar{display:none}
        .hp-hero-slot{width:580px;flex-shrink:0;min-width:0}
        @media(min-width:1400px){.hp-hero-slot{width:calc((100% - 64px) / 2.3)}}
        @media(max-width:768px){.hp-hero-slot{width:88vw}}
        @media(pointer:fine){.hp-hero-arrow{opacity:0;transition:opacity .2s}}
        .hp-hero-wrap:hover .hp-hero-arrow{opacity:1}
      `}</style>
      <div className="hp-hero-wrap relative">
        <div ref={trackRef} className="hp-scroll hp-hero-track flex items-stretch gap-4 py-1 snap-x snap-mandatory">
          {slides.map((slide) => (
            <div key={`${slide.type}-${slide.href}`} className="hp-hero-slot shrink-0 snap-start">
              <HeroV2Card slide={slide} unseen={ready && !seen.has(slideKey(slide))} onOpen={() => markSeen(slideKey(slide))} />
            </div>
          ))}
          {/* Paskutinė kortelė — „Daugiau naujienų" → /naujienos. */}
          <div className="hp-hero-slot shrink-0 snap-start">
            <Link href="/naujienos"
              className="group relative flex aspect-[16/9] h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] no-underline transition-colors hover:border-[var(--accent-orange)]">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-strong)] text-[var(--text-muted)] transition-colors group-hover:border-[var(--accent-orange)] group-hover:text-[var(--accent-orange)]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </span>
              <span className="font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">Daugiau naujienų</span>
            </Link>
          </div>
        </div>
        {many && !atStart && (
          <button type="button" aria-label="Ankstesnis" onClick={() => scrollByDir(-1)}
            className="hp-hero-arrow absolute top-1/2 z-[4] flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            style={{ left: -6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        {many && !atEnd && (
          <button type="button" aria-label="Kitas" onClick={() => scrollByDir(1)}
            className="hp-hero-arrow absolute top-1/2 z-[4] flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            style={{ right: -6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        )}
      </div>
      {many && (
        <div className="mt-2 flex justify-center">
          {slides.map((s, i) => (
            <button key={`hdot-${s.type}-${s.href}`} type="button" aria-label={`Slaidas ${i + 1}`}
              onClick={() => scrollTo(i)}
              className="group cursor-pointer border-0 bg-transparent transition-all"
              style={{ padding: '8px 4px' }}>
              <span className="block rounded-full transition-all"
                style={{ width: i === activeIdx ? 22 : 11, height: 4, background: i === activeIdx ? 'var(--accent-orange)' : 'var(--border-strong)' }} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

// „Neskaityta" žiedas — outline (ne border), kad: (a) sektų border-radius,
// (b) nekeistų box dydžio (border keitė radius nesting → ant hover nuotraukos
// kampai išlįsdavo iš po rėmo), (c) išliktų className hover shadow.
function unseenBorder(unseen: boolean): React.CSSProperties {
  return unseen ? { outline: '2px solid var(--accent-orange)', outlineOffset: '0px' } : {}
}

function HeroV2Card({ slide, unseen, onOpen }: { slide: HeroSlide; unseen: boolean; onOpen: () => void }) {
  if (slide.type === 'chart_lt' || slide.type === 'chart_world') {
    return <HeroChartCard slide={slide} unseen={unseen} onOpen={onOpen} />
  }
  if (slide.type === 'daily_winner' && slide.collage && slide.collage.length >= 3) {
    return <HeroDailyCard slide={slide} unseen={unseen} onOpen={onOpen} />
  }
  return (
    <Link
      href={slide.href}
      onClick={onOpen}
      className="group relative block aspect-[16/9] overflow-hidden rounded-2xl no-underline shadow-[var(--hero-card-shadow)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--hero-card-shadow-hover)]"
      style={{ background: 'linear-gradient(135deg,#141b28 0%,#0a0e17 100%)', ...unseenBorder(unseen) }}
    >
      <div className="absolute inset-0">
        {slide.bgImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImgResized(slide.bgImg, 1280)}
            alt=""
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: 'center 25%' }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#141b28 0%,#0a0e17 100%)' }} />
        )}
      </div>
      {slide.chip !== 'NAUJIENA' && (
        <span
          className="absolute left-3 top-3 z-[2] inline-flex rounded-md px-2 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.03em] text-white"
          style={{ background: slide.chipBg }}
        >
          {slide.chip}
        </span>
      )}
      {slide.type === 'news' && (!!slide.likeCount || !!slide.commentCount) && (
        <div className="absolute right-3 top-3 z-[2] flex items-center gap-2.5 rounded-full bg-black/50 px-2.5 py-1 backdrop-blur-sm">
          {!!slide.likeCount && (
            <span className="inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[12px] font-bold text-white">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--accent-orange)" aria-hidden><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              {slide.likeCount}
            </span>
          )}
          {!!slide.commentCount && (
            <span className="inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[12px] font-bold text-white">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              {slide.commentCount}
            </span>
          )}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-end p-5">
        <h3 className="m-0 max-w-[440px] font-['Outfit',sans-serif] text-[23px] font-extrabold leading-[1.12] tracking-tight text-white transition-opacity group-hover:opacity-90">
          {slide.title}
        </h3>
        {slide.type === 'event' && slide.subtitle && (
          <p className="m-0 mt-2 flex items-center gap-1.5 font-['Outfit',sans-serif] text-[14px] font-semibold text-white/85">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
            {slide.subtitle}
          </p>
        )}
        {slide.type === 'daily_winner' && (
          <div className="m-0 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {slide.artist?.name && (
              <span className="font-['Outfit',sans-serif] text-[16px] font-bold leading-none text-white/90">{slide.artist.name}</span>
            )}
            <span className="inline-flex items-center gap-1 rounded-[6px] bg-white/15 px-2 py-[3px] font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.06em] text-amber-300">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM5 9a2 2 0 0 1-2-2V5h4M19 9a2 2 0 0 0 2-2V5h-4"/></svg>
              Vakar laimėjo
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

/* Dienos daina — kandidatų koliažas (laimėtojas didžiausias). */
function HeroDailyCard({ slide, unseen, onOpen }: { slide: HeroSlide; unseen: boolean; onOpen: () => void }) {
  const items = slide.collage || []
  const winner = items.find(i => i.isWinner) || items[0]
  const others = items.filter(i => i !== winner)
  const accent = '#f59e0b'
  const accentSoft = 'rgba(245,158,11,0.22)'
  const wonLabel = (slide.metaLine || '').split(' · ')[0] || 'Laimėjo'
  const Trophy = ({ s = 11 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM5 9a2 2 0 0 1-2-2V5h4M19 9a2 2 0 0 0 2-2V5h-4" /></svg>
  )
  const Tile = ({ item, big }: { item?: { cover: string; title: string; artist: string; isWinner: boolean }; big?: boolean }) => {
    if (!item) return <div className="rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', height: '100%', width: '100%' }} />
    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg" style={{ boxShadow: big ? '0 6px 22px rgba(0,0,0,0.5)' : '0 4px 14px rgba(0,0,0,0.4)', outline: item.isWinner ? `2px solid ${accent}` : 'none', outlineOffset: -2 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={proxyImgResized(item.cover, big ? 480 : 320)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
        {item.isWinner && (
          <span className="absolute left-2 top-2 inline-flex items-center justify-center rounded-md text-white" style={{ background: accent, height: big ? 24 : 20, minWidth: big ? 24 : 20, padding: '0 5px', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}><Trophy s={big ? 13 : 11} /></span>
        )}
      </div>
    )
  }
  return (
    <Link
      href={slide.href}
      onClick={onOpen}
      className="group relative block aspect-[16/9] overflow-hidden rounded-2xl no-underline shadow-[var(--hero-card-shadow)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--hero-card-shadow-hover)]"
      style={{ background: `radial-gradient(ellipse at top left, ${accentSoft}, rgba(10,14,26,0.98) 60%), linear-gradient(135deg, #1c1710 0%, #0a0e17 100%)`, ...unseenBorder(unseen) }}
    >
      <div className="relative z-[1] flex h-full flex-col justify-between p-6 pt-3" style={{ width: '42%' }}>
        <span className="inline-flex w-fit items-center rounded-md px-2 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.03em] text-white" style={{ background: accent, alignSelf: 'flex-start' }}>DIENOS DAINA</span>
        <div style={{ minWidth: 0 }}>
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-[6px] bg-white/12 px-2 py-[3px] font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.06em] text-amber-300"><Trophy />{wonLabel}</span>
          <h3 className="m-0 font-['Outfit',sans-serif] text-[26px] font-black leading-[1.06] tracking-tight text-white" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{slide.title}</h3>
          {slide.songArtist && <p className="m-0 mt-1.5 truncate font-['Outfit',sans-serif] text-[15px] font-bold text-white/85">{slide.songArtist}</p>}
        </div>
      </div>
      <div className="absolute right-4 top-4 bottom-4" style={{ width: '58%', display: 'grid', gridTemplateColumns: '3fr 2fr', gridTemplateRows: '3fr 2fr', gap: 7 }}>
        <div style={{ gridColumn: 1, gridRow: 1 }}><Tile item={winner} big /></div>
        <div style={{ gridColumn: 2, gridRow: 1 }}><Tile item={others[0]} /></div>
        <div style={{ gridColumn: '1 / -1', gridRow: 2, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
          <Tile item={others[1]} />
          <Tile item={others[2]} />
          <Tile item={others[3]} />
        </div>
      </div>
    </Link>
  )
}

function HeroChartCard({ slide, unseen, onOpen }: { slide: HeroSlide; unseen: boolean; onOpen: () => void }) {
  const isLT = slide.type === 'chart_lt'
  const tops = slide.chartTops || []
  const accent = isLT ? 'var(--accent-orange)' : '#3b82f6'
  const accentSoft = isLT ? 'rgba(249,115,22,0.22)' : 'rgba(59,130,246,0.22)'
  const cover = (t: TopEntry | undefined) => t ? (t.cover_url || t.artist_image) : null

  const dedupArtists = (entries: TopEntry[]) => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of entries) {
      const a = (t.artist || '').trim()
      if (!a || seen.has(a)) continue
      seen.add(a); out.push(a)
    }
    return out
  }
  const newArtists = dedupArtists(tops.filter(t => t.trend === 'new'))
  const valueLead = newArtists.length > 0 ? 'Tarp naujų pretendentų:' : ''
  const valueNames = newArtists.slice(0, 4)

  const Tile = ({ entry, size }: { entry: TopEntry | undefined; size: 'big' | 'md' | 'sm' }) => {
    const c = cover(entry)
    const titleSize = size === 'big' ? 14.5 : size === 'md' ? 12.5 : 11
    const artistSize = size === 'big' ? 12 : size === 'md' ? 10.5 : 10
    const padding = size === 'big' ? '10px 11px 10px' : '7px 8px 7px'
    const numSize = size === 'big' ? 30 : size === 'md' ? 24 : 22
    const numFont = size === 'big' ? 13.5 : 11.5
    if (!entry || !c) {
      return <div className="rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', height: '100%', width: '100%' }} />
    }
    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg" style={{ boxShadow: size === 'big' ? '0 6px 22px rgba(0,0,0,0.5)' : '0 4px 14px rgba(0,0,0,0.4)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proxyImgResized(c, 480)}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0) 80%)' }} />
        <span
          className="absolute left-2 top-2 inline-flex items-center justify-center rounded-md font-['Outfit',sans-serif] font-black text-white"
          style={{
            background: entry.pos === 1 ? accent : 'rgba(0,0,0,0.78)',
            height: numSize, minWidth: numSize, fontSize: numFont,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
          }}
        >{entry.pos}</span>
        <div className="absolute bottom-0 left-0 right-0" style={{ padding }}>
          <p
            className="m-0 truncate font-['Outfit',sans-serif] font-black text-white"
            style={{ fontSize: titleSize, lineHeight: 1.15, letterSpacing: '-0.01em', textShadow: '0 2px 6px rgba(0,0,0,0.85)' }}
          >{entry.title}</p>
          <p
            className="m-0 truncate text-white/85"
            style={{ fontSize: artistSize, lineHeight: 1.2, marginTop: 1, textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}
          >{entry.artist}</p>
        </div>
      </div>
    )
  }

  return (
    <Link
      href={slide.href}
      onClick={onOpen}
      className="group relative block aspect-[16/9] overflow-hidden rounded-2xl no-underline shadow-[var(--hero-card-shadow)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--hero-card-shadow-hover)]"
      style={{
        background: isLT
          ? `radial-gradient(ellipse at top left, ${accentSoft}, rgba(10,14,26,0.98) 60%), linear-gradient(135deg, #1a1426 0%, #0a0e1a 100%)`
          : `radial-gradient(ellipse at top left, ${accentSoft}, rgba(8,13,20,0.98) 60%), linear-gradient(135deg, #14182a 0%, #080d14 100%)`,
        ...unseenBorder(unseen),
      }}
    >
      <div
        className="relative z-[1] flex h-full flex-col justify-between p-6 pt-3"
        style={{ width: '38%' }}
      >
        <span
          className="inline-flex w-fit items-center rounded-md px-2 py-0.5 font-['Outfit',sans-serif] text-[12px] font-bold uppercase tracking-[0.03em] text-white"
          style={{ background: accent, alignSelf: 'flex-start' }}
        >
          {isLT ? 'LT TOP 30' : 'TOP 40'}
        </span>

        {valueNames.length > 0 && (
          <div className="flex flex-col gap-1.5" style={{ minWidth: 0 }}>
            <p className="m-0 text-[14px] font-semibold uppercase tracking-[0.14em] text-white/55">
              {valueLead}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {valueNames.slice(0, 4).map((n, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: 'Outfit,sans-serif',
                    fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.78)',
                    lineHeight: 1.3, letterSpacing: '-0.005em',
                    display: 'flex', alignItems: 'center', gap: 8,
                    minWidth: 0,
                  }}
                >
                  <span style={{
                    flexShrink: 0, width: 4, height: 4, borderRadius: '50%',
                    background: accent, opacity: 0.7,
                  }} />
                  <span style={{
                    minWidth: 0, flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-[10px] font-['Outfit',sans-serif] text-white no-underline transition-all"
          style={{
            background: accent,
            padding: '10px 20px',
            fontSize: 14, fontWeight: 700, letterSpacing: '0.02em',
            boxShadow: `0 4px 14px ${accentSoft}`,
          }}
        >
          Balsuok
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </span>
      </div>

      {tops.length > 0 && (
        <div
          className="absolute right-4 top-4 bottom-4"
          style={{
            width: '58%',
            display: 'grid',
            gridTemplateColumns: '3fr 2fr',
            gridTemplateRows: '3fr 2fr',
            gap: 7,
          }}
        >
          <div style={{ gridColumn: 1, gridRow: 1 }}><Tile entry={tops[0]} size="big" /></div>
          <div style={{ gridColumn: 2, gridRow: 1 }}><Tile entry={tops[1]} size="md" /></div>
          <div
            style={{
              gridColumn: '1 / -1', gridRow: 2,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 7,
            }}
          >
            <Tile entry={tops[2]} size="sm" />
            <Tile entry={tops[3]} size="sm" />
            <Tile entry={tops[4]} size="sm" />
          </div>
        </div>
      )}
    </Link>
  )
}
