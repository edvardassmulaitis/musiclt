'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSite } from '@/components/SiteContext'

// ── TYPES ──────────────────────────────────────────────────────────────────────

type Track = {
  id: number; slug: string; title: string
  cover_url: string | null; created_at: string
  artists: { id: number; slug: string; name: string } | null
}
type Album = {
  id: number; slug: string; title: string; year: number | null
  cover_image_url: string | null; created_at: string
  artists: { id: number; slug: string; name: string } | null
}
type Artist = {
  id: number; slug: string; name: string
  cover_image_url: string | null
}
type Event = {
  id: number; slug: string; title: string; event_date: string
  venue_custom: string | null; image_small_url: string | null
  venues: { name: string; city: string } | null
}
type NewsItem = {
  id: number; slug: string; title: string
  image_small_url: string | null; published_at: string
  type: string | null
  artist: { name: string; slug: string } | null
}
type TopEntry = {
  pos: number; track_id: number; title: string; artist: string
  cover_url: string | null; trend: string; wks?: number; slug?: string
}
type Nomination = {
  id: number; votes: number; weighted_votes: number
  tracks: { id: number; title: string; cover_url: string | null; artists: { name: string } | null } | null
}
type Discussion = {
  id: number; slug: string; title: string
  author_name: string | null; comment_count: number
  created_at: string; tags: string[]
}
type ShoutMsg = {
  id: number; author_name: string; author_avatar: string | null
  body: string; created_at: string; user_id: string
}
type HeroSlide = {
  type: string; chip: string; chipBg: string; kicker: string
  title: string; subtitle: string; cover: string | null
  href: string; bg: string; glow: string
}

// ── HELPERS ────────────────────────────────────────────────────────────────────

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const days = Math.floor(h / 24)
  if (days === 1) return '1 d.'
  if (days < 7) return `${days} d.`
  return new Date(d).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })
}

const MONTHS_LT = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rgp', 'Rgs', 'Spa', 'Lap', 'Gru']

