'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSite } from '@/components/SiteContext'

// ── TYPES ──────────────────────────────────────────────────────────────────────

type Track = { id: number; slug: string; title: string; cover_url: string | null; video_url: string | null; release_date: string | null; created_at: string; artists: { id: number; slug: string; name: string; cover_image_url: string | null } | null }
type Album = { id: number; slug: string; title: string; year: number | null; cover_image_url: string | null; created_at: string; artists: { id: number; slug: string; name: string } | null }
type Artist = { id: number; slug: string; name: string; cover_image_url: string | null; genres?: string }
type Event = { id: number; slug: string; title: string; event_date: string; venue_custom: string | null; image_small_url: string | null; venues: { name: string; city: string } | null }
type NewsItem = { id: number; slug: string; title: string; image_small_url: string | null; published_at: string; type: string | null; artists: { name: string } | null }
type TopEntry = { pos: number; track_id: number; title: string; artist: string; cover_url: string | null; trend: string; wks?: number }
type Nomination = { id: number; tracks: { id: number; title: string; cover_url: string | null; artists: { name: string } | null } | null; votes: number; weighted_votes: number }
type Discussion = { id: number; slug: string; title: string; author_name: string | null; comment_count: number; created_at: string; tags: string[] }
type ShoutMsg = { id: number; author_name: string; author_avatar: string | null; body: string; created_at: string; user_id: string }

// ── HELPERS ────────────────────────────────────────────────────────────────────

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

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })
}

function hue(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360
  return h
}

