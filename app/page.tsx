'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

/* ────────────────────────────── Types ────────────────────────────── */
type Track = { id: number; slug: string; title: string; cover_url: string | null; created_at: string; artists: { id: number; slug: string; name: string } | null }
type Album = { id: number; slug: string; title: string; year: number | null; cover_image_url: string | null; created_at: string; artists: { id: number; slug: string; name: string } | null }
type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type Event = { id: number; slug: string; title: string; event_date: string; venue_custom: string | null; image_small_url: string | null; venues: { name: string; city: string } | null }
type NewsItem = { id: number; slug: string; title: string; image_small_url: string | null; published_at: string; type: string | null; artist: { name: string; slug: string } | null }
type TopEntry = { pos: number; track_id: number; title: string; artist: string; cover_url: string | null; trend: string; wks?: number; slug?: string; artist_slug?: string }
type Nomination = { id: number; votes: number; weighted_votes: number; tracks: { id: number; title: string; cover_url: string | null; artists: { name: string } | null } | null }
type Discussion = { id: number; slug: string; title: string; author_name: string | null; comment_count: number; created_at: string; tags: string[] }
type ShoutMsg = { id: number; author_name: string; author_avatar: string | null; body: string; created_at: string; user_id: string }
type HeroSlide = { type: string; chip: string; chipBg: string; kicker: string; title: string; subtitle: string; cover: string | null; href: string; bg: string; glow: string; bgImg?: string | null }

/* ────────────────────────────── Helpers ────────────────────────────── */
const MONTHS_LT = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rgp', 'Rgs', 'Spa', 'Lap', 'Gru']

function sanitizeTitle(raw: string): string {
  // Strip HTML tags and entities that leak from wiki/import
  return raw.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days} d.`
  return new Date(d).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })
}

function strHue(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h
}

/* ────────────────────────────── Shared UI ────────────────────────────── */

function Cover({ src, alt, size = 44, radius = 10 }: { src?: string | null; alt: string; size?: number; radius?: number }) {
  const h = strHue(alt)
  if (src) return <img src={src} alt={alt} loading="lazy" style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0, display: 'block' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: `linear-gradient(135deg, hsl(${h},38%,16%), hsl(${(h + 40) % 360},28%,10%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `hsl(${h},45%,45%)`, fontSize: size * 0.38, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
      {alt[0]?.toUpperCase() || '?'}
    </div>
  )
}