function strHue(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

function Cover({ src, alt, size = 44, radius = 10 }: { src?: string | null; alt: string; size?: number; radius?: number }) {
  const h = strHue(alt)
  if (src) return <img src={src} alt={alt} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: `linear-gradient(135deg, hsl(${h},45%,18%), hsl(${(h+40)%360},35%,12%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `hsl(${h},50%,42%)`, fontSize: size * 0.36, fontWeight: 900 }}>
      {alt[0]?.toUpperCase() || '?'}
    </div>
  )
}

function TrendIcon({ t }: { t: string }) {
  if (t === 'up') return <span style={{ color: '#34d399', fontSize: 11, fontWeight: 900 }}>↑</span>
  if (t === 'down') return <span style={{ color: '#f87171', fontSize: 11, fontWeight: 900 }}>↓</span>
  if (t === 'new') return <span style={{ fontSize: 8, fontWeight: 900, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '2px 5px', borderRadius: 4 }}>N</span>
  return <span style={{ color: '#1e2e42', fontSize: 11 }}>—</span>
}

function SectionHead({ label, href, cta = 'Visi →' }: { label: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 900, color: '#eef2fa', letterSpacing: '-0.02em', margin: 0 }}>{label}</h2>
      {href && <Link href={href} style={{ fontSize: 12, color: '#4a6fa5', fontWeight: 700, textDecoration: 'none' }}>{cta}</Link>}
    </div>
  )
}

// ── DIENOS DAINA ───────────────────────────────────────────────────────────────

function DienosDainaWidget() {
  const [nominations, setNominations] = useState<Nomination[]>([])
  const [voted, setVoted] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dienos-daina/nominations')
      .then(r => r.json())
      .then(d => { setNominations(d.nominations || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const winner = nominations[0]

  return (
    <div style={{ background: 'linear-gradient(160deg, rgba(29,78,216,0.18) 0%, rgba(8,13,20,0.98) 100%)', border: '1px solid rgba(29,78,216,0.2)', borderRadius: 18, overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Cover src={winner?.tracks?.cover_url} alt={winner?.tracks?.title || 'daina'} size={60} radius={12} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, color: '#3d5878', margin: '0 0 3px' }}>Šiandien pirmauja</p>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: '#f2f4f8', margin: '0 0 2px', lineHeight: 1.2 }}>
            {loading ? '...' : winner?.tracks?.title || 'Dar nėra'}
          </h3>
          <p style={{ fontSize: 12, color: 'rgba(200,215,240,0.5)', margin: 0 }}>{winner?.tracks?.artists?.name || ''}</p>
        </div>
        <Link href="/dienos-daina" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, background: '#f97316', color: '#fff', fontWeight: 900, fontSize: 11, padding: '7px 14px', borderRadius: 20, textDecoration: 'none', boxShadow: '0 3px 12px rgba(249,115,22,0.4)' }}>
          ▶ Balsuoti
        </Link>
      </div>

      <div style={{ padding: '4px 0 8px' }}>
        <div style={{ padding: '6px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 900, color: '#2a3a50', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Rytdienos kandidatai</span>
          <Link href="/dienos-daina" style={{ fontSize: 9, color: '#4a6fa5', fontWeight: 700, textDecoration: 'none' }}>+ Siūlyti</Link>
        </div>
        {loading
          ? <div style={{ padding: '12px 18px', color: '#3d5878', fontSize: 12 }}>Kraunama...</div>
          : nominations.slice(0, 5).map((n, i) => (
            <div key={n.id} className="hp-row"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 18px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: '#1e2e42', width: 16, textAlign: 'center', flexShrink: 0 }}>#{i + 1}</span>
              <Cover src={n.tracks?.cover_url} alt={n.tracks?.title || '?'} size={28} radius={7} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#dde8f8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.tracks?.title}</p>
                <p style={{ fontSize: 10, color: '#3d5878', margin: 0 }}>{n.tracks?.artists?.name}</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 900, color: 'rgba(200,215,240,0.3)', flexShrink: 0, minWidth: 18, textAlign: 'right' }}>{voted === i ? n.votes + 1 : n.votes}</span>
              <button onClick={() => voted === null && setVoted(i)} disabled={voted !== null}
                style={{ fontSize: 10, fontWeight: 900, padding: '3px 10px', borderRadius: 12, flexShrink: 0, cursor: voted !== null ? 'default' : 'pointer', border: voted === i ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(29,78,216,0.3)', background: voted === i ? 'rgba(52,211,153,0.1)' : 'transparent', color: voted === i ? '#34d399' : voted !== null ? 'rgba(255,255,255,0.15)' : '#60a5fa', transition: 'all 0.15s' }}>
                {voted === i ? '✓' : 'Balsuoti'}
              </button>
            </div>
          ))}
      </div>
    </div>
  )
}

// ── SHOUTBOX ───────────────────────────────────────────────────────────────────

function ShoutboxWidget() {
  const [msgs, setMsgs] = useState<ShoutMsg[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (since?: string) => {
    try {
      const url = since
        ? `/api/live/shoutbox?since=${encodeURIComponent(since)}&limit=12`
        : '/api/live/shoutbox?limit=12'
      const r = await fetch(url)
      const d = await r.json()
      if (d.messages?.length) {
        if (!since) {
          setMsgs([...d.messages].reverse())
        } else {
          setMsgs(prev => {
            const ids = new Set(prev.map(m => m.id))
            const fresh = d.messages.filter((m: ShoutMsg) => !ids.has(m.id))
            return fresh.length ? [...prev, ...fresh].slice(-12) : prev
          })
        }
      }
      setLoading(false)
    } catch { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(() => {
      setMsgs(prev => {
        const last = prev[prev.length - 1]
        if (last) load(last.created_at)
        return prev
      })
    }, 8000)
    return () => clearInterval(iv)
  }, [load])

  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>💬</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#eef2fa' }}>Gyvi pokalbiai</span>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e', animation: 'hp-blink 2s infinite' }} />
        </div>
        <Link href="/bendruomene" style={{ fontSize: 10, color: '#4a6fa5', fontWeight: 700, textDecoration: 'none' }}>Visi →</Link>
      </div>
      <div style={{ minHeight: 120 }}>
        {loading
          ? <div style={{ padding: '20px', color: '#3d5878', fontSize: 12, textAlign: 'center' }}>Kraunama...</div>
          : msgs.length === 0
          ? <div style={{ padding: '20px', color: '#3d5878', fontSize: 12, textAlign: 'center' }}>Dar nėra žinučių</div>
          : msgs.slice(-6).map((m, i, arr) => (
            <div key={m.id} style={{ display: 'flex', gap: 10, padding: '8px 16px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: `hsl(${strHue(m.author_name)},30%,16%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: `hsl(${strHue(m.author_name)},50%,52%)` }}>
                {m.author_name[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa' }}>{m.author_name}</span>
                  <span style={{ fontSize: 9, color: '#1e2e42' }}>{timeAgo(m.created_at)}</span>
                </div>
                <p style={{ fontSize: 12, color: 'rgba(200,218,245,0.65)', margin: 0, lineHeight: 1.4 }}>{m.body}</p>
              </div>
            </div>
          ))}
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/bendruomene" style={{ display: 'block', textAlign: 'center', padding: '7px', borderRadius: 12, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
          Prisijungti prie pokalbio →
        </Link>
      </div>
    </div>
  )
}