function Cover({ src, alt, size = 44, radius = 10 }: { src?: string | null; alt: string; size?: number; radius?: number }) {
  const h = hue(alt)
  return src
    ? <img src={src} alt={alt} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />
    : <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: `linear-gradient(135deg, hsl(${h},45%,18%), hsl(${h+40},35%,12%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `hsl(${h},50%,40%)`, fontSize: size * 0.35, fontWeight: 900 }}>
        {alt[0]?.toUpperCase()}
      </div>
}

function TrendIcon({ t }: { t: string }) {
  if (t === 'up') return <span style={{ color: '#34d399', fontSize: 11, fontWeight: 900 }}>↑</span>
  if (t === 'down') return <span style={{ color: '#f87171', fontSize: 11, fontWeight: 900 }}>↓</span>
  if (t === 'new') return <span style={{ fontSize: 8, fontWeight: 900, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '2px 5px', borderRadius: 4 }}>N</span>
  return <span style={{ color: '#1e2e42', fontSize: 11 }}>—</span>
}

// ── WORLD MOCK (nera DB) ───────────────────────────────────────────────────────

const WORLD_TOP: TopEntry[] = [
  { pos: 1, track_id: 0, title: 'APT.', artist: 'Rose & Bruno Mars', cover_url: null, trend: 'same' },
  { pos: 2, track_id: 0, title: 'Disease', artist: 'Lady Gaga', cover_url: null, trend: 'up' },
  { pos: 3, track_id: 0, title: 'Espresso', artist: 'Sabrina Carpenter', cover_url: null, trend: 'down' },
  { pos: 4, track_id: 0, title: 'Birds of a Feather', artist: 'Billie Eilish', cover_url: null, trend: 'up' },
  { pos: 5, track_id: 0, title: 'Good Luck, Babe!', artist: 'Chappell Roan', cover_url: null, trend: 'new' },
  { pos: 6, track_id: 0, title: 'Luther', artist: 'Kendrick Lamar', cover_url: null, trend: 'up' },
  { pos: 7, track_id: 0, title: 'Saturn', artist: 'SZA', cover_url: null, trend: 'down' },
]

const MONTHS_LT = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rgp', 'Rgs', 'Spa', 'Lap', 'Gru']

// ── SUB-COMPONENTS ─────────────────────────────────────────────────────────────

function SectionHead({ label, href, cta = 'Visi →' }: { label: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 900, color: '#eef2fa', letterSpacing: '-0.02em', margin: 0 }}>{label}</h2>
      {href && <Link href={href} style={{ fontSize: 12, color: '#4a6fa5', fontWeight: 700, textDecoration: 'none' }}>{cta}</Link>}
    </div>
  )
}

function Card({ children, style, href }: { children: React.ReactNode; style?: React.CSSProperties; href?: string }) {
  const base: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    transition: 'border-color 0.15s',
    cursor: 'pointer',
    ...style,
  }
  if (href) return <Link href={href} style={{ ...base, display: 'block', textDecoration: 'none' }}>{children}</Link>
  return <div style={base}>{children}</div>
}

// ── DIENOS DAINA WIDGET ────────────────────────────────────────────────────────

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
      {/* Winner */}
      <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Cover src={winner?.tracks?.cover_url} alt={winner?.tracks?.title || '?'} size={60} radius={12} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, color: '#3d5878', marginBottom: 2 }}>Šiandien pirmauja</p>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: '#f2f4f8', margin: 0, lineHeight: 1.2 }}>
            {loading ? '...' : (winner?.tracks?.title || 'Dar nėra')}
          </h3>
          <p style={{ fontSize: 12, color: 'rgba(200,215,240,0.5)', margin: 0 }}>
            {winner?.tracks?.artists?.name || ''}
          </p>
        </div>
        <Link href="/dienos-daina" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, background: '#f97316', color: '#fff', fontWeight: 900, fontSize: 11, padding: '7px 14px', borderRadius: 20, textDecoration: 'none' }}>
          ▶ Balsuoti
        </Link>
      </div>

      {/* Candidates */}
      <div style={{ padding: '8px 0' }}>
        <div style={{ padding: '4px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 900, color: '#2a3a50', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Rytdienos kandidatai</span>
          <Link href="/dienos-daina" style={{ fontSize: 9, color: '#4a6fa5', fontWeight: 700, textDecoration: 'none' }}>+ Siūlyti</Link>
        </div>
        {loading
          ? <div style={{ padding: '12px 18px', color: '#3d5878', fontSize: 12 }}>Kraunama...</div>
          : nominations.slice(0, 5).map((n, i) => (
          <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 18px', borderTop: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <span style={{ fontSize: 10, fontWeight: 900, color: '#1e2e42', width: 16, textAlign: 'center', flexShrink: 0 }}>#{i + 1}</span>
            <Cover src={n.tracks?.cover_url} alt={n.tracks?.title || '?'} size={28} radius={6} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#dde8f8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.tracks?.title}</p>
              <p style={{ fontSize: 10, color: '#3d5878', margin: 0 }}>{n.tracks?.artists?.name}</p>
            </div>
            <span style={{ fontSize: 10, fontWeight: 900, color: 'rgba(200,215,240,0.3)', flexShrink: 0, minWidth: 20, textAlign: 'right' }}>{voted === i ? n.votes + 1 : n.votes}</span>
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

// ── SHOUTBOX WIDGET ────────────────────────────────────────────────────────────

function ShoutboxWidget() {
  const [msgs, setMsgs] = useState<ShoutMsg[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (since?: string) => {
    const url = since ? `/api/live/shoutbox?since=${encodeURIComponent(since)}&limit=10` : '/api/live/shoutbox?limit=10'
    const r = await fetch(url)
    const d = await r.json()
    if (d.messages?.length) {
      if (!since) setMsgs([...d.messages].reverse())
      else setMsgs(prev => {
        const ids = new Set(prev.map(m => m.id))
        const n = d.messages.filter((m: ShoutMsg) => !ids.has(m.id))
        return n.length ? [...prev, ...n].slice(-10) : prev
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(() => setMsgs(prev => { const l = prev[prev.length - 1]; if (l) load(l.created_at); return prev }), 8000)
    return () => clearInterval(iv)
  }, [load])

  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>💬</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: '#eef2fa' }}>Gyvi pokalbiai</span>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e', animation: 'hp-blink 2s infinite' }} />
        </div>
        <Link href="/bendruomene" style={{ fontSize: 10, color: '#4a6fa5', fontWeight: 700, textDecoration: 'none' }}>Visi →</Link>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {loading
          ? <div style={{ padding: '16px', color: '#3d5878', fontSize: 12, textAlign: 'center' }}>Kraunama...</div>
          : msgs.length === 0
          ? <div style={{ padding: '16px', color: '#3d5878', fontSize: 12, textAlign: 'center' }}>Dar nėra žinučių</div>
          : msgs.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', gap: 10, padding: '7px 16px', borderBottom: i < msgs.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: `hsl(${hue(m.author_name)},30%,16%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: `hsl(${hue(m.author_name)},50%,50%)` }}>
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