function TrendIcon({ t }: { t: string }) {
  if (t === 'up') return <span style={{ color: '#34d399', fontSize: 10, fontWeight: 900 }}>▲</span>
  if (t === 'down') return <span style={{ color: '#f87171', fontSize: 10, fontWeight: 900 }}>▼</span>
  if (t === 'new') return <span style={{ fontSize: 8, fontWeight: 800, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.04em' }}>N</span>
  return <span style={{ color: '#243040', fontSize: 10 }}>–</span>
}

function Skel({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  return <div className="hp-skel" style={{ width: w, height: h, borderRadius: r, flexShrink: 0 }} />
}

function SH({ label, href, cta = 'Visi →' }: { label: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 17, fontWeight: 800, color: '#e8edf6', letterSpacing: '-0.01em', margin: 0 }}>{label}</h2>
      {href && <Link href={href} style={{ fontSize: 12, color: '#4a7ab5', fontWeight: 700, textDecoration: 'none', transition: 'color .15s' }} onMouseEnter={e => (e.currentTarget.style.color = '#7ab8f0')} onMouseLeave={e => (e.currentTarget.style.color = '#4a7ab5')}>{cta}</Link>}
    </div>
  )
}

/* ────────────────────────────── Dienos Daina ────────────────────────────── */

function DienosDainaWidget() {
  const [noms, setNoms] = useState<Nomination[]>([])
  const [voted, setVoted] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/dienos-daina/nominations').then(r => r.json()).then(d => { setNoms(d.nominations || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])
  const w = noms[0]
  return (
    <div style={{ background: 'linear-gradient(145deg, rgba(22,55,140,0.18) 0%, rgba(8,13,22,0.98) 100%)', border: '1px solid rgba(30,80,200,0.15)', borderRadius: 16, overflow: 'hidden' }}>
      {/* Winner */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Cover src={w?.tracks?.cover_url} alt={w?.tracks?.title || 'daina'} size={54} radius={10} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, color: '#3a5878', fontWeight: 700, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Šiandien pirmauja</p>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 800, color: '#eef2fa', margin: '0 0 1px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {loading ? '...' : sanitizeTitle(w?.tracks?.title || 'Dar nėra')}
          </h3>
          <p style={{ fontSize: 11, color: 'rgba(180,200,235,0.45)', margin: 0 }}>{w?.tracks?.artists?.name || ''}</p>
        </div>
        <Link href="/dienos-daina" style={{ flexShrink: 0, background: '#f97316', color: '#fff', fontWeight: 800, fontSize: 11, padding: '7px 14px', borderRadius: 20, textDecoration: 'none', boxShadow: '0 3px 14px rgba(249,115,22,0.35)', transition: 'transform .15s, box-shadow .15s' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 5px 20px rgba(249,115,22,0.45)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 3px 14px rgba(249,115,22,0.35)' }}>
          ▶ Balsuoti
        </Link>
      </div>
      {/* Candidates */}
      <div>
        <div style={{ padding: '8px 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: '#1e3050', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Rytdienos kandidatai</span>
          <Link href="/dienos-daina" style={{ fontSize: 9, color: '#4a7ab5', fontWeight: 700, textDecoration: 'none' }}>+ Siūlyti</Link>
        </div>
        {loading ? <div style={{ padding: '10px 16px', color: '#2a4060', fontSize: 12 }}>Kraunama...</div>
          : noms.length === 0 ? <div style={{ padding: '14px 16px', color: '#2a4060', fontSize: 12, textAlign: 'center' }}>Kol kas nėra nominacijų</div>
          : noms.slice(0, 5).map((n, i) => (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', transition: 'background .12s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#1a2a3c', width: 14, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
              <Cover src={n.tracks?.cover_url} alt={n.tracks?.title || '?'} size={26} radius={6} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#d0ddf0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sanitizeTitle(n.tracks?.title || '')}</p>
                <p style={{ fontSize: 10, color: '#2a4060', margin: 0 }}>{n.tracks?.artists?.name}</p>
              </div>
              <span style={{ fontSize: 10, color: 'rgba(180,200,235,0.22)', flexShrink: 0, minWidth: 16, textAlign: 'right' }}>{voted === i ? n.votes + 1 : n.votes}</span>
              <button onClick={() => voted === null && setVoted(i)} disabled={voted !== null}
                style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10, flexShrink: 0, cursor: voted !== null ? 'default' : 'pointer', border: voted === i ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(29,78,216,0.25)', background: voted === i ? 'rgba(52,211,153,0.1)' : 'transparent', color: voted === i ? '#34d399' : voted !== null ? 'rgba(255,255,255,0.12)' : '#60a5fa', transition: 'all 0.15s' }}>
                {voted === i ? '✓' : 'Balsuoti'}
              </button>
            </div>
          ))}
      </div>
    </div>
  )
}

/* ────────────────────────────── Shoutbox ────────────────────────────── */

function ShoutboxWidget() {
  const [msgs, setMsgs] = useState<ShoutMsg[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async (since?: string) => {
    try {
      const r = await fetch(since ? `/api/live/shoutbox?since=${encodeURIComponent(since)}&limit=12` : '/api/live/shoutbox?limit=12')
      const d = await r.json()
      if (d.messages?.length) {
        if (!since) { setMsgs([...d.messages].reverse()) }
        else { setMsgs(prev => { const ids = new Set(prev.map((m: ShoutMsg) => m.id)); const fresh = d.messages.filter((m: ShoutMsg) => !ids.has(m.id)); return fresh.length ? [...prev, ...fresh].slice(-12) : prev }) }
      }
      setLoading(false)
    } catch { setLoading(false) }
  }, [])
  useEffect(() => {
    load()
    const iv = setInterval(() => { setMsgs(prev => { const last = prev[prev.length - 1]; if (last) load(last.created_at); return prev }) }, 8000)
    return () => clearInterval(iv)
  }, [load])
  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 14 }}>💬</span>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 800, color: '#e8edf6' }}>Gyvi pokalbiai</span>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
        </div>
        <Link href="/bendruomene" style={{ fontSize: 10, color: '#4a7ab5', fontWeight: 700, textDecoration: 'none' }}>Visi →</Link>
      </div>
      <div style={{ flex: 1 }}>
        {loading ? <div style={{ padding: '18px', color: '#2a4060', fontSize: 12, textAlign: 'center' }}>Kraunama...</div>
          : msgs.length === 0 ? <div style={{ padding: '18px', color: '#2a4060', fontSize: 12, textAlign: 'center' }}>Dar nėra žinučių</div>
          : msgs.slice(-6).map((m, i, arr) => (
            <div key={m.id} style={{ display: 'flex', gap: 9, padding: '8px 14px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: `hsl(${strHue(m.author_name)},28%,14%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: `hsl(${strHue(m.author_name)},45%,52%)`, fontFamily: 'Outfit, sans-serif' }}>{m.author_name[0]?.toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#5a90cc' }}>{m.author_name}</span>
                  <span style={{ fontSize: 9, color: '#1a2a3c' }}>{timeAgo(m.created_at)}</span>
                </div>
                <p style={{ fontSize: 12, color: 'rgba(190,210,240,0.6)', margin: 0, lineHeight: 1.4 }}>{m.body}</p>
              </div>
            </div>
          ))}
      </div>
      <div style={{ padding: '9px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <Link href="/bendruomene" style={{ display: 'block', textAlign: 'center', padding: '7px', borderRadius: 10, background: 'rgba(90,102,200,0.08)', border: '1px solid rgba(90,102,200,0.18)', color: '#7080c0', fontSize: 11, fontWeight: 700, textDecoration: 'none', transition: 'background .15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(90,102,200,0.14)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(90,102,200,0.08)')}>
          Prisijungti prie pokalbio →
        </Link>
      </div>
    </div>
  )
}

/* ────────────────────────────── Discussions ────────────────────────────── */

function DiscussionsWidget() {
  const [discs, setDiscs] = useState<Discussion[]>([])
  useEffect(() => { fetch('/api/diskusijos?sort=activity&limit=4').then(r => r.json()).then(d => setDiscs(d.discussions || [])).catch(() => {}) }, [])
  if (!discs.length) return null
  return (
    <div className="hp-disc-grid">
      {discs.map(d => (
        <Link key={d.id} href={`/diskusijos/${d.slug}`}
          style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none', display: 'block', transition: 'border-color 0.15s, background .15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}>
          <div style={{ display: 'flex', gap: 5, marginBottom: 5, alignItems: 'center' }}>
            {(d.tags || []).slice(0, 1).map(t => <span key={t} style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(90,102,200,0.12)', color: '#8090c0' }}>{t}</span>)}
            <span style={{ fontSize: 9, color: '#1a2a3c', marginLeft: 'auto' }}>{timeAgo(d.created_at)}</span>
          </div>
          <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700, color: '#c0d0e8', margin: '0 0 5px', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{d.title}</p>
          <p style={{ fontSize: 10, color: '#2a4060', margin: 0 }}>{d.author_name} · 💬 {d.comment_count}</p>
        </Link>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════ */
/*                           HOMEPAGE                                */
/* ════════════════════════════════════════════════════════════════════ */

export default function Home() {
  const [chartTab, setChartTab] = useState<'lt' | 'world'>('lt')
  const [ltTop, setLtTop] = useState<TopEntry[]>([])
  const [worldTop, setWorldTop] = useState<TopEntry[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [cityFilter, setCityFilter] = useState('Visi')
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([])
  const [heroIdx, setHeroIdx] = useState(0)
  const timerRef = useRef<any>(null)

  const parseTop = (entries: any[]): TopEntry[] => entries.slice(0, 7).map(e => {
    const prev = e.prev_position; const cur = e.position
    const trend = e.is_new ? 'new' : !prev ? 'same' : cur < prev ? 'up' : cur > prev ? 'down' : 'same'
    return { pos: e.position, track_id: e.track_id, title: sanitizeTitle(e.tracks?.title || ''), artist: e.tracks?.artists?.name || '', cover_url: e.tracks?.cover_url || null, trend, wks: e.weeks_in_top, slug: e.tracks?.slug, artist_slug: e.tracks?.artists?.slug }
  })

  useEffect(() => {
    fetch('/api/top/entries?type=lt_top30').then(r => r.json()).then(d => setLtTop(parseTop(d.entries || []))).catch(() => {})
    fetch('/api/top/entries?type=top40').then(r => r.json()).then(d => setWorldTop(parseTop(d.entries || []))).catch(() => {})
    fetch('/api/tracks?limit=16').then(r => r.json()).then(d => setTracks(d.tracks || [])).catch(() => {})
    fetch('/api/albums?limit=10').then(r => r.json()).then(d => setAlbums(d.albums || [])).catch(() => {})
    fetch('/api/artists?limit=12').then(r => r.json()).then(d => setArtists(d.artists || [])).catch(() => {})
    fetch('/api/events?limit=6').then(r => r.json()).then(d => setEvents(d.events || [])).catch(() => {})
    fetch('/api/news?limit=6').then(r => r.json()).then(d => setNews(d.news || [])).catch(() => {})
  }, [])

  /* ── Hero slides from real data ── */
  useEffect(() => {
    const slides: HeroSlide[] = []
    news.slice(0, 2).forEach(n => {
      const h = strHue(n.title)
      const artistName = n.artist?.name || ''
      slides.push({
        type: 'news', chip: n.type === 'review' ? 'Recenzija' : n.type === 'interview' ? 'Interviu' : 'Naujiena',
        chipBg: '#1d4ed8',
        kicker: artistName || timeAgo(n.published_at),
        title: sanitizeTitle(n.title),
        subtitle: artistName && artistName !== n.title ? artistName : '',
        cover: n.image_small_url, bgImg: n.image_small_url,
        href: `/naujienos/${n.slug}`,
        bg: `linear-gradient(135deg,hsl(${h},38%,5%) 0%,hsl(${(h + 30) % 360},45%,8%) 55%,hsl(${h},38%,5%) 100%)`,
        glow: `radial-gradient(ellipse at 28% 58%,hsla(${h},55%,38%,0.22) 0%,transparent 55%)`
      })
    })
    albums.slice(0, 2).forEach(a => {
      const h = strHue(a.title)
      slides.push({
        type: 'album', chip: 'Albumas', chipBg: '#6d28d9',
        kicker: a.year ? `${a.year} m.` : 'Naujas',
        title: sanitizeTitle(a.title),
        subtitle: a.artists?.name || '',
        cover: a.cover_image_url, bgImg: a.cover_image_url,
        href: `/muzika/${a.slug}`,
        bg: `linear-gradient(135deg,hsl(${h},38%,5%) 0%,hsl(${(h + 40) % 360},45%,9%) 55%,hsl(${h},38%,5%) 100%)`,
        glow: `radial-gradient(ellipse at 28% 58%,hsla(${h},50%,36%,0.26) 0%,transparent 55%)`
      })
    })
    events.slice(0, 1).forEach(ev => {
      const d = new Date(ev.event_date)
      slides.push({
        type: 'event', chip: 'Renginys', chipBg: '#047857',
        kicker: `${d.getDate()} ${MONTHS_LT[d.getMonth()]}. · ${ev.venues?.city || ''}`,
        title: sanitizeTitle(ev.title),
        subtitle: ev.venues?.name || ev.venue_custom || '',
        cover: ev.image_small_url, bgImg: ev.image_small_url,
        href: `/renginiai/${ev.slug}`,
        bg: 'linear-gradient(135deg,#040e08 0%,#071812 55%,#040e08 100%)',
        glow: 'radial-gradient(ellipse at 28% 58%,rgba(4,120,87,0.26) 0%,transparent 55%)'
      })
    })
    if (!slides.length) slides.push({
      type: 'promo', chip: '🇱🇹 Lietuviška muzika', chipBg: '#f97316',
      kicker: 'Platforma', title: 'music.lt',
      subtitle: 'Visi Lietuvos atlikėjai vienoje vietoje',
      cover: null, href: '/atlikejai',
      bg: 'linear-gradient(135deg,#08101e 0%,#0f1830 55%,#08101e 100%)',
      glow: 'radial-gradient(ellipse at 28% 58%,rgba(90,102,220,0.3) 0%,transparent 55%)'
    })
    setHeroSlides(slides)
    setHeroIdx(0)
  }, [news, albums, events])

  useEffect(() => {
    if (!heroSlides.length) return
    timerRef.current = setTimeout(() => setHeroIdx(p => (p + 1) % heroSlides.length), 7000)
    return () => clearTimeout(timerRef.current)
  }, [heroIdx, heroSlides.length])

  const hero = heroSlides[heroIdx]
  const chartData = chartTab === 'lt' ? ltTop : worldTop
  const cities = ['Visi', ...Array.from(new Set(events.map(e => e.venues?.city).filter(Boolean) as string[]))]
  const filtEvt = cityFilter === 'Visi' ? events : events.filter(e => e.venues?.city === cityFilter)

  return (
    <>
      <style>{`
        .hp{font-family:'DM Sans',sans-serif;background:#080d14;min-height:100vh}
        @keyframes hp-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes hp-pulse{0%,100%{opacity:.05}50%{opacity:.08}}
        .hp-skel{background:rgba(255,255,255,0.05);animation:hp-pulse 1.8s ease-in-out infinite}
        .hp-scroll{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
        .hp-scroll::-webkit-scrollbar{display:none}
        .hp-pill{cursor:pointer;padding:5px 13px;border-radius:18px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,.07);color:#4a6888;background:transparent;transition:all .15s;white-space:nowrap;font-family:'DM Sans',sans-serif}
        .hp-pill.hp-act{background:rgba(29,78,216,.18);border-color:rgba(29,78,216,.32);color:#90b8e8}
        .hp-pill:hover{color:#b8d0e8;border-color:rgba(255,255,255,.14)}
        .hp-tr{transition:background .1s}
        .hp-tr:hover{background:rgba(255,255,255,.04)!important}
        .hp-card{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:11px;text-decoration:none;transition:border-color .15s,background .15s}
        .hp-card:hover{border-color:rgba(255,255,255,.15);background:rgba(255,255,255,.04)}
        .hp-art:hover .hp-art-img{transform:scale(1.06)}
        .hp-disc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        @media(max-width:900px){
          .hp-hl{flex-direction:column!important}
          .hp-hleft{padding:22px 16px 18px!important;border-right:none!important;gap:16px!important}
          .hp-hcover{width:100px!important;height:100px!important}
          .hp-htitle{font-size:24px!important}
          .hp-hsub{font-size:13px!important;max-width:100%!important}
          .hp-hnav{display:none!important}
          .hp-hright{width:100%!important;padding:18px 16px!important;border-top:1px solid rgba(255,255,255,.07)}
          .hp-dds{grid-template-columns:1fr!important}
          .hp-ne{grid-template-columns:1fr!important}
        }
        @media(max-width:768px){
          .hp-cnt{padding:26px 14px!important;gap:36px!important}
          .hp-ag{grid-template-columns:repeat(4,1fr)!important;gap:14px!important}
          .hp-disc-grid{grid-template-columns:1fr!important}
          .hp-cta{flex-direction:column!important;align-items:flex-start!important;gap:14px!important;padding:22px 16px!important}
          .hp-ctabtn{width:100%!important;justify-content:center!important;text-align:center!important}
        }
        @media(max-width:480px){
          .hp-ag{grid-template-columns:repeat(3,1fr)!important}
          .hp-htitle{font-size:20px!important}
          .hp-hleft{flex-direction:column!important;align-items:flex-start!important}
          .hp-hcover{width:84px!important;height:84px!important}
        }
      `}</style>
      <div className="hp">

        {/* ═══════════════════════ HERO ═══════════════════════ */}
        {hero && (
          <section style={{ position: 'relative', overflow: 'hidden', background: hero.bg, transition: 'background .9s ease' }}>
            {hero.bgImg && (
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <img src={hero.bgImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', filter: 'blur(40px) saturate(0.6)', transform: 'scale(1.15)', opacity: 0.22 }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(8,13,20,0.94) 0%, rgba(8,13,20,0.7) 55%, rgba(8,13,20,0.45) 100%)' }} />
              </div>
            )}
            <div style={{ position: 'absolute', inset: 0, background: hero.glow, pointerEvents: 'none' }} />
            <div style={{ position: 'relative', maxWidth: 1360, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'stretch' }} className="hp-hl">

              {/* ── Hero Left ── */}
              <div className="hp-hleft" style={{ flex: 1, padding: '36px 28px 36px 0', display: 'flex', alignItems: 'center', gap: 24, borderRight: '1px solid rgba(255,255,255,.07)', minWidth: 0 }}>
                <div className="hp-hcover" style={{ flexShrink: 0, width: 152, height: 152, borderRadius: 16, overflow: 'hidden', boxShadow: '0 18px 52px rgba(0,0,0,.75)' }}>
                  <Cover src={hero.cover} alt={hero.title || '?'} size={152} radius={16} />
                </div>
                <div key={heroIdx} style={{ flex: 1, minWidth: 0, animation: 'hp-in .45s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
                    <span style={{ padding: '3px 11px', borderRadius: 18, fontSize: 10, fontWeight: 800, color: '#fff', background: hero.chipBg, fontFamily: 'Outfit,sans-serif', letterSpacing: '0.02em' }}>{hero.chip}</span>
                    {hero.kicker && <span style={{ fontSize: 11, color: 'rgba(180,200,235,.5)', fontWeight: 600 }}>{hero.kicker}</span>}
                  </div>
                  <h1 className="hp-htitle" style={{ fontFamily: 'Outfit,sans-serif', fontSize: 36, fontWeight: 900, color: '#f0f4fc', lineHeight: 1.08, margin: '0 0 8px', letterSpacing: '-0.02em' }}>{hero.title}</h1>
                  {hero.subtitle && <p className="hp-hsub" style={{ fontSize: 14, color: 'rgba(180,200,235,.45)', margin: '0 0 18px', lineHeight: 1.4, maxWidth: 420 }}>{hero.subtitle}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Link href={hero.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f97316', color: '#fff', fontWeight: 800, fontSize: 13, padding: '9px 20px', borderRadius: 22, textDecoration: 'none', boxShadow: '0 4px 18px rgba(249,115,22,.35)', fontFamily: 'Outfit,sans-serif', transition: 'transform .15s, box-shadow .15s' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(249,115,22,.45)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(249,115,22,.35)' }}>
                      Skaityti →
                    </Link>
                  </div>
                </div>
                {heroSlides.length > 1 && (
                  <div className="hp-hnav" style={{ display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
                    {['←', '→'].map((ch, di) => (
                      <button key={ch} onClick={() => setHeroIdx(p => ((p + (di === 0 ? -1 : 1)) + heroSlides.length) % heroSlides.length)}
                        style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: 'rgba(180,200,235,.3)', cursor: 'pointer', fontSize: 13, transition: 'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.25)'; e.currentTarget.style.color = 'rgba(255,255,255,.7)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = 'rgba(180,200,235,.3)' }}>
                        {ch}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Hero Right — Chart ── */}
              <div className="hp-hright" style={{ width: 332, flexShrink: 0, padding: '24px 0 24px 20px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                  <div style={{ display: 'flex', borderRadius: 18, padding: 3, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', gap: 2 }}>
                    {([['lt', '🇱🇹 LT Top 30'], ['world', '🌍 Top 40']] as const).map(([k, l]) => (
                      <button key={k} onClick={() => setChartTab(k)}
                        style={{ padding: '5px 10px', borderRadius: 14, fontSize: 11, fontWeight: 800, border: 'none', cursor: 'pointer', transition: 'all .15s', fontFamily: 'Outfit,sans-serif', background: chartTab === k ? '#1d4ed8' : 'transparent', color: chartTab === k ? '#fff' : '#2a4060' }}>{l}</button>
                    ))}
                  </div>
                  <Link href="/topas" style={{ fontSize: 11, color: '#4a7ab5', fontWeight: 700, textDecoration: 'none' }}>Visi →</Link>
                </div>
                <div style={{ flex: 1 }}>
                  {chartData.length === 0
                    ? Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        <Skel w={18} h={12} /><Skel w={12} h={10} /><Skel w={28} h={28} r={7} />
                        <div style={{ flex: 1 }}><Skel w="68%" h={10} /><div style={{ marginTop: 4 }}><Skel w="48%" h={8} /></div></div>
                      </div>
                    ))
                    : chartData.map((t, i) => (
                      <Link key={t.track_id || i} href={t.slug ? `/muzika/${t.slug}` : '/topas'} className="hp-tr"
                        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 6px', borderRadius: 7, cursor: 'pointer', textDecoration: 'none', borderBottom: i < chartData.length - 1 ? '1px solid rgba(255,255,255,.03)' : 'none' }}>
                        <span style={{ width: 18, textAlign: 'center', fontSize: 12, fontWeight: 900, fontFamily: 'Outfit,sans-serif', color: t.pos <= 3 ? '#f97316' : '#1a2a3c', flexShrink: 0 }}>{t.pos}</span>
                        <div style={{ width: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><TrendIcon t={t.trend} /></div>
                        <Cover src={t.cover_url} alt={t.title} size={28} radius={6} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#e0eaf8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                          <p style={{ fontSize: 10, color: '#3a5878', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artist}</p>
                        </div>
                        {t.wks != null && t.wks > 0 && <span style={{ fontSize: 9, color: '#1a2a3c', flexShrink: 0 }}>{t.wks}sav</span>}
                      </Link>
                    ))}
                </div>
                <Link href="/topas" style={{ marginTop: 10, display: 'block', textAlign: 'center', padding: '8px', borderRadius: 10, border: '1px solid rgba(255,255,255,.07)', color: '#4a7ab5', fontSize: 12, fontWeight: 700, textDecoration: 'none', transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.12)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)' }}>
                  Žiūrėti visą topą →
                </Link>
              </div>
            </div>
            {/* Hero dots */}
            {heroSlides.length > 1 && (
              <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5, alignItems: 'center' }}>
                {heroSlides.map((_, i) => (
                  <button key={i} onClick={() => setHeroIdx(i)}
                    style={{ borderRadius: 3, border: 'none', cursor: 'pointer', padding: 0, background: i === heroIdx ? '#f97316' : 'rgba(255,255,255,.16)', width: i === heroIdx ? 20 : 6, height: 5, transition: 'all .25s' }} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ═══════════════════════ MAIN CONTENT ═══════════════════════ */}
        <div className="hp-cnt" style={{ maxWidth: 1360, margin: '0 auto', padding: '42px 20px', display: 'flex', flexDirection: 'column', gap: 48 }}>

          {/* ── Naujos dainos + Albumai ── */}
          <section>
            <div>
              <SH label="Naujos dainos" href="/muzika" />
              <div className="hp-scroll" style={{ display: 'flex', gap: 8, paddingBottom: 2 }}>
                {tracks.length === 0 ? Array(8).fill(null).map((_, i) => (
                  <div key={i} style={{ width: 182, flexShrink: 0, padding: '9px 11px', borderRadius: 11, background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Skel w={38} h={38} r={8} /><div style={{ flex: 1 }}><Skel w="76%" h={10} /><div style={{ marginTop: 5 }}><Skel w="54%" h={8} /></div></div>
                  </div>
                )) : tracks.slice(0, 14).map(t => (
                  <Link key={t.id} href={`/muzika/${t.slug}`} className="hp-card"
                    style={{ width: 182, flexShrink: 0, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Cover src={t.cover_url} alt={sanitizeTitle(t.title)} size={38} radius={8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 12, fontWeight: 700, color: '#e0eaf8', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sanitizeTitle(t.title)}</p>
                      <p style={{ fontSize: 11, color: '#3a5878', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artists?.name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 24 }}>
              <SH label="Nauji albumai" href="/muzika?tab=albums" />
              <div className="hp-scroll" style={{ display: 'flex', gap: 9, paddingBottom: 2 }}>
                {albums.length === 0 ? Array(5).fill(null).map((_, i) => (
                  <div key={i} style={{ width: 212, flexShrink: 0, padding: '10px 12px', borderRadius: 11, background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Skel w={46} h={46} r={9} /><div style={{ flex: 1 }}><Skel w="70%" h={10} /><div style={{ marginTop: 5 }}><Skel w="50%" h={9} /></div></div>
                  </div>
                )) : albums.slice(0, 10).map(a => (
                  <Link key={a.id} href={`/muzika/${a.slug}`} className="hp-card"
                    style={{ width: 212, flexShrink: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Cover src={a.cover_image_url} alt={sanitizeTitle(a.title)} size={46} radius={9} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 700, color: '#e0eaf8', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sanitizeTitle(a.title)}</p>
                      <p style={{ fontSize: 11, color: '#3a5878', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.artists?.name}</p>
                      {a.year && <p style={{ fontSize: 10, color: '#1a2a3c', margin: 0 }}>{a.year}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* ── Dienos daina + Shoutbox ── */}
          <section>
            <div className="hp-dds" style={{ display: 'grid', gridTemplateColumns: '392px 1fr', gap: 16, alignItems: 'start' }}>
              <div><SH label="🎵 Dienos daina" href="/dienos-daina" /><DienosDainaWidget /></div>
              <div><SH label="💬 Gyvi pokalbiai" href="/bendruomene" cta="Bendruomenė →" /><ShoutboxWidget /></div>
            </div>
          </section>

          {/* ── Diskusijos ── */}
          <section>
            <SH label="Bendruomenė" href="/diskusijos" cta="Visos diskusijos →" />
            <DiscussionsWidget />
          </section>

          {/* ── Renginiai + Naujienos ── */}
          <div className="hp-ne" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <section>
              <SH label="Renginiai" href="/renginiai" />
              {cities.length > 1 && (
                <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
                  {cities.slice(0, 6).map(c => <button key={c} className={`hp-pill${cityFilter === c ? ' hp-act' : ''}`} onClick={() => setCityFilter(c)}>{c}</button>)}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {filtEvt.length === 0 ? <div style={{ padding: '18px', textAlign: 'center', color: '#2a4060', fontSize: 13, borderRadius: 11, border: '1px solid rgba(255,255,255,.05)' }}>Renginių nerasta</div>
                  : filtEvt.slice(0, 5).map(ev => {
                    const d = new Date(ev.event_date)
                    return (
                      <Link key={ev.id} href={`/renginiai/${ev.slug}`} className="hp-card"
                        style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 14px' }}>
                        <div style={{ textAlign: 'center', width: 36, flexShrink: 0 }}>
                          <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 20, fontWeight: 900, color: '#f0f4fc', margin: 0, lineHeight: 1 }}>{d.getDate()}</p>
                          <p style={{ fontSize: 9, fontWeight: 800, color: '#f97316', margin: 0, textTransform: 'uppercase', letterSpacing: '.06em' }}>{MONTHS_LT[d.getMonth()]}</p>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 700, color: '#d0ddf0', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sanitizeTitle(ev.title)}</p>
                          <p style={{ fontSize: 11, color: '#2a4060', margin: 0 }}>{ev.venues?.name || ev.venue_custom}{ev.venues?.city ? ` · ${ev.venues.city}` : ''}</p>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#f97316', flexShrink: 0, fontFamily: 'Outfit,sans-serif' }}>Bilietai →</span>
                      </Link>
                    )
                  })}
              </div>
            </section>
            <section>
              <SH label="Naujienos" href="/naujienos" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {news.length === 0 ? Array(4).fill(null).map((_, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 11, background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)', alignItems: 'center' }}>
                    <Skel w={32} h={32} r={7} /><div style={{ flex: 1 }}><Skel w="86%" h={10} /><div style={{ marginTop: 5 }}><Skel w="46%" h={8} /></div></div>
                  </div>
                )) : news.slice(0, 5).map(n => {
                  const h = strHue(n.title)
                  return (
                    <Link key={n.id} href={`/naujienos/${n.slug}`} className="hp-card"
                      style={{ display: 'flex', gap: 11, padding: '10px 14px', alignItems: 'flex-start' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}><Cover src={n.image_small_url} alt={sanitizeTitle(n.title)} size={34} radius={8} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                          {n.type && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: `hsl(${h},35%,10%)`, color: `hsl(${h},55%,58%)`, border: `1px solid hsl(${h},35%,16%)` }}>{n.type === 'news' ? 'Naujiena' : n.type === 'review' ? 'Recenzija' : n.type === 'interview' ? 'Interviu' : n.type}</span>}
                          <span style={{ fontSize: 9, color: '#1a2a3c' }}>{timeAgo(n.published_at)}</span>
                        </div>
                        <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 600, color: '#b8ccde', margin: 0, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{sanitizeTitle(n.title)}</p>
                        {n.artist && <p style={{ fontSize: 10, color: '#2a4060', margin: '3px 0 0' }}>{n.artist.name}</p>}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          </div>

          {/* ── Atlikėjai ── */}
          <section>
            <SH label="Atrask atlikėjus" href="/atlikejai" />
            <div className="hp-ag" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 18 }}>
              {artists.length === 0 ? Array(12).fill(null).map((_, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ width: 66, height: 66, borderRadius: 33, margin: '0 auto' }}><Skel w={66} h={66} r={33} /></div>
                  <div style={{ margin: '8px auto 0', maxWidth: 66 }}><Skel w="100%" h={9} /></div>
                </div>
              )) : artists.slice(0, 12).map(a => (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} className="hp-art"
                  style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                  <div className="hp-art-img" style={{ width: 66, height: 66, borderRadius: '50%', margin: '0 auto 8px', overflow: 'hidden', transition: 'transform .3s', boxShadow: `0 5px 18px hsla(${strHue(a.name)},35%,5%,.9)` }}>
                    <Cover src={a.cover_image_url} alt={a.name} size={66} radius={33} />
                  </div>
                  <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 11, fontWeight: 700, color: '#b0c4d8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* ── CTA Atlikėjams ── */}
          <section>
            <div className="hp-cta" style={{ padding: '32px 40px', borderRadius: 18, background: 'linear-gradient(135deg,rgba(29,78,216,.09) 0%,rgba(255,255,255,.015) 100%)', border: '1px solid rgba(29,78,216,.15)', display: 'flex', alignItems: 'center', gap: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 0% 50%,rgba(29,78,216,.06) 0%,transparent 55%)', pointerEvents: 'none' }} />
              <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, background: 'rgba(29,78,216,.15)', border: '1px solid rgba(29,78,216,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎤</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 19, fontWeight: 900, color: '#e8edf6', margin: '0 0 4px' }}>Atlikėjams</h3>
                <p style={{ fontSize: 13, color: '#3a5878', margin: 0, lineHeight: 1.55, maxWidth: 480 }}>Sukurk arba perimk savo profilį Music.lt platformoje. Skelk naujienas, renginius ir naują muziką tiesiai savo gerbėjams — nemokamai.</p>
              </div>
              <Link href="/atlikejai" className="hp-ctabtn"
                style={{ flexShrink: 0, background: '#f97316', color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 24px', borderRadius: 20, textDecoration: 'none', boxShadow: '0 4px 16px rgba(249,115,22,.3)', whiteSpace: 'nowrap', fontFamily: 'Outfit,sans-serif', display: 'inline-flex', alignItems: 'center', transition: 'transform .15s, box-shadow .15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 22px rgba(249,115,22,.42)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(249,115,22,.3)' }}>
                Pradėti nemokamai →
              </Link>
            </div>
          </section>

        </div>
      </div>
    </>
  )
}