// ── DISCUSSIONS ────────────────────────────────────────────────────────────────

function DiscussionsWidget() {
  const [discussions, setDiscussions] = useState<Discussion[]>([])

  useEffect(() => {
    fetch('/api/diskusijos?sort=activity&limit=4')
      .then(r => r.json())
      .then(d => setDiscussions(d.discussions || []))
      .catch(() => {})
  }, [])

  if (!discussions.length) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {discussions.map(d => (
        <Link key={d.id} href={`/diskusijos/${d.slug}`}
          className="hp-card"
          style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none', display: 'block' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            {(d.tags || []).slice(0, 1).map(t => (
              <span key={t} style={{ fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 4, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}>{t}</span>
            ))}
            <span style={{ fontSize: 9, color: '#2a3a50', marginLeft: 'auto' }}>{timeAgo(d.created_at)}</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d8f0', margin: '0 0 5px', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{d.title}</p>
          <p style={{ fontSize: 10, color: '#3d5878', margin: 0 }}>{d.author_name} · 💬 {d.comment_count}</p>
        </Link>
      ))}
    </div>
  )
}

// ── SKELETON ───────────────────────────────────────────────────────────────────

function Skel({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
}

// ── MAIN ───────────────────────────────────────────────────────────────────────

export default function Home() {
  const { lens } = useSite()
  const [chartTab, setChartTab] = useState<'lt' | 'world'>('lt')
  const [ltTop, setLtTop] = useState<TopEntry[]>([])
  const [worldTop, setWorldTop] = useState<TopEntry[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [genreFilter, setGenreFilter] = useState('Visi')
  const [cityFilter, setCityFilter] = useState('Visi')
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([])
  const [heroIdx, setHeroIdx] = useState(0)
  const timerRef = useRef<any>(null)

  // Parse top entries helper
  const parseTop = (entries: any[]): TopEntry[] =>
    entries.slice(0, 7).map(e => {
      const prev = e.prev_position
      const cur = e.position
      const trend = e.is_new ? 'new' : !prev ? 'same' : cur < prev ? 'up' : cur > prev ? 'down' : 'same'
      return {
        pos: e.position,
        track_id: e.track_id,
        title: e.tracks?.title || '',
        artist: e.tracks?.artists?.name || '',
        cover_url: e.tracks?.cover_url || null,
        trend,
        wks: e.weeks_in_top,
        slug: e.tracks?.slug,
      }
    })

  useEffect(() => {
    // LT Top 30
    fetch('/api/top/entries?type=lt_top30')
      .then(r => r.json())
      .then(d => setLtTop(parseTop(d.entries || [])))
      .catch(() => {})

    // World Top 40
    fetch('/api/top/entries?type=top40')
      .then(r => r.json())
      .then(d => setWorldTop(parseTop(d.entries || [])))
      .catch(() => {})

    // Tracks
    fetch('/api/tracks?limit=16')
      .then(r => r.json())
      .then(d => setTracks(d.tracks || []))
      .catch(() => {})

    // Albums
    fetch('/api/albums?limit=10')
      .then(r => r.json())
      .then(d => setAlbums(d.albums || []))
      .catch(() => {})

    // Artists
    fetch('/api/artists?limit=12')
      .then(r => r.json())
      .then(d => setArtists(d.artists || []))
      .catch(() => {})

    // Events
    fetch('/api/events?limit=6')
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => {})

    // News
    fetch('/api/news?limit=6')
      .then(r => r.json())
      .then(d => setNews(d.news || []))
      .catch(() => {})
  }, [])

  // Build hero slides from news + albums + events
  useEffect(() => {
    const slides: HeroSlide[] = []
    news.slice(0, 2).forEach(n => {
      const h = strHue(n.title)
      slides.push({
        type: 'news', chip: n.type || 'Naujiena', chipBg: '#2563eb',
        kicker: timeAgo(n.published_at),
        title: n.artist?.name || 'music.lt',
        subtitle: n.title,
        cover: n.image_small_url,
        href: `/naujienos/${n.slug}`,
        bg: `linear-gradient(135deg, hsl(${h},40%,5%) 0%, hsl(${(h+30)%360},50%,9%) 55%, hsl(${h},40%,5%) 100%)`,
        glow: `radial-gradient(ellipse at 25% 55%, hsla(${h},60%,40%,0.25) 0%, transparent 55%)`,
      })
    })
    albums.slice(0, 2).forEach(a => {
      const h = strHue(a.title)
      slides.push({
        type: 'album', chip: 'Albumas', chipBg: '#7c3aed',
        kicker: a.year ? `${a.year} m.` : 'Naujas',
        title: a.artists?.name || '',
        subtitle: a.title,
        cover: a.cover_image_url,
        href: `/muzika/${a.slug}`,
        bg: `linear-gradient(135deg, hsl(${h},40%,5%) 0%, hsl(${(h+40)%360},50%,9%) 55%, hsl(${h},40%,5%) 100%)`,
        glow: `radial-gradient(ellipse at 25% 55%, hsla(${h},55%,38%,0.3) 0%, transparent 55%)`,
      })
    })
    events.slice(0, 1).forEach(e => {
      const d = new Date(e.event_date)
      slides.push({
        type: 'event', chip: 'Renginys', chipBg: '#059669',
        kicker: `${d.getDate()} ${MONTHS_LT[d.getMonth()]}. · ${e.venues?.city || ''}`,
        title: e.title,
        subtitle: e.venues?.name || e.venue_custom || '',
        cover: e.image_small_url,
        href: `/renginiai/${e.slug}`,
        bg: 'linear-gradient(135deg, #050e0a 0%, #081a10 55%, #050e0a 100%)',
        glow: 'radial-gradient(ellipse at 25% 55%, rgba(5,150,105,0.28) 0%, transparent 55%)',
      })
    })
    if (!slides.length) {
      slides.push({
        type: 'promo', chip: '🇱🇹 Lietuviška muzika', chipBg: '#f97316',
        kicker: 'Platforma', title: 'music.lt',
        subtitle: 'Visi Lietuvos atlikėjai vienoje vietoje',
        cover: null, href: '/atlikejai',
        bg: 'linear-gradient(135deg, #0c1524 0%, #19103a 55%, #0c1524 100%)',
        glow: 'radial-gradient(ellipse at 25% 55%, rgba(99,102,241,0.38) 0%, transparent 55%)',
      })
    }
    setHeroSlides(slides)
    setHeroIdx(0)
  }, [news, albums, events])

  // Hero autoplay
  useEffect(() => {
    if (!heroSlides.length) return
    timerRef.current = setTimeout(() => setHeroIdx(p => (p + 1) % heroSlides.length), 7000)
    return () => clearTimeout(timerRef.current)
  }, [heroIdx, heroSlides.length])

  const hero = heroSlides[heroIdx]
  const chartData = chartTab === 'lt' ? ltTop : worldTop
  const cities = ['Visi', ...Array.from(new Set(events.map(e => e.venues?.city).filter(Boolean) as string[]))]
  const filteredEvents = cityFilter === 'Visi' ? events : events.filter(e => e.venues?.city === cityFilter)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@400;500;700;900&display=swap');
        .hp-wrap * { box-sizing: border-box; }
        .hp-wrap { font-family: 'DM Sans', sans-serif; }
        @keyframes hp-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes hp-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .hp-card { transition: border-color 0.15s; }
        .hp-card:hover { border-color: rgba(255,255,255,0.16) !important; }
        .hp-row:hover { background: rgba(255,255,255,0.03); }
        .hp-track:hover { background: rgba(255,255,255,0.05) !important; }
        .hp-art:hover .hp-art-img { transform: scale(1.07); }
        .hp-scroll { overflow-x: auto; scrollbar-width: none; }
        .hp-scroll::-webkit-scrollbar { display: none; }
        .hp-pill { cursor: pointer; padding: 5px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; border: 1px solid rgba(255,255,255,0.07); color: #5a7898; background: transparent; transition: all 0.15s; white-space: nowrap; }
        .hp-pill.hp-active { background: rgba(29,78,216,0.2); border-color: rgba(29,78,216,0.35); color: #93c5fd; }
        .hp-pill:hover { color: #c8d8f0; border-color: rgba(255,255,255,0.14); }
        .hp-gfilt { padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; text-align: left; border: 1px solid transparent; cursor: pointer; transition: all 0.15s; background: transparent; }
        .hp-hero-in { animation: hp-in 0.5s ease; }
      `}</style>

      <div className="hp-wrap">

        {/* ━━━━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {hero && (
          <section style={{ position: 'relative', overflow: 'hidden', background: hero.bg, transition: 'background 1s ease', minHeight: 300 }}>
            <div style={{ position: 'absolute', inset: 0, background: hero.glow, transition: 'all 0.8s', pointerEvents: 'none' }} />
            {/* subtle grain grid */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.018, backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />

            <div style={{ position: 'relative', maxWidth: 1360, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'stretch', gap: 0 }}>

              {/* Left — hero */}
              <div style={{ flex: 1, padding: '44px 36px 44px 0', display: 'flex', alignItems: 'center', gap: 32, borderRight: '1px solid rgba(255,255,255,0.07)', minWidth: 0 }}>

                {/* Cover art */}
                <div style={{ position: 'relative', flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.querySelector('.hp-play') as HTMLElement).style.opacity = '1'}
                  onMouseLeave={e => (e.currentTarget.querySelector('.hp-play') as HTMLElement).style.opacity = '0'}>
                  <div style={{ width: 176, height: 176, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.7)', transition: 'transform 0.3s', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                    <Cover src={hero.cover} alt={hero.title || '?'} size={176} radius={20} />
                  </div>
                  <div className="hp-play" style={{ position: 'absolute', inset: 0, borderRadius: 20, background: 'rgba(0,0,0,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s', cursor: 'pointer', pointerEvents: 'none' }}>
                    <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'rgba(249,115,22,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontSize: 20, marginLeft: 3 }}>▶</span>
                    </div>
                  </div>
                </div>

                {/* Text */}
                <div className="hp-hero-in" key={heroIdx} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 900, color: '#fff', background: hero.chipBg }}>{hero.chip}</span>
                    <span style={{ fontSize: 12, color: 'rgba(200,215,240,0.45)', fontWeight: 500 }}>{hero.kicker}</span>
                  </div>
                  <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 44, fontWeight: 900, color: '#f2f4f8', lineHeight: 1.05, margin: '0 0 6px', letterSpacing: '-0.02em' }}>{hero.title}</h1>
                  <p style={{ fontSize: 19, fontWeight: 400, color: 'rgba(200,215,240,0.42)', margin: '0 0 22px', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}>{hero.subtitle}</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Link href={hero.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#f97316', color: '#fff', fontWeight: 900, fontSize: 13, padding: '10px 22px', borderRadius: 24, textDecoration: 'none', boxShadow: '0 4px 20px rgba(249,115,22,0.38)' }}>
                      ▶ Atidaryti
                    </Link>
                    <Link href={hero.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(200,215,240,0.52)', fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 24, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.11)' }}>
                      Daugiau info
                    </Link>
                  </div>
                </div>

                {/* Arrow nav */}
                {heroSlides.length > 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setHeroIdx(p => ((p - 1) + heroSlides.length) % heroSlides.length)}
                      style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(200,215,240,0.35)', cursor: 'pointer', fontSize: 14 }}>←</button>
                    <button onClick={() => setHeroIdx(p => (p + 1) % heroSlides.length)}
                      style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(200,215,240,0.35)', cursor: 'pointer', fontSize: 14 }}>→</button>
                  </div>
                )}
              </div>

              {/* Right — chart */}
              <div style={{ width: 360, flexShrink: 0, padding: '30px 0 30px 26px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* Tab switcher */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', borderRadius: 20, padding: 3, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', gap: 2 }}>
                    {([['lt', '🇱🇹 LT Top 30'], ['world', '🌍 Top 40']] as const).map(([k, l]) => (
                      <button key={k} onClick={() => setChartTab(k)}
                        style={{ padding: '5px 11px', borderRadius: 16, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: chartTab === k ? '#1d4ed8' : 'transparent', color: chartTab === k ? '#fff' : '#3a5070' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <Link href="/topas" style={{ fontSize: 11, color: '#4a6fa5', fontWeight: 700, textDecoration: 'none' }}>Visi →</Link>
                </div>

                {/* Chart rows */}
                <div style={{ flex: 1 }}>
                  {chartData.length === 0
                    ? Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <Skel w={18} h={14} /><Skel w={14} h={10} /><Skel w={30} h={30} r={8} />
                        <div style={{ flex: 1 }}><Skel w="70%" h={10} /><div style={{ marginTop: 4 }}><Skel w="50%" h={8} /></div></div>
                      </div>
                    ))
                    : chartData.map((t, i) => (
                    <Link key={t.track_id || i} href={t.slug ? `/muzika/${t.slug}` : '/topas'}
                      className="hp-track" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.1s', textDecoration: 'none', borderBottom: i < chartData.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                      <span style={{ width: 18, textAlign: 'center', fontSize: 13, fontWeight: 900, color: t.pos <= 3 ? '#f97316' : '#1e2e42', flexShrink: 0 }}>{t.pos}</span>
                      <div style={{ width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><TrendIcon t={t.trend} /></div>
                      <Cover src={t.cover_url} alt={t.title} size={30} radius={7} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#eef2fa', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                        <p style={{ fontSize: 10, color: '#5a7898', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artist}</p>
                      </div>
                      {t.wks && <span style={{ fontSize: 9, color: '#1e2e42', flexShrink: 0 }}>{t.wks}w</span>}
                    </Link>
                  ))}
                </div>

                <Link href="/topas" style={{ marginTop: 12, display: 'block', textAlign: 'center', padding: '7px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', color: '#4a6fa5', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  Žiūrėti visą topą →
                </Link>
              </div>
            </div>

            {/* Dots */}
            {heroSlides.length > 1 && (
              <div style={{ position: 'absolute', bottom: 12, left: '37%', display: 'flex', gap: 6, alignItems: 'center' }}>
                {heroSlides.map((_, i) => (
                  <button key={i} onClick={() => setHeroIdx(i)}
                    style={{ borderRadius: 4, border: 'none', cursor: 'pointer', background: i === heroIdx ? '#f97316' : 'rgba(255,255,255,0.18)', width: i === heroIdx ? 20 : 6, height: 6, transition: 'all 0.25s', padding: 0 }} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ━━━━━ CONTENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '52px 24px', display: 'flex', flexDirection: 'column', gap: 60 }}>

          {/* ─── DAINOS + ALBUMAI ─────────────────────────────────── */}
          <section>
            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>

              {/* Genre sidebar */}
              <div style={{ width: 116, flexShrink: 0 }}>
                <p style={{ fontSize: 9, fontWeight: 900, color: '#2a3a50', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px' }}>Stilius</p>
                {['Visi', 'Pop', 'Rokas', 'Hip-hop', 'Elektronika', 'Folk', 'Jazz'].map(g => (
                  <button key={g} className="hp-gfilt" onClick={() => setGenreFilter(g)}
                    style={{ display: 'block', width: '100%', color: genreFilter === g ? '#93c5fd' : '#3a5878', background: genreFilter === g ? 'rgba(29,78,216,0.15)' : 'transparent', border: genreFilter === g ? '1px solid rgba(29,78,216,0.3)' : '1px solid transparent' }}>
                    {g}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>

                {/* Naujos dainos */}
                <div>
                  <SectionHead label="Naujos dainos" href="/muzika" />
                  <div className="hp-scroll" style={{ display: 'flex', gap: 10, paddingBottom: 4 }}>
                    {tracks.length === 0
                      ? Array(8).fill(null).map((_, i) => (
                        <div key={i} style={{ width: 200, flexShrink: 0, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Skel w={42} h={42} r={10} /><div style={{ flex: 1 }}><Skel w="80%" h={10} /><div style={{ marginTop: 5 }}><Skel w="60%" h={8} /></div></div>
                        </div>
                      ))
                      : tracks.slice(0, 14).map(t => (
                      <Link key={t.id} href={`/muzika/${t.slug}`} className="hp-card"
                        style={{ width: 200, flexShrink: 0, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                        <Cover src={t.cover_url} alt={t.title} size={42} radius={10} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#eef2fa', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                          <p style={{ fontSize: 11, color: '#5a7898', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artists?.name}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Nauji albumai */}
                <div>
                  <SectionHead label="Nauji albumai" href="/muzika?tab=albums" />
                  <div className="hp-scroll" style={{ display: 'flex', gap: 12, paddingBottom: 4 }}>
                    {albums.length === 0
                      ? Array(5).fill(null).map((_, i) => (
                        <div key={i} style={{ width: 230, flexShrink: 0, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Skel w={52} h={52} r={12} /><div style={{ flex: 1 }}><Skel w="75%" h={10} /><div style={{ marginTop: 5 }}><Skel w="55%" h={9} /></div></div>
                        </div>
                      ))
                      : albums.slice(0, 10).map(a => (
                      <Link key={a.id} href={`/muzika/${a.slug}`} className="hp-card"
                        style={{ width: 228, flexShrink: 0, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
                        <Cover src={a.cover_image_url} alt={a.title} size={52} radius={12} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#eef2fa', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</p>
                          <p style={{ fontSize: 11, color: '#5a7898', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.artists?.name}</p>
                          {a.year && <p style={{ fontSize: 10, color: '#2a3a50', margin: 0 }}>{a.year}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </section>

          {/* ─── DIENOS DAINA + SHOUTBOX ──────────────────────────── */}
          <section>
            <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 20, alignItems: 'start' }}>
              <div>
                <SectionHead label="🎵 Dienos daina" href="/dienos-daina" />
                <DienosDainaWidget />
              </div>
              <div>
                <SectionHead label="💬 Gyvi pokalbiai" href="/bendruomene" cta="Bendruomenė →" />
                <ShoutboxWidget />
              </div>
            </div>
          </section>

          {/* ─── DISKUSIJOS ───────────────────────────────────────── */}
          <section>
            <SectionHead label="Bendruomenė" href="/diskusijos" cta="Visos diskusijos →" />
            <DiscussionsWidget />
          </section>

          {/* ─── RENGINIAI + NAUJIENOS ────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>

            <section>
              <SectionHead label="Renginiai" href="/renginiai" />
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {cities.slice(0, 6).map(c => (
                  <button key={c} className={`hp-pill${cityFilter === c ? ' hp-active' : ''}`} onClick={() => setCityFilter(c)}>{c}</button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredEvents.length === 0
                  ? <div style={{ padding: '24px', textAlign: 'center', color: '#3d5878', fontSize: 13, borderRadius: 14, border: '1px solid rgba(255,255,255,0.05)' }}>Renginių nerasta</div>
                  : filteredEvents.slice(0, 5).map(e => {
                  const d = new Date(e.event_date)
                  return (
                    <Link key={e.id} href={`/renginiai/${e.slug}`} className="hp-card"
                      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none' }}>
                      <div style={{ textAlign: 'center', width: 36, flexShrink: 0 }}>
                        <p style={{ fontSize: 22, fontWeight: 900, color: '#f2f4f8', margin: 0, lineHeight: 1 }}>{d.getDate()}</p>
                        <p style={{ fontSize: 9, fontWeight: 900, color: '#f97316', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{MONTHS_LT[d.getMonth()]}</p>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#dde8f8', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</p>
                        <p style={{ fontSize: 11, color: '#3d5878', margin: 0 }}>{e.venues?.name || e.venue_custom} · {e.venues?.city}</p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', flexShrink: 0 }}>Bilietai →</span>
                    </Link>
                  )
                })}
              </div>
            </section>

            <section>
              <SectionHead label="Naujienos" href="/naujienos" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {news.length === 0
                  ? Array(4).fill(null).map((_, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
                      <Skel w={36} h={36} r={8} />
                      <div style={{ flex: 1 }}><Skel w="90%" h={10} /><div style={{ marginTop: 5 }}><Skel w="50%" h={8} /></div></div>
                    </div>
                  ))
                  : news.slice(0, 5).map(n => {
                    const h = strHue(n.title)
                    return (
                      <Link key={n.id} href={`/naujienos/${n.slug}`} className="hp-card"
                        style={{ display: 'flex', gap: 14, padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none', alignItems: 'flex-start' }}>
                        <div style={{ width: 38, height: 38, borderRadius: 9, overflow: 'hidden', flexShrink: 0 }}>
                          <Cover src={n.image_small_url} alt={n.title} size={38} radius={9} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            {n.type && <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, background: `hsl(${h},40%,11%)`, color: `hsl(${h},60%,60%)`, border: `1px solid hsl(${h},40%,17%)` }}>{n.type}</span>}
                            <span style={{ fontSize: 9, color: '#2a3a50' }}>{timeAgo(n.published_at)}</span>
                          </div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#c8d8f0', margin: 0, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{n.title}</p>
                        </div>
                      </Link>
                    )
                  })}
              </div>
            </section>

          </div>

          {/* ─── ATRASK ATLIKĖJUS ─────────────────────────────────── */}
          <section>
            <SectionHead label="Atrask atlikėjus" href="/atlikejai" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 22 }}>
              {artists.length === 0
                ? Array(12).fill(null).map((_, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <Skel w={80} h={80} r={40} /><div style={{ margin: '10px auto 0', maxWidth: 80 }}><Skel w="100%" h={9} /></div>
                  </div>
                ))
                : artists.slice(0, 12).map(a => (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} className="hp-art"
                  style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                  <div className="hp-art-img" style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 10px', overflow: 'hidden', transition: 'transform 0.3s', boxShadow: `0 8px 22px hsla(${strHue(a.name)},40%,6%,0.8)` }}>
                    <Cover src={a.cover_image_url} alt={a.name} size={80} radius={40} />
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#c8d8f0', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* ─── ATLIKĖJAMS CTA ───────────────────────────────────── */}
          <section>
            <div style={{ padding: '40px 48px', borderRadius: 24, background: 'linear-gradient(135deg, rgba(29,78,216,0.1) 0%, rgba(255,255,255,0.018) 100%)', border: '1px solid rgba(29,78,216,0.18)', display: 'flex', alignItems: 'center', gap: 28, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 0% 50%, rgba(29,78,216,0.07) 0%, transparent 55%)', pointerEvents: 'none' }} />
              <div style={{ width: 64, height: 64, borderRadius: 18, flexShrink: 0, background: 'rgba(29,78,216,0.18)', border: '1px solid rgba(29,78,216,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🎤</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 900, color: '#f2f4f8', margin: '0 0 6px' }}>Atlikėjams</h3>
                <p style={{ fontSize: 13, color: '#4a6080', margin: 0, lineHeight: 1.6, maxWidth: 520 }}>Sukurk arba perimk savo profilį Music.lt platformoje. Skelk naujienas, renginius ir naują muziką tiesiai savo gerbėjams — nemokamai.</p>
              </div>
              <Link href="/atlikejai" style={{ flexShrink: 0, background: '#f97316', color: '#fff', fontWeight: 900, fontSize: 13, padding: '12px 28px', borderRadius: 24, textDecoration: 'none', boxShadow: '0 4px 20px rgba(249,115,22,0.35)', whiteSpace: 'nowrap' }}>
                Pradėti nemokamai →
              </Link>
            </div>
          </section>

        </div>
      </div>
    </>
  )
}