// ── DISCUSSIONS WIDGET ─────────────────────────────────────────────────────────

function DiscussionsWidget() {
  const [discussions, setDiscussions] = useState<Discussion[]>([])

  useEffect(() => {
    fetch('/api/diskusijos?sort=activity&limit=4')
      .then(r => r.json())
      .then(d => setDiscussions(d.discussions || []))
  }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {discussions.map(d => (
        <Card key={d.id} href={`/diskusijos/${d.slug}`} style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            {(d.tags || []).slice(0, 1).map(t => (
              <span key={t} style={{ fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 4, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}>{t}</span>
            ))}
            <span style={{ fontSize: 9, color: '#2a3a50' }}>{timeAgo(d.created_at)}</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d8f0', margin: '0 0 4px', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>{d.title}</p>
          <p style={{ fontSize: 10, color: '#3d5878', margin: 0 }}>{d.author_name} · 💬 {d.comment_count}</p>
        </Card>
      ))}
    </div>
  )
}

// ── MAIN HOME ──────────────────────────────────────────────────────────────────

export default function Home() {
  const { lens } = useSite()
  const [chartTab, setChartTab] = useState<'lt' | 'world'>('lt')
  const [ltTop, setLtTop] = useState<TopEntry[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [genreFilter, setGenreFilter] = useState('Visi')
  const [cityFilter, setCityFilter] = useState('Visi')
  const [heroIdx, setHeroIdx] = useState(0)
  const [heroItems, setHeroItems] = useState<any[]>([])
  const timerRef = useRef<any>(null)

  // Fetch all data
  useEffect(() => {
    // LT Top
    fetch('/api/top?type=lt_top30&limit=7')
      .then(r => r.json())
      .then(d => {
        const entries = (d.tracks || d.entries || d.top || []).slice(0, 7).map((t: any, i: number) => ({
          pos: i + 1,
          track_id: t.track_id || t.id,
          title: t.title || t.tracks?.title || '',
          artist: t.artist || t.artists?.name || t.tracks?.artists?.name || '',
          cover_url: t.cover_url || t.tracks?.cover_url || null,
          trend: i === 0 ? 'same' : i % 3 === 1 ? 'up' : i % 3 === 2 ? 'down' : 'same',
          wks: Math.floor(Math.random() * 8) + 1,
        }))
        setLtTop(entries)
      }).catch(() => {})

    // New tracks
    fetch('/api/search?type=tracks&sort=newest&limit=16')
      .then(r => r.json())
      .then(d => setTracks(d.tracks || d.results || []))
      .catch(() => {})

    // New albums
    fetch('/api/search?type=albums&sort=newest&limit=10')
      .then(r => r.json())
      .then(d => setAlbums(d.albums || d.results || []))
      .catch(() => {})

    // Artists
    fetch('/api/search?type=artists&sort=newest&limit=12')
      .then(r => r.json())
      .then(d => setArtists(d.artists || d.results || []))
      .catch(() => {})

    // Events
    fetch('/api/events?upcoming=true&limit=6')
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => {})

    // News
    fetch('/api/news?limit=5')
      .then(r => r.json())
      .then(d => setNews(d.news || d.articles || []))
      .catch(() => {})
  }, [])

  // Hero items from news + albums
  useEffect(() => {
    const items: any[] = []
    news.slice(0, 2).forEach(n => {
      items.push({
        type: 'news', chip: n.type || 'Naujiena', chipBg: '#2563eb',
        kicker: timeAgo(n.published_at),
        title: n.artists?.name || 'music.lt',
        subtitle: n.title,
        cover: n.image_small_url,
        href: `/naujienos/${n.slug}`,
        bg: 'linear-gradient(135deg, #071422 0%, #0c1a2e 55%, #071422 100%)',
        glow: 'radial-gradient(ellipse at 25% 55%, rgba(37,99,235,0.3) 0%, transparent 55%)',
      })
    })
    albums.slice(0, 2).forEach(a => {
      const h = hue(a.title)
      items.push({
        type: 'album', chip: 'Albumas', chipBg: '#7c3aed',
        kicker: a.year ? `${a.year} m.` : '',
        title: a.artists?.name || '',
        subtitle: a.title,
        cover: a.cover_image_url,
        href: `/muzika/${a.slug}`,
        bg: `linear-gradient(135deg, hsl(${h},40%,6%) 0%, hsl(${h},50%,10%) 55%, hsl(${h},40%,6%) 100%)`,
        glow: `radial-gradient(ellipse at 25% 55%, hsla(${h},60%,40%,0.28) 0%, transparent 55%)`,
      })
    })
    events.slice(0, 1).forEach(e => {
      const d = new Date(e.event_date)
      items.push({
        type: 'event', chip: 'Renginys', chipBg: '#059669',
        kicker: `${d.getDate()} ${MONTHS_LT[d.getMonth()]}. • ${e.venues?.city || ''}`,
        title: e.title,
        subtitle: e.venues?.name || e.venue_custom || '',
        cover: e.image_small_url,
        href: `/renginiai/${e.slug}`,
        bg: 'linear-gradient(135deg, #0a1422 0%, #0d1f10 55%, #0a1422 100%)',
        glow: 'radial-gradient(ellipse at 25% 55%, rgba(5,150,105,0.28) 0%, transparent 55%)',
      })
    })
    if (items.length === 0) {
      // Fallback
      items.push({ type: 'promo', chip: 'Lietuviška muzika', chipBg: '#f97316', kicker: 'Platforma', title: 'music.lt', subtitle: 'Visi Lietuvos atlikėjai vienoje vietoje', cover: null, href: '/atlikejai', bg: 'linear-gradient(135deg, #0c1524 0%, #19103a 55%, #0c1524 100%)', glow: 'radial-gradient(ellipse at 25% 55%, rgba(99,102,241,0.4) 0%, transparent 55%)' })
    }
    setHeroItems(items)
    setHeroIdx(0)
  }, [news, albums, events])

  // Hero auto-advance
  useEffect(() => {
    if (!heroItems.length) return
    timerRef.current = setTimeout(() => setHeroIdx(p => (p + 1) % heroItems.length), 7000)
    return () => clearTimeout(timerRef.current)
  }, [heroIdx, heroItems.length])

  const hero = heroItems[heroIdx] || heroItems[0]
  const chartData = chartTab === 'lt' ? ltTop : WORLD_TOP
  const filteredTracks = tracks.filter(t => genreFilter === 'Visi' || !genreFilter)
  const filteredEvents = cityFilter === 'Visi' ? events : events.filter(e => e.venues?.city === cityFilter)
  const cities = ['Visi', ...Array.from(new Set(events.map(e => e.venues?.city).filter(Boolean) as string[]))]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,700;0,900;1,400&display=swap');
        .hp-wrap { font-family: 'DM Sans', sans-serif; }
        @keyframes hp-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes hp-fade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        .hp-card:hover { border-color: rgba(255,255,255,0.14) !important; }
        .hp-track:hover { background: rgba(255,255,255,0.05) !important; }
        .hp-artist:hover .hp-artist-img { transform: scale(1.06); }
        .hp-scroll { overflow-x: auto; scrollbar-width: none; }
        .hp-scroll::-webkit-scrollbar { display: none; }
        .hp-pill { cursor: pointer; padding: 5px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; border: 1px solid rgba(255,255,255,0.07); color: #5a7898; background: transparent; transition: all 0.15s; white-space: nowrap; }
        .hp-pill.active { background: rgba(29,78,216,0.2); border-color: rgba(29,78,216,0.35); color: #93c5fd; }
        .hp-pill:hover { color: #c8d8f0; border-color: rgba(255,255,255,0.14); }
      `}</style>

      <div className="hp-wrap">

        {/* ── HERO ── */}
        {hero && (
          <section style={{ position: 'relative', overflow: 'hidden', background: hero.bg, transition: 'background 1s ease', minHeight: 320 }}>
            <div style={{ position: 'absolute', inset: 0, background: hero.glow, transition: 'all 0.8s', pointerEvents: 'none' }} />
            {/* subtle grid */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />

            <div style={{ position: 'relative', maxWidth: 1360, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'stretch' }}>

              {/* Hero content */}
              <div style={{ flex: 1, padding: '44px 40px 44px 0', display: 'flex', alignItems: 'center', gap: 36, borderRight: '1px solid rgba(255,255,255,0.07)' }}>
                {/* Cover */}
                <div style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }}>
                  <div style={{ width: 180, height: 180, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7)', transition: 'transform 0.3s' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                    <Cover src={hero.cover} alt={hero.title} size={180} radius={20} />
                  </div>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0)', transition: 'background 0.2s', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.35)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0)')}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(249,115,22,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>
                      <span style={{ color: '#fff', fontSize: 20, marginLeft: 3 }}>▶</span>
                    </div>
                  </div>
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0, animation: 'hp-fade 0.5s ease' }} key={heroIdx}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 900, color: '#fff', background: hero.chipBg }}>{hero.chip}</span>
                    <span style={{ fontSize: 12, color: 'rgba(200,215,240,0.45)', fontWeight: 500 }}>{hero.kicker}</span>
                  </div>
                  <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 46, fontWeight: 900, color: '#f2f4f8', lineHeight: 1.05, margin: '0 0 6px', letterSpacing: '-0.02em' }}>{hero.title}</h1>
                  <p style={{ fontSize: 20, fontWeight: 400, color: 'rgba(200,215,240,0.45)', margin: '0 0 20px', lineHeight: 1.3 }}>{hero.subtitle}</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link href={hero.href || '#'} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f97316', color: '#fff', fontWeight: 900, fontSize: 13, padding: '10px 22px', borderRadius: 24, textDecoration: 'none', boxShadow: '0 4px 20px rgba(249,115,22,0.4)' }}>
                      <span style={{ fontSize: 12 }}>▶</span> Atidaryti
                    </Link>
                    <Link href={hero.href || '#'} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(200,215,240,0.55)', fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 24, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.12)' }}>
                      Daugiau info
                    </Link>
                  </div>
                </div>

                {/* Nav arrows */}
                {heroItems.length > 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setHeroIdx(p => ((p - 1) + heroItems.length) % heroItems.length)}
                      style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(200,215,240,0.35)', cursor: 'pointer', fontSize: 14 }}>←</button>
                    <button onClick={() => setHeroIdx(p => (p + 1) % heroItems.length)}
                      style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(200,215,240,0.35)', cursor: 'pointer', fontSize: 14 }}>→</button>
                  </div>
                )}
              </div>

              {/* Chart sidebar */}
              <div style={{ width: 360, flexShrink: 0, padding: '32px 0 32px 28px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', borderRadius: 20, padding: 3, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', gap: 2 }}>
                    {[{ k: 'lt', l: '🇱🇹 LT Top 30' }, { k: 'world', l: '🌍 Top 40' }].map(tab => (
                      <button key={tab.k} onClick={() => setChartTab(tab.k as any)}
                        style={{ padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: chartTab === tab.k ? '#1d4ed8' : 'transparent', color: chartTab === tab.k ? '#fff' : '#3a5070' }}>
                        {tab.l}
                      </button>
                    ))}
                  </div>
                  <Link href="/topas" style={{ fontSize: 11, color: '#4a6fa5', fontWeight: 700, textDecoration: 'none' }}>Visi →</Link>
                </div>

                <div style={{ flex: 1 }}>
                  {chartData.length === 0
                    ? Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ width: 5, height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginBottom: 4, width: '70%' }} />
                          <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.03)', width: '50%' }} />
                        </div>
                      </div>
                    ))
                    : chartData.map((t, i) => (
                    <div key={t.pos} className="hp-track" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.1s', borderBottom: i < chartData.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                      <span style={{ width: 18, textAlign: 'center', fontSize: 13, fontWeight: 900, color: t.pos <= 3 ? '#f97316' : '#1e2e42', flexShrink: 0 }}>{t.pos}</span>
                      <div style={{ width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><TrendIcon t={t.trend} /></div>
                      <Cover src={t.cover_url} alt={t.title} size={30} radius={7} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#eef2fa', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                        <p style={{ fontSize: 10, color: '#5a7898', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artist}</p>
                      </div>
                      {t.wks && <span style={{ fontSize: 9, color: '#1e2e42', flexShrink: 0 }}>{t.wks}w</span>}
                    </div>
                  ))}
                </div>

                <Link href="/topas" style={{ marginTop: 12, display: 'block', textAlign: 'center', padding: '8px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', color: '#4a6fa5', fontSize: 12, fontWeight: 700, textDecoration: 'none', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  Žiūrėti visą topą →
                </Link>
              </div>
            </div>

            {/* Dots */}
            {heroItems.length > 1 && (
              <div style={{ position: 'absolute', bottom: 12, left: '35%', display: 'flex', gap: 6, alignItems: 'center' }}>
                {heroItems.map((_, i) => (
                  <button key={i} onClick={() => setHeroIdx(i)}
                    style={{ borderRadius: 4, border: 'none', cursor: 'pointer', background: i === heroIdx ? '#f97316' : 'rgba(255,255,255,0.2)', width: i === heroIdx ? 20 : 6, height: 6, transition: 'all 0.25s', padding: 0 }} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── MAIN CONTENT ── */}
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '48px 20px', display: 'flex', flexDirection: 'column', gap: 56 }}>

          {/* ── NAUJOS DAINOS + ALBUMAI ── */}
          <section>
            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
              {/* Genre filter */}
              <div style={{ width: 120, flexShrink: 0 }}>
                <p style={{ fontSize: 9, fontWeight: 900, color: '#2a3a50', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Stilius</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {['Visi', 'Pop', 'Rokas', 'Hip-hop', 'Elektronika', 'Folk', 'Jazz'].map(g => (
                    <button key={g} onClick={() => setGenreFilter(g)}
                      style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, textAlign: 'left', border: genreFilter === g ? '1px solid rgba(29,78,216,0.3)' : '1px solid transparent', background: genreFilter === g ? 'rgba(29,78,216,0.15)' : 'transparent', color: genreFilter === g ? '#93c5fd' : '#3a5878', cursor: 'pointer', transition: 'all 0.15s' }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
                {/* Tracks */}
                <div>
                  <SectionHead label="Naujos dainos" href="/muzika" />
                  <div className="hp-scroll" style={{ display: 'flex', gap: 10 }}>
                    {filteredTracks.length === 0
                      ? tracks.concat(Array(8).fill(null)).slice(0, 8).map((t, i) => (
                        <div key={i} style={{ width: 200, flexShrink: 0, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginBottom: 5, width: '80%' }} />
                            <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.03)', width: '60%' }} />
                          </div>
                        </div>
                      ))
                      : filteredTracks.slice(0, 14).map(t => (
                      <Link key={t.id} href={`/muzika/${t.slug}`} className="hp-card" style={{ width: 200, flexShrink: 0, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', transition: 'border-color 0.15s' }}>
                        <Cover src={t.cover_url} alt={t.title} size={42} radius={10} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#eef2fa', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                          <p style={{ fontSize: 11, color: '#5a7898', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artists?.name}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Albums */}
                <div>
                  <SectionHead label="Nauji albumai" href="/muzika?tab=albums" />
                  <div className="hp-scroll" style={{ display: 'flex', gap: 12 }}>
                    {albums.slice(0, 10).map(a => (
                      <Link key={a.id} href={`/muzika/${a.slug}`} className="hp-card" style={{ width: 230, flexShrink: 0, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', transition: 'border-color 0.15s' }}>
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

          {/* ── DIENOS DAINA + SHOUTBOX ── */}
          <section>
            <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 20, alignItems: 'start' }}>
              <div>
                <SectionHead label="🎵 Dienos daina" href="/dienos-daina" cta="Visi →" />
                <DienosDainaWidget />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <SectionHead label="💬 Gyvi pokalbiai" href="/bendruomene" cta="Bendruomenė →" />
                  <ShoutboxWidget />
                </div>
              </div>
            </div>
          </section>

          {/* ── BENDRUOMENĖ DISKUSIJOS ── */}
          <section>
            <SectionHead label="Bendruomenė" href="/diskusijos" cta="Visos diskusijos →" />
            <DiscussionsWidget />
          </section>

          {/* ── RENGINIAI + NAUJIENOS ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>

            <section>
              <SectionHead label="Renginiai" href="/renginiai" />
              {/* City filter */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                {cities.slice(0, 6).map(c => (
                  <button key={c} className={`hp-pill${cityFilter === c ? ' active' : ''}`} onClick={() => setCityFilter(c)}>{c}</button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredEvents.length === 0
                  ? <div style={{ padding: '24px', textAlign: 'center', color: '#3d5878', fontSize: 13 }}>Renginių nerasta</div>
                  : filteredEvents.slice(0, 5).map(e => {
                  const d = new Date(e.event_date)
                  return (
                    <Link key={e.id} href={`/renginiai/${e.slug}`} className="hp-card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none', transition: 'border-color 0.15s' }}>
                      <div style={{ textAlign: 'center', width: 36, flexShrink: 0 }}>
                        <p style={{ fontSize: 22, fontWeight: 900, color: '#f2f4f8', margin: 0, lineHeight: 1 }}>{d.getDate()}</p>
                        <p style={{ fontSize: 9, fontWeight: 900, color: '#f97316', margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{MONTHS_LT[d.getMonth()]}</p>
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
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginBottom: 5, width: '90%' }} />
                        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.03)', width: '50%' }} />
                      </div>
                    </div>
                  ))
                  : news.slice(0, 5).map(n => {
                  const h = hue(n.title)
                  return (
                    <Link key={n.id} href={`/naujienos/${n.slug}`} className="hp-card" style={{ display: 'flex', gap: 14, padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none', transition: 'border-color 0.15s' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                        <Cover src={n.image_small_url} alt={n.title} size={36} radius={8} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          {n.type && <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, background: `hsl(${h},40%,12%)`, color: `hsl(${h},60%,60%)`, border: `1px solid hsl(${h},40%,18%)` }}>{n.type}</span>}
                          <span style={{ fontSize: 9, color: '#2a3a50' }}>{timeAgo(n.published_at)}</span>
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#c8d8f0', margin: 0, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>{n.title}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          </div>

          {/* ── ATRASK ATLIKĖJUS ── */}
          <section>
            <SectionHead label="Atrask atlikėjus" href="/atlikejai" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 20 }}>
              {artists.slice(0, 12).map(a => (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} className="hp-artist" style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                  <div className="hp-artist-img" style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 10px', overflow: 'hidden', transition: 'transform 0.3s', boxShadow: `0 8px 20px hsla(${hue(a.name)},40%,6%,0.8)` }}>
                    <Cover src={a.cover_image_url} alt={a.name} size={80} radius={40} />
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#c8d8f0', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* ── ATLIKĖJAMS CTA ── */}
          <section>
            <div style={{ padding: '40px 48px', borderRadius: 24, background: 'linear-gradient(135deg, rgba(29,78,216,0.1) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(29,78,216,0.18)', display: 'flex', alignItems: 'center', gap: 28, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 0% 50%, rgba(29,78,216,0.07) 0%, transparent 55%)', pointerEvents: 'none' }} />
              <div style={{ width: 64, height: 64, borderRadius: 18, flexShrink: 0, background: 'rgba(29,78,216,0.18)', border: '1px solid rgba(29,78,216,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🎤</div>
              <div style={{ flex: 1 }}>
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
