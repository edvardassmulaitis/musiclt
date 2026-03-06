'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSite } from '@/components/SiteContext'

/* ────────────────────────────── Types ────────────────────────────── */
type Track = { id: number; slug: string; title: string; cover_url: string | null; created_at: string; artists: { id: number; slug: string; name: string; cover_image_url?: string | null } | null }
type Album = { id: number; slug: string; title: string; year: number | null; cover_image_url: string | null; created_at: string; artists: { id: number; slug: string; name: string; cover_image_url?: string | null } | null }
type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }
type Event = { id: number; slug: string; title: string; event_date: string; venue_custom: string | null; image_small_url: string | null; venues: { name: string; city: string } | null }
type NewsItem = { id: number; slug: string; title: string; image_small_url: string | null; image_title_url?: string | null; published_at: string; type: string | null; excerpt?: string | null; songs?: { youtube_url?: string | null; title?: string | null; artist_name?: string | null; cover_url?: string | null }[]; artist: { name: string; slug: string; cover_image_url?: string | null } | null }
type TopEntry = { pos: number; track_id: number; title: string; artist: string; cover_url: string | null; artist_image: string | null; trend: string; wks?: number; slug?: string; artist_slug?: string }
type Nomination = { id: number; votes: number; weighted_votes: number; tracks: { id: number; title: string; cover_url: string | null; artists: { name: string } | null } | null }
type Discussion = { id: number; slug: string; title: string; author_name: string | null; comment_count: number; created_at: string; tags: string[] }
type ShoutMsg = { id: number; author_name: string; author_avatar: string | null; body: string; created_at: string; user_id: string }
type HeroSlide = {
  type: string; chip: string; chipBg: string; title: string; subtitle: string
  href: string; bgImg?: string | null; videoId?: string | null
  songTitle?: string | null; songArtist?: string | null; songCover?: string | null
  artist?: { name: string; slug: string; image?: string | null } | null
}

/* ────────────────────────────── Helpers ────────────────────────────── */
const MONTHS_LT = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rgp', 'Rgs', 'Spa', 'Lap', 'Gru']
const MONTHS_FULL_LT = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio']

function sanitizeTitle(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function smartTruncate(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text
  const cut = text.slice(0, maxLen)
  const lastEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('.„'), cut.lastIndexOf('."'))
  if (lastEnd > maxLen * 0.4) return cut.slice(0, lastEnd + 1)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > 0 ? cut.slice(0, lastSpace) + '…' : cut + '…'
}

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]{11})/)
  return m?.[1] || null
}

function formatDateLT(d: string) {
  const date = new Date(d)
  return `${date.getFullYear()} m. ${MONTHS_FULL_LT[date.getMonth()]} ${date.getDate()} d.`
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

function Cover({ src, alt, size = 44, radius = 10, ytId }: { src?: string | null; alt: string; size?: number; radius?: number; ytId?: string | null }) {
  const h = strHue(alt)
  const imgSrc = src || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null)
  if (imgSrc) return <img src={imgSrc} alt={alt} loading="lazy" style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0, display: 'block' }} />
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
      <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0 }}>{label}</h2>
      {href && <Link href={href} style={{ fontSize: 12, color: 'var(--accent-link)', fontWeight: 700, textDecoration: 'none', transition: 'color .15s' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{cta}</Link>}
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
  if (loading) return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}><Skel w={54} h={54} r={10} /><div style={{ flex: 1 }}><Skel w="40%" h={9} /><div style={{ marginTop: 5 }}><Skel w="70%" h={12} /></div><div style={{ marginTop: 4 }}><Skel w="45%" h={9} /></div></div></div>
      {Array(3).fill(null).map((_, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 0', alignItems: 'center' }}><Skel w={14} h={10} /><Skel w={26} h={26} r={6} /><div style={{ flex: 1 }}><Skel w="65%" h={10} /></div></div>)}
    </div>
  )
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Cover src={w?.tracks?.cover_url} alt={w?.tracks?.title || 'daina'} size={54} radius={10} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Šiandien pirmauja</p>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 1px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sanitizeTitle(w?.tracks?.title || 'Dar nėra')}
          </h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{w?.tracks?.artists?.name || ''}</p>
        </div>
        <Link href="/dienos-daina" style={{ flexShrink: 0, background: '#f97316', color: '#fff', fontWeight: 800, fontSize: 11, padding: '7px 14px', borderRadius: 20, textDecoration: 'none', boxShadow: '0 3px 14px rgba(249,115,22,0.35)', transition: 'transform .15s' }} onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')} onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
          Balsuoti
        </Link>
      </div>
      <div>
        <div style={{ padding: '8px 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Rytdienos kandidatai</span>
          <Link href="/dienos-daina" style={{ fontSize: 9, color: 'var(--accent-link)', fontWeight: 700, textDecoration: 'none' }}>+ Siūlyti</Link>
        </div>
        {noms.length === 0 ? <div style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>Kol kas nėra nominacijų</div>
        : noms.slice(0, 5).map((n, i) => (
          <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderTop: '1px solid var(--border-subtle)', transition: 'background .12s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-faint)', width: 14, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
            <Cover src={n.tracks?.cover_url} alt={n.tracks?.title || '?'} size={26} radius={6} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sanitizeTitle(n.tracks?.title || '')}</p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>{n.tracks?.artists?.name}</p>
            </div>
            <button onClick={() => voted === null && setVoted(i)} disabled={voted !== null}
              style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10, flexShrink: 0, cursor: voted !== null ? 'default' : 'pointer', border: voted === i ? '1px solid rgba(52,211,153,0.3)' : '1px solid var(--border-default)', background: voted === i ? 'rgba(52,211,153,0.1)' : 'transparent', color: voted === i ? '#34d399' : voted !== null ? 'var(--text-faint)' : 'var(--accent-link)', transition: 'all 0.15s' }}>
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
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Gyvi pokalbiai</span>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
        </div>
        <Link href="/bendruomene" style={{ fontSize: 10, color: 'var(--accent-link)', fontWeight: 700, textDecoration: 'none' }}>Visi →</Link>
      </div>
      <div style={{ flex: 1 }}>
        {loading ? Array(4).fill(null).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 9, padding: '9px 14px', borderBottom: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
            <Skel w={24} h={24} r={12} /><div style={{ flex: 1 }}><Skel w="40%" h={9} /><div style={{ marginTop: 4 }}><Skel w="75%" h={10} /></div></div>
          </div>
        ))
        : msgs.length === 0 ? <div style={{ padding: '18px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>Dar nėra žinučių</div>
        : msgs.slice(-6).map((m, i, arr) => (
          <div key={m.id} style={{ display: 'flex', gap: 9, padding: '8px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: `hsl(${strHue(m.author_name)},28%,14%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: `hsl(${strHue(m.author_name)},45%,52%)`, fontFamily: 'Outfit, sans-serif' }}>{m.author_name[0]?.toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-link)' }}>{m.author_name}</span>
                <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{timeAgo(m.created_at)}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>{m.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '9px 12px', borderTop: '1px solid var(--border-subtle)' }}>
        <Link href="/bendruomene" style={{ display: 'block', textAlign: 'center', padding: '7px', borderRadius: 10, background: 'var(--bg-hover)', border: '1px solid var(--border-default)', color: 'var(--accent-link)', fontSize: 11, fontWeight: 700, textDecoration: 'none', transition: 'background .15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}>
          Prisijungti prie pokalbio →
        </Link>
      </div>
    </div>
  )
}

/* ────────────────────────────── Discussions ────────────────────────────── */

function DiscussionsWidget() {
  const [discs, setDiscs] = useState<Discussion[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch('/api/diskusijos?sort=activity&limit=4').then(r => r.json()).then(d => { setDiscs(d.discussions || []); setLoading(false) }).catch(() => setLoading(false)) }, [])
  if (loading || !discs.length) return (
    <div className="hp-disc-grid">
      {Array(4).fill(null).map((_, i) => (
        <div key={i} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div style={{ marginBottom: 8 }}><Skel w="30%" h={8} /></div>
          <Skel w="90%" h={11} /><div style={{ marginTop: 4 }}><Skel w="60%" h={11} /></div>
          <div style={{ marginTop: 8 }}><Skel w="45%" h={8} /></div>
        </div>
      ))}
    </div>
  )
  return (
    <div className="hp-disc-grid">
      {discs.map(d => (
        <Link key={d.id} href={`/diskusijos/${d.slug}`}
          style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', textDecoration: 'none', display: 'block', transition: 'border-color 0.15s, background .15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', gap: 5, marginBottom: 5, alignItems: 'center' }}>
            {(d.tags || []).slice(0, 1).map(t => <span key={t} style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-active)', color: 'var(--accent-link)' }}>{t}</span>)}
            <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 'auto' }}>{timeAgo(d.created_at)}</span>
          </div>
          <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 5px', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{d.title}</p>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>{d.author_name} · {d.comment_count} atsak.</p>
        </Link>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
                         REELS OVERLAY COMPONENT
   ════════════════════════════════════════════════════════════════════ */

const REELS_DURATION = 8000

function ReelsOverlay({ slides, initialIdx, seenSlides, onSeen, onClose, dk }: {
  slides: HeroSlide[]
  initialIdx: number
  seenSlides: Set<string>
  onSeen: (href: string) => void
  onClose: () => void
  dk: boolean
}) {
  const [idx, setIdx] = useState(initialIdx)
  const [videoOpen, setVideoOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)

  const progressRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const rafRef = useRef<any>(null)
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const trackRef = useRef<HTMLDivElement>(null)

  const slide = slides[idx]

  /* ── Progress animation ── */
  const startProgress = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    startRef.current = Date.now()
    setProgress(0)
    const tick = () => {
      const p = Math.min((Date.now() - startRef.current) / REELS_DURATION, 1)
      setProgress(p)
      progressRef.current = p
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const stopProgress = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
  }, [])

  /* ── Navigation ── */
  const goTo = useCallback((newIdx: number) => {
    if (newIdx < 0 || newIdx >= slides.length) { onClose(); return }
    setVideoOpen(false)
    setIdx(newIdx)
  }, [slides.length, onClose])

  /* Mark seen + start progress on slide change */
  useEffect(() => {
    if (!slide) return
    onSeen(slide.href)
    if (!videoOpen) startProgress()
    return () => stopProgress()
  }, [idx]) // eslint-disable-line

  /* Pause/resume when video opens */
  useEffect(() => {
    if (videoOpen) stopProgress()
    else startProgress()
  }, [videoOpen]) // eslint-disable-line

  /* Auto-advance */
  useEffect(() => {
    if (progress >= 1 && !videoOpen) goTo(idx + 1)
  }, [progress]) // eslint-disable-line

  /* ── Touch swipe (horizontal) ── */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    setDragging(true)
    stopProgress()
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    // Only horizontal drag if clearly not a vertical scroll
    if (Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault()
      setDragOffset(dx)
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    setDragging(false)
    setDragOffset(0)

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      // Horizontal swipe → navigate slides
      if (dx < 0) goTo(idx + 1)
      else goTo(idx - 1)
    } else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
      // Swipe DOWN → close feed
      onClose()
    } else {
      // No significant swipe — resume progress
      startProgress()
    }
  }

  /* ── Mouse drag (desktop) ── */
  const onMouseDown = (e: React.MouseEvent) => {
    touchStartX.current = e.clientX
    touchStartY.current = e.clientY
    setDragging(true)
    stopProgress()
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setDragOffset(e.clientX - touchStartX.current)
  }

  const onMouseUp = (e: React.MouseEvent) => {
    const dx = e.clientX - touchStartX.current
    setDragging(false)
    setDragOffset(0)
    if (Math.abs(dx) > 50) {
      if (dx < 0) goTo(idx + 1)
      else goTo(idx - 1)
    } else {
      startProgress()
    }
  }

  /* ── Tap left/right halves to navigate (Instagram style) ── */
  const onTap = (e: React.MouseEvent) => {
    if (Math.abs(dragOffset) > 10) return // was a drag, not a tap
    if (videoOpen) return
    const x = e.clientX
    const mid = window.innerWidth / 2
    if (x < mid) goTo(idx - 1)
    else goTo(idx + 1)
  }

  const translateX = -idx * 100 + (dragOffset / window.innerWidth) * 100

  return (
    <div className="hp-reels" style={{ userSelect: 'none' }}>
      {/* Progress bars */}
      <div style={{
        position: 'fixed', top: 14, left: 16, right: 56, zIndex: 310,
        display: 'flex', gap: 4, alignItems: 'center', pointerEvents: 'none',
      }}>
        {slides.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, background: '#fff',
              width: i < idx ? '100%' : i === idx ? `${progress * 100}%` : '0%',
              transition: i === idx ? 'none' : 'none',
            }} />
          </div>
        ))}
      </div>

      {/* Close button */}
      <button onClick={onClose} style={{
        position: 'fixed', top: 10, right: 16, zIndex: 310,
        width: 36, height: 36, borderRadius: '50%',
        background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
        color: '#fff', fontSize: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(8px)',
      }}>✕</button>

      {/* Horizontal slide track */}
      <div
        ref={trackRef}
        className="hp-reels-track"
        style={{
          transform: `translateX(${translateX}%)`,
          transition: dragging ? 'none' : 'transform .32s cubic-bezier(.4,0,.2,1)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onTap}
      >
        {slides.map((s, i) => (
          <div key={i} className="hp-reels-slide">
            {/* Image zone */}
            <div className="hp-reels-img">
              {s.bgImg
                ? <img src={s.bgImg} alt="" draggable={false} />
                : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0a1428,#162040)' }} />
              }
              {/* Video popup — on top of image */}
              {s.videoId && videoOpen && i === idx && (
                <div className="hp-reels-video-popup" onClick={e => e.stopPropagation()}>
                  {/* Close bar — always visible at top */}
                  <div style={{
                    flexShrink: 0, height: 52, display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', padding: '0 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                        <img src={`https://img.youtube.com/vi/${s.videoId}/mqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.2 }}>{s.songTitle || 'Video'}</p>
                        {s.songArtist && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{s.songArtist}</p>}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setVideoOpen(false) }} style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff', fontSize: 14, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>✕</button>
                  </div>
                  <iframe
                    src={`https://www.youtube.com/embed/${s.videoId}?autoplay=1&rel=0&playsinline=1`}
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="hp-reels-info" onClick={e => e.stopPropagation()}>
              {/* Chip — orange if unseen, muted if seen */}
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 16,
                fontSize: 10, fontWeight: 900, color: '#fff',
                background: seenSlides.has(s.href) ? 'rgba(255,255,255,0.15)' : s.chipBg,
                fontFamily: 'Outfit,sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase',
                marginBottom: 10, alignSelf: 'flex-start',
                transition: 'background .3s',
              }}>{s.chip}</span>

              {/* Title — plain text, no accidental navigation */}
              <p style={{
                fontFamily: 'Outfit,sans-serif', fontSize: 26, fontWeight: 900,
                color: '#fff', lineHeight: 1.1, margin: '0 0 8px',
                letterSpacing: '-0.02em',
              }}>{s.title}</p>

              {s.subtitle && (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 14px', lineHeight: 1.5 }}>
                  {s.subtitle}
                </p>
              )}

              {/* Video trigger */}
              {s.videoId && !videoOpen && i === idx && (
                <button onClick={(e) => { e.stopPropagation(); setVideoOpen(true) }} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 8px 8px',
                  background: 'rgba(255,255,255,0.07)', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', width: '100%',
                }}>
                  <div style={{ width: 42, height: 42, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                    <img src={`https://img.youtube.com/vi/${s.videoId}/mqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
                  </div>
                  <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.songTitle || 'Klausyti'}</p>
                    {s.songArtist && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>{s.songArtist}</p>}
                  </div>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 1 }}><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </button>
              )}

              {/* Bottom action area */}
              <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Read button — primary CTA */}
                <Link
                  href={s.href}
                  onClick={onClose}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '13px 20px', borderRadius: 14,
                    background: seenSlides.has(s.href) ? 'rgba(255,255,255,0.12)' : '#f97316',
                    color: '#fff', fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 800,
                    textDecoration: 'none', letterSpacing: '-0.01em',
                    boxShadow: seenSlides.has(s.href) ? 'none' : '0 4px 20px rgba(249,115,22,0.35)',
                    transition: 'all .2s',
                  }}
                >
                  {seenSlides.has(s.href) ? 'Skaityti dar kartą' : 'Skaityti'}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>

                {/* Slide counter */}
                <div style={{
                  flexShrink: 0, padding: '0 12px', height: 46, borderRadius: 14,
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)',
                  fontFamily: 'Outfit,sans-serif', letterSpacing: '0.02em',
                }}>
                  {idx + 1}/{slides.length}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
                            HOMEPAGE
   ════════════════════════════════════════════════════════════════════ */

export default function Home() {
  const { dk } = useSite()

  /* ── Theme tokens ── */
  const T = {
    bg:         dk ? '#080d14' : '#f0f4fa',
    bgCard:     dk ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)',
    bgCardH:    dk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
    bgPill:     dk ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    bgPillAct:  dk ? 'rgba(29,78,216,0.18)' : 'rgba(29,78,216,0.12)',
    bgHover:    dk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    bgSkel:     dk ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    bgInput:    dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border:     dk ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    borderH:    dk ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.14)',
    borderSub:  dk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
    text:       dk ? '#e0eaf8' : '#0f1a2e',
    textSec:    dk ? '#9cb5d0' : '#3a5a80',
    textMuted:  dk ? '#6889a8' : '#8899aa',
    textFaint:  dk ? '#3a5878' : '#bbc8d8',
    textPill:   dk ? '#6889a8' : '#6a85a0',
    textPillAct:dk ? '#90b8e8' : '#1d4ed8',
    link:       dk ? '#4a7ab5' : '#2563eb',
    title:      dk ? '#f3f6fc' : '#0f1a2e',
    subtitle:   dk ? '#5a7898' : '#6a85a0',
    accent:     '#f97316',
    accentBlue: '#1d4ed8',
    heroBg:     dk ? '#080d14' : '#f0f4fa',
    heroText:   dk ? 'rgba(210,225,245,0.65)' : 'rgba(15,26,46,0.6)',
    heroOverlay:dk
      ? 'linear-gradient(to right, rgba(8,13,20,1) 0%, rgba(8,13,20,0.2) 35%, rgba(8,13,20,0.05) 55%, transparent 70%, rgba(8,13,20,0.15) 82%, rgba(8,13,20,0.7) 94%, rgba(8,13,20,1) 100%), linear-gradient(to top, rgba(8,13,20,0.5) 0%, transparent 30%)'
      : 'linear-gradient(to right, rgba(240,244,250,1) 0%, rgba(240,244,250,0.2) 35%, rgba(240,244,250,0.05) 55%, transparent 70%, rgba(240,244,250,0.15) 82%, rgba(240,244,250,0.7) 94%, rgba(240,244,250,1) 100%), linear-gradient(to top, rgba(240,244,250,0.5) 0%, transparent 30%)',
    heroGrad:   dk ? 'linear-gradient(135deg,#08101e 0%,#0f1830 55%,#08101e 100%)' : '#f0f4fa',
    heroTitleC: dk ? '#fff' : '#0f1a2e',
    chartBg:    dk ? '#080d14' : '#f0f4fa',
    chartBdr:   dk ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    pos123:     dk ? '#f97316' : '#ea6c0a',
    coverBg:    dk ? '#0e1626' : '#e0e8f2',
    coverText:  dk ? '#1a3050' : '#8899aa',
    chipBg:     dk ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    chipBdr:    dk ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
    chipText:   dk ? '#e8edf6' : '#1a2a40',
    vidOverlay: dk ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.7)',
    ctaBg:      dk ? 'rgba(29,78,216,0.08)' : 'rgba(29,78,216,0.06)',
    ctaBdr:     dk ? 'rgba(96,165,250,0.15)' : 'rgba(29,78,216,0.15)',
    ctaText:    dk ? '#c8d8f4' : '#1a2a40',
    shoutBg:    dk ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.03)',
  }

  const [chartTab, setChartTab] = useState<'lt' | 'world'>('lt')

  /* ── Reels state ── */
  const [reelsOpen, setReelsOpen] = useState(false)
  const [reelsIdx, setReelsIdx] = useState(0)

  /* ── Hero state ── */
  const [ltTop, setLtTop] = useState<TopEntry[]>([])
  const [worldTop, setWorldTop] = useState<TopEntry[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const filtEvt = events
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([])
  const [heroIdx, setHeroIdx] = useState(0)
  const [heroImgLoaded, setHeroImgLoaded] = useState(false)
  const [heroVideoPlaying, setHeroVideoPlaying] = useState(false)
  const [newsSongs, setNewsSongs] = useState<Record<number, { youtube_url: string; title: string | null; artist_name: string | null }[]>>({})
  const timerRef = useRef<any>(null)
  const heroRef = useRef<HTMLElement>(null)

  const parseTop = (entries: any[]): TopEntry[] => entries.slice(0, 7).map(e => {
    const prev = e.prev_position; const cur = e.position
    const trend = e.is_new ? 'new' : !prev ? 'same' : cur < prev ? 'up' : cur > prev ? 'down' : 'same'
    return { pos: e.position, track_id: e.track_id, title: sanitizeTitle(e.tracks?.title || ''), artist: e.tracks?.artists?.name || '', cover_url: e.tracks?.cover_url || null, artist_image: e.tracks?.artists?.cover_image_url || null, trend, wks: e.weeks_in_top, slug: e.tracks?.slug, artist_slug: e.tracks?.artists?.slug }
  })

  useEffect(() => {
    fetch('/api/top/entries?type=lt_top30').then(r => r.json()).then(d => setLtTop(parseTop(d.entries || []))).catch(() => {})
    fetch('/api/top/entries?type=top40').then(r => r.json()).then(d => setWorldTop(parseTop(d.entries || []))).catch(() => {})
    fetch('/api/tracks?limit=24').then(r => r.json()).then(d => setTracks(d.tracks || [])).catch(() => {})
    fetch('/api/albums?limit=16').then(r => r.json()).then(d => setAlbums(d.albums || [])).catch(() => {})
    fetch('/api/artists?limit=12').then(r => r.json()).then(d => setArtists(d.artists || [])).catch(() => {})
    fetch('/api/events?limit=10').then(r => r.json()).then(d => setEvents(d.events || [])).catch(() => {})
    fetch('/api/news?limit=30').then(r => r.json()).then(d => setNews(d.news || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!news.length) return
    const heroNews = news.slice(0, 30)
    Promise.all(
      heroNews.map(n =>
        fetch(`/api/news/${n.id}/songs`)
          .then(r => r.json())
          .then(songs => ({ id: n.id, songs: Array.isArray(songs) ? songs : [] }))
          .catch(() => ({ id: n.id, songs: [] }))
      )
    ).then(results => {
      const map: Record<number, any[]> = {}
      results.forEach(r => { map[r.id] = r.songs })
      setNewsSongs(map)
    })
  }, [news])

  /* ── Hero slides ── */
  useEffect(() => {
    const slides: HeroSlide[] = []
    news.slice(0, 30).forEach(n => {
      const typeLT = n.type === 'review' ? 'Recenzija' : n.type === 'interview' ? 'Interviu' : n.type === 'report' ? 'Reportažas' : 'Naujiena'
      const songs = newsSongs[n.id] || []
      const song = songs.find((s: any) => s.youtube_url)
      slides.push({
        type: 'news', chip: typeLT.toUpperCase(), chipBg: '#1d4ed8',
        title: sanitizeTitle(n.title),
        subtitle: n.excerpt ? smartTruncate(n.excerpt, 180) : '',
        bgImg: n.image_title_url || n.image_small_url,
        href: `/news/${n.slug}`,
        videoId: extractYouTubeId(song?.youtube_url || null),
        songTitle: song?.title || null,
        songArtist: song?.artist_name || n.artist?.name || null,
        songCover: null,
        artist: n.artist ? { name: n.artist.name, slug: n.artist.slug, image: n.artist.cover_image_url || null } : null,
      })
    })
    events.slice(0, 3).forEach(ev => {
      const d = ev.event_date ? new Date(ev.event_date) : null
      const dateStr = d && !isNaN(d.getTime()) ? `${d.getDate()} ${MONTHS_LT[d.getMonth()]}. · ` : ''
      const venue = ev.venues?.name || ev.venue_custom || ''
      const city = ev.venues?.city || ''
      slides.push({
        type: 'event', chip: 'RENGINYS', chipBg: '#047857',
        title: sanitizeTitle(ev.title),
        subtitle: `${dateStr}${venue}${city ? ` · ${city}` : ''}`.replace(/· $/, ''),
        bgImg: ev.image_small_url,
        href: `/renginiai/${ev.slug}`,
      })
    })
    if (!slides.length) slides.push({
      type: 'promo', chip: '🇱🇹 LIETUVIŠKA MUZIKA', chipBg: '#f97316',
      title: 'music.lt',
      subtitle: 'Visi Lietuvos atlikėjai vienoje vietoje',
      href: '/atlikejai',
    })
    setHeroSlides(slides)
    setHeroIdx(0)
  }, [news, events, newsSongs])

  useEffect(() => {
    if (!heroSlides.length || heroVideoPlaying) return
    timerRef.current = setTimeout(() => {
      setHeroImgLoaded(false)
      setHeroVideoPlaying(false)
      setHeroIdx(p => (p + 1) % heroSlides.length)
    }, 8000)
    return () => clearTimeout(timerRef.current)
  }, [heroIdx, heroSlides.length, heroVideoPlaying])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!heroSlides.length) return
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setHeroImgLoaded(false); setHeroVideoPlaying(false)
        setHeroIdx(p => (p - 1 + heroSlides.length) % heroSlides.length)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setHeroImgLoaded(false); setHeroVideoPlaying(false)
        setHeroIdx(p => (p + 1) % heroSlides.length)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [heroSlides.length])

  useEffect(() => {
    if (!heroSlides.length) return
    const next = heroSlides[(heroIdx + 1) % heroSlides.length]
    if (next?.bgImg) { const img = new Image(); img.src = next.bgImg }
  }, [heroIdx, heroSlides])

  /* ── "seen" tracking ── */
  const [seenSlides, setSeenSlides] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('reels_seen') || '[]') as string[]) }
    catch { return new Set() }
  })

  const hero = heroSlides[heroIdx]
  const chartData = chartTab === 'lt' ? ltTop : worldTop

  return (
    <>
      <style>{`
        .hp{font-family:'DM Sans',sans-serif;background:var(--bg-body);min-height:100vh}
        @keyframes hp-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes hp-img-in{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:scale(1)}}
        @keyframes hp-pulse{0%,100%{opacity:.05}50%{opacity:.08}}
        .hp-skel{background:${T.bgSkel};animation:hp-pulse 1.8s ease-in-out infinite}
        .hp-scroll{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
        .hp-scroll::-webkit-scrollbar{display:none}
        .hp-pill{cursor:pointer;padding:5px 13px;border-radius:18px;font-size:11px;font-weight:700;border:1px solid ${T.border};color:${T.textPill};background:transparent;transition:all .15s;white-space:nowrap;font-family:'DM Sans',sans-serif}
        .hp-pill.hp-act{background:${T.bgPillAct};border-color:${dk ? 'rgba(29,78,216,.32)' : 'rgba(29,78,216,.2)'};color:${T.textPillAct}}
        .hp-pill:hover{color:${dk ? '#b8d0e8' : '#1a2a40'};border-color:${T.borderH}}
        .hp-tr{transition:background .1s}
        .hp-tr:hover{background:${T.bgHover}!important}
        .hp-card{background:${T.bgCard};border:1px solid ${T.border};border-radius:11px;text-decoration:none;transition:border-color .15s,background .15s}
        .hp-card:hover{border-color:${T.borderH};background:${T.bgCardH}}
        .hp-art:hover .hp-art-img{transform:scale(1.06)}
        .hp-disc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .hp-feed-strip{display:none}
        .hp-mobile-chart{display:none}
        @media(max-width:960px){.hp-feed-strip{display:flex}.hp-mobile-chart{display:block}}

        /* ── Reels overlay — horizontal Stories ── */
        .hp-reels{position:fixed;inset:0;z-index:300;background:#000;overflow:hidden;touch-action:pan-x}
        .hp-reels-track{height:100%;display:flex;flex-direction:row;will-change:transform;transition:transform .32s cubic-bezier(.4,0,.2,1)}
        .hp-reels-slide{height:100vh;width:100vw;flex-shrink:0;display:flex;flex-direction:column;background:#000;position:relative;overflow:hidden}

        /* Image zone — video pops on top */
        .hp-reels-img{flex:0 0 55%;position:relative;overflow:hidden}
        .hp-reels-img img{width:100%;height:100%;object-fit:cover}
        .hp-reels-img::after{content:'';position:absolute;bottom:0;left:0;right:0;height:40%;background:linear-gradient(to top,#000,transparent)}
        .hp-reels-video-popup{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;background:rgba(0,0,0,0.92);animation:hp-in .2s ease both}
        .hp-reels-video-popup iframe{width:100%;flex:1;border:none}

        .hp-reels-info{flex:1;padding:0 20px 28px;display:flex;flex-direction:column;justify-content:flex-start;position:relative;margin-top:-32px;z-index:1}

        /* ── Hero cinematic ── */
        .hp-hero{position:relative;overflow:hidden;min-height:420px;display:flex;background:var(--bg-body)}
        .hp-hero-bg{position:absolute;top:0;bottom:0;left:35%;right:340px;z-index:0;overflow:hidden;-webkit-mask-image:linear-gradient(to bottom, black 65%, transparent 100%);mask-image:linear-gradient(to bottom, black 65%, transparent 100%)}
        .hp-hero-bg img{width:100%;height:100%;object-fit:cover;object-position:center 25%;animation:hp-img-in .8s ease both;-webkit-mask-image:linear-gradient(to right, transparent 0%, black 10%, black 88%, transparent 100%);mask-image:linear-gradient(to right, transparent 0%, black 10%, black 88%, transparent 100%)}
        .hp-hero-grad{display:none}
        .hp-hero-content{position:relative;z-index:2;display:flex;align-items:stretch;max-width:1360px;margin:0 auto;padding:0 20px;width:100%;flex:1}
        .hp-hero-left{flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding:36px 0 40px;min-width:0}
        .hp-hero-right{width:332px;flex-shrink:0;padding:20px 16px 20px 20px;display:flex;flex-direction:column;border-left:1px solid ${T.chartBdr};background:${T.chartBg};position:relative;z-index:3}

        @media(max-width:960px){
          .hp-hero{min-height:auto;overflow:visible}
          .hp-hero-bg{left:0!important;right:0!important;height:260px;bottom:auto!important;z-index:0;flex-shrink:0}
          .hp-hero-bg img{-webkit-mask-image:linear-gradient(to bottom, black 55%, transparent 100%)!important;mask-image:linear-gradient(to bottom, black 55%, transparent 100%)!important}
          .hp-hero-content{flex-direction:column;position:relative;min-height:0}
          .hp-hero-left{padding:220px 0 20px!important;position:relative;z-index:2;min-height:200px}
          .hp-hero-right{display:none!important}
          .hp-hero-title{font-size:24px!important;line-height:1.1!important}
          .hp-hero-excerpt{font-size:13px!important;margin-bottom:12px!important;-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
          .hp-hero-dots{display:none!important}
          .hp-hero-vidcard{width:100%!important}
          .hp-disc-grid{grid-template-columns:1fr!important}
          .hp-triple{grid-template-columns:1fr!important}
        }
        @media(max-width:600px){
          .hp-hero-bg{height:220px}
          .hp-hero-left{padding:185px 0 18px!important;min-height:180px}
          .hp-hero-title{font-size:21px!important}
          .hp-hero-excerpt{-webkit-line-clamp:2}
        }

        @media(max-width:900px){
          .hp-triple{grid-template-columns:1fr!important}
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
        }
      `}</style>
      <div className="hp">

        {/* ═══════════════════════ CINEMATIC HERO ═══════════════════════ */}
        {hero && (
          <section className="hp-hero" ref={heroRef}>
            <div className="hp-hero-bg">
              {hero.bgImg ? (
                <img key={heroIdx} src={hero.bgImg} alt="" onLoad={() => setHeroImgLoaded(true)} style={{ opacity: heroImgLoaded ? 1 : 0 }} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: T.heroGrad }} />
              )}
            </div>
            <div className="hp-hero-grad" style={{ background: T.heroOverlay }} />
            <div className="hp-hero-content">
              <div className="hp-hero-left">
                <div key={heroIdx} style={{ animation: 'hp-in .5s ease both' }}>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ padding: '4px 14px', borderRadius: 20, fontSize: 10, fontWeight: 900, color: '#fff', background: hero.chipBg, fontFamily: 'Outfit,sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {hero.chip}
                    </span>
                  </div>
                  <Link href={hero.href} className="hp-hero-title" style={{
                    fontFamily: 'Outfit,sans-serif', fontSize: 42, fontWeight: 900,
                    color: dk ? '#fff' : 'var(--text-primary)', lineHeight: 1.06, margin: '0 0 10px',
                    letterSpacing: '-0.025em', maxWidth: 500, display: 'block',
                    textShadow: dk ? '0 2px 20px rgba(0,0,0,0.4)' : 'none',
                    textDecoration: 'none', transition: 'opacity .15s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                    {hero.title}
                    <span style={{
                      display: 'inline-block', marginLeft: 8, fontSize: '0.55em',
                      color: '#f97316', verticalAlign: 'middle', fontWeight: 700,
                      letterSpacing: 0, opacity: 0.9,
                    }}>→</span>
                  </Link>
                  {hero.subtitle && (
                    <p className="hp-hero-excerpt" style={{
                      fontSize: 14, color: dk ? 'rgba(210,225,245,0.65)' : 'var(--text-muted)',
                      margin: '0 0 14px', lineHeight: 1.55, maxWidth: 480,
                    }}>
                      {hero.subtitle}
                    </p>
                  )}
                  {/* FIX #3 (desktop): video card stays as is — looks good on desktop */}
                  {hero.videoId && !heroVideoPlaying && (
                    <button className="hp-hero-vidcard" onClick={() => setHeroVideoPlaying(true)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 8px 8px',
                      background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                      backdropFilter: dk ? 'blur(12px)' : 'none',
                      border: `1px solid ${dk ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                      borderRadius: 12, cursor: 'pointer', overflow: 'hidden', transition: 'all .2s', width: 220,
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = dk ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.15)'; e.currentTarget.style.background = dk ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = dk ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)'; e.currentTarget.style.background = dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
                      {/* Thumbnail — no play overlay */}
                      <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 8, overflow: 'hidden' }}>
                        <img src={`https://img.youtube.com/vi/${hero.videoId}/mqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      {/* Song info */}
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: dk ? '#fff' : 'var(--text-primary)', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hero.songTitle || 'Klausyti'}</p>
                        {hero.songArtist && <p style={{ fontSize: 10, color: dk ? 'rgba(255,255,255,0.45)' : 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hero.songArtist}</p>}
                      </div>
                      {/* YouTube icon pill */}
                      <div style={{
                        flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* YouTube lightbox — desktop hero */}
              {hero.videoId && heroVideoPlaying && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '50px 20px',
                  background: dk ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(8px)',
                  animation: 'hp-in .2s ease both',
                }} onClick={() => setHeroVideoPlaying(false)}>
                  <div style={{
                    width: '100%', maxWidth: 560, aspectRatio: '16/9',
                    borderRadius: 14, overflow: 'hidden', background: '#000',
                    boxShadow: dk ? '0 16px 64px rgba(0,0,0,0.9)' : '0 16px 64px rgba(0,0,0,0.2)',
                    border: `1px solid ${dk ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    position: 'relative',
                  }} onClick={e => e.stopPropagation()}>
                    <iframe src={`https://www.youtube.com/embed/${hero.videoId}?autoplay=1&rel=0`} style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay; encrypted-media" allowFullScreen />
                    <button onClick={() => setHeroVideoPlaying(false)} style={{
                      position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✕</button>
                  </div>
                </div>
              )}

              {/* Chart sidebar */}
              <div className="hp-hero-right">
                <div style={{ display: 'flex', marginBottom: 12 }}>
                  <div style={{ display: 'flex', flex: 1, borderRadius: 10, padding: 3, background: dk ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)', gap: 3 }}>
                    {([['lt', 'LT TOP 30'], ['world', 'TOP 40']] as const).map(([k, l]) => (
                      <button key={k} onClick={() => setChartTab(k)}
                        style={{
                          flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 700,
                          border: 'none', cursor: 'pointer', transition: 'all .15s', fontFamily: 'Outfit,sans-serif',
                          background: chartTab === k ? (dk ? 'rgba(255,255,255,.1)' : '#fff') : 'transparent',
                          color: chartTab === k ? (dk ? '#fff' : '#0f1a2e') : (dk ? '#6a88aa' : '#8899aa'),
                          boxShadow: chartTab === k ? (dk ? 'none' : '0 1px 3px rgba(0,0,0,.08)') : 'none',
                        }}>{l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {chartData.length === 0
                    ? Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="hp-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
                        <Skel w={20} h={16} /><Skel w={40} h={40} r={8} />
                        <div style={{ flex: 1 }}><Skel w="72%" h={11} /><div style={{ marginTop: 4 }}><Skel w="50%" h={9} /></div></div>
                      </div>
                    ))
                    : chartData.slice(0, 5).map((t, i) => (
                      <Link key={t.track_id || i} href={t.slug ? `/muzika/${t.slug}` : '/topas'}
                        className="hp-card"
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', textDecoration: 'none' }}>
                        <div style={{ width: 28, flexShrink: 0, textAlign: 'center' }}>
                          <span style={{ fontSize: 16, fontWeight: 900, fontFamily: 'Outfit,sans-serif', display: 'block', lineHeight: 1, color: t.pos <= 3 ? T.pos123 : (dk ? '#4a6888' : '#c0ccd8') }}>{t.pos}</span>
                          <div style={{ marginTop: 2 }}><TrendIcon t={t.trend} /></div>
                        </div>
                        <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 8, overflow: 'hidden' }}>
                          <Cover src={t.cover_url || t.artist_image} alt={t.title} size={40} radius={8} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                          <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artist}</p>
                        </div>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: dk ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill={dk ? '#fff' : '#0f1a2e'} style={{ marginLeft: 1 }}><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </Link>
                    ))}
                </div>
                <Link href="/topas/balsuoti" style={{
                  marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '10px', borderRadius: 10, background: '#f97316', color: '#fff',
                  fontSize: 12, fontWeight: 800, textDecoration: 'none', fontFamily: 'Outfit,sans-serif',
                  transition: 'all .15s', boxShadow: '0 2px 12px rgba(249,115,22,.3)',
                }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 18px rgba(249,115,22,.45)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(249,115,22,.3)'; e.currentTarget.style.transform = 'none' }}>
                  Balsuok
                </Link>
              </div>
            </div>

            {/* Hero dots */}
            {heroSlides.length > 1 && (
              <div className="hp-hero-dots" style={{ position: 'absolute', bottom: 18, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, zIndex: 3 }}>
                <button onClick={() => { setHeroImgLoaded(false); setHeroVideoPlaying(false); setHeroIdx(p => (p - 1 + heroSlides.length) % heroSlides.length) }}
                  aria-label="Ankstesnis"
                  style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${dk ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)'}`, background: dk ? 'rgba(0,0,0,.3)' : 'rgba(255,255,255,.5)', color: dk ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.4)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s', backdropFilter: 'blur(4px)' }}>‹</button>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {heroSlides.map((_, i) => (
                    <button key={i} onClick={() => { setHeroImgLoaded(false); setHeroVideoPlaying(false); setHeroIdx(i) }}
                      style={{ borderRadius: 4, border: 'none', cursor: 'pointer', padding: 0, background: i === heroIdx ? '#f97316' : dk ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.18)', width: i === heroIdx ? 28 : 10, height: 6, transition: 'all .3s', boxShadow: i === heroIdx ? '0 0 10px rgba(249,115,22,0.5)' : 'none' }} />
                  ))}
                </div>
                <button onClick={() => { setHeroImgLoaded(false); setHeroVideoPlaying(false); setHeroIdx(p => (p + 1) % heroSlides.length) }}
                  aria-label="Kitas"
                  style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${dk ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)'}`, background: dk ? 'rgba(0,0,0,.3)' : 'rgba(255,255,255,.5)', color: dk ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.4)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s', backdropFilter: 'blur(4px)' }}>›</button>
              </div>
            )}
          </section>
        )}

        {/* ═══════════════════════ THUMBNAIL STRIP (mobile) ═══════════════════════ */}
        {heroSlides.length > 0 && (
          <div className="hp-feed-strip" style={{ padding: '12px 16px 0' }}>
            <div style={{
              display: 'flex', gap: 7,
              overflowX: 'auto', scrollbarWidth: 'none',
              height: 112, alignItems: 'stretch',
            }}>
              {heroSlides.map((slide, i) => {
                const isSeen = seenSlides.has(slide.href)
                const artistName = slide.artist?.name || null
                return (
                  <button
                    key={i}
                    onClick={() => { setReelsIdx(i); setReelsOpen(true) }}
                    style={{
                      flexShrink: 0, position: 'relative', borderRadius: 11, overflow: 'hidden',
                      border: isSeen
                        ? `2px solid ${dk ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`
                        : '2px solid #f97316',
                      background: '#000', cursor: 'pointer', padding: 0,
                      width: 76, height: 108,
                      transition: 'opacity .15s, border-color .15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.82')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    {/* Image */}
                    {slide.bgImg
                      ? <img src={slide.bgImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0a1428,#162040)' }} />
                    }
                    {/* Gradient */}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.0) 50%)' }} />
                    {/* Bottom: artist name only if available, else nothing */}
                    {artistName && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '5px 6px' }}>
                        <p style={{
                          fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.9)',
                          margin: 0, lineHeight: 1.2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontFamily: 'Outfit,sans-serif',
                        }}>{artistName}</p>
                      </div>
                    )}
                    {/* Unseen dot */}
                    {!isSeen && (
                      <div style={{
                        position: 'absolute', top: 5, right: 5,
                        width: 6, height: 6, borderRadius: '50%',
                        background: '#f97316',
                        border: '1.5px solid #000',
                      }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════ MOBILE CHART ═══════════════════════ */}
        <div className="hp-mobile-chart" style={{ maxWidth: 1360, margin: '0 auto', padding: '20px 20px 0' }}>
          <div style={{ display: 'flex', marginBottom: 12 }}>
            <div style={{ display: 'flex', flex: 1, borderRadius: 10, padding: 3, background: dk ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)', gap: 3 }}>
              {([['lt', 'LT TOP 30'], ['world', 'TOP 40']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setChartTab(k)}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: 'none', cursor: 'pointer', transition: 'all .15s', fontFamily: 'Outfit,sans-serif',
                    background: chartTab === k ? (dk ? 'rgba(255,255,255,.1)' : '#fff') : 'transparent',
                    color: chartTab === k ? (dk ? '#fff' : '#0f1a2e') : (dk ? '#6a88aa' : '#8899aa'),
                    boxShadow: chartTab === k ? (dk ? 'none' : '0 1px 3px rgba(0,0,0,.08)') : 'none',
                  }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chartData.slice(0, 5).map((t, i) => (
              <Link key={t.track_id || i} href={t.slug ? `/muzika/${t.slug}` : '/topas'}
                className="hp-card"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', textDecoration: 'none' }}>
                <div style={{ width: 28, flexShrink: 0, textAlign: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 900, fontFamily: 'Outfit,sans-serif', display: 'block', lineHeight: 1, color: t.pos <= 3 ? T.pos123 : (dk ? '#4a6888' : '#c0ccd8') }}>{t.pos}</span>
                  <div style={{ marginTop: 2 }}><TrendIcon t={t.trend} /></div>
                </div>
                <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 8, overflow: 'hidden' }}>
                  <Cover src={t.cover_url || t.artist_image} alt={t.title} size={40} radius={8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artist}</p>
                </div>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: dk ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill={dk ? '#fff' : '#0f1a2e'} style={{ marginLeft: 1 }}><path d="M8 5v14l11-7z"/></svg>
                </div>
              </Link>
            ))}
          </div>
          <Link href="/topas/balsuoti" style={{
            marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '10px', borderRadius: 10, background: '#f97316', color: '#fff',
            fontSize: 12, fontWeight: 800, textDecoration: 'none', fontFamily: 'Outfit,sans-serif',
            boxShadow: '0 2px 12px rgba(249,115,22,.3)',
          }}>Balsuok</Link>
        </div>
        {/* hp-mobile-chart CSS moved to main style block above */}

        {/* ═══════════════════════ REELS OVERLAY — horizontal Stories ═══════════════════════ */}
        {reelsOpen && (
          <ReelsOverlay
            slides={heroSlides}
            initialIdx={reelsIdx}
            seenSlides={seenSlides}
            onSeen={(href) => setSeenSlides(prev => {
              const next = new Set(prev); next.add(href)
              try { localStorage.setItem('reels_seen', JSON.stringify(Array.from(next))) } catch {}
              return next
            })}
            onClose={() => setReelsOpen(false)}
            dk={dk}
          />
        )}

        {/* ═══════════════════════ MAIN CONTENT ═══════════════════════ */}
        <div className="hp-cnt" style={{ maxWidth: 1360, margin: '0 auto', padding: '42px 20px', display: 'flex', flexDirection: 'column', gap: 44 }}>

          {/* ── Naujos dainos: LT + Pasaulio ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0 }}>Naujos dainos</h2>
              <Link href="/muzika" style={{ fontSize: 12, color: 'var(--accent-link)', fontWeight: 700, textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>Visi →</Link>
            </div>

            {/* LT dainos */}
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🇱🇹</span> Lietuviška
              </p>
              <div className="hp-scroll" style={{ display: 'flex', gap: 8, paddingBottom: 2 }}>
                {tracks.length === 0 ? Array(6).fill(null).map((_, i) => (
                  <div key={i} style={{ width: 182, flexShrink: 0, padding: '9px 11px', borderRadius: 11, background: 'var(--bg-surface)', border: `1px solid var(--border-default)`, display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Skel w={38} h={38} r={8} /><div style={{ flex: 1 }}><Skel w="76%" h={10} /><div style={{ marginTop: 5 }}><Skel w="54%" h={8} /></div></div>
                  </div>
                )) : tracks.filter(t => sanitizeTitle(t.title)).slice(0, 10).map(t => (
                  <Link key={t.id} href={`/muzika/${t.slug}`} className="hp-card"
                    style={{ width: 182, flexShrink: 0, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Cover src={t.cover_url} ytId={null} alt={sanitizeTitle(t.title)} size={38} radius={8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sanitizeTitle(t.title)}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artists?.name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Pasaulio dainos */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🌍</span> Pasaulio
              </p>
              <div className="hp-scroll" style={{ display: 'flex', gap: 8, paddingBottom: 2 }}>
                {tracks.length === 0 ? Array(6).fill(null).map((_, i) => (
                  <div key={i} style={{ width: 182, flexShrink: 0, padding: '9px 11px', borderRadius: 11, background: 'var(--bg-surface)', border: `1px solid var(--border-default)`, display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Skel w={38} h={38} r={8} /><div style={{ flex: 1 }}><Skel w="76%" h={10} /><div style={{ marginTop: 5 }}><Skel w="54%" h={8} /></div></div>
                  </div>
                )) : tracks.filter(t => sanitizeTitle(t.title)).slice(10, 20).map(t => (
                  <Link key={t.id} href={`/muzika/${t.slug}`} className="hp-card"
                    style={{ width: 182, flexShrink: 0, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Cover src={t.cover_url || t.artists?.cover_image_url} ytId={null} alt={sanitizeTitle(t.title)} size={38} radius={8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sanitizeTitle(t.title)}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artists?.name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* ── Nauji albumai: LT + Pasaulio ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0 }}>Nauji albumai</h2>
              <Link href="/muzika?tab=albums" style={{ fontSize: 12, color: 'var(--accent-link)', fontWeight: 700, textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>Visi →</Link>
            </div>

            {/* LT albumai */}
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🇱🇹</span> Lietuviška
              </p>
              <div className="hp-scroll" style={{ display: 'flex', gap: 9, paddingBottom: 2 }}>
                {albums.length === 0 ? Array(5).fill(null).map((_, i) => (
                  <div key={i} style={{ width: 200, flexShrink: 0, padding: '10px 12px', borderRadius: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Skel w={46} h={46} r={9} /><div style={{ flex: 1 }}><Skel w="70%" h={10} /><div style={{ marginTop: 5 }}><Skel w="50%" h={9} /></div></div>
                  </div>
                )) : albums.slice(0, 7).map(a => (
                  <Link key={a.id} href={`/muzika/${a.slug}`} className="hp-card"
                    style={{ width: 200, flexShrink: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Cover src={a.cover_image_url || a.artists?.cover_image_url} ytId={null} alt={sanitizeTitle(a.title)} size={46} radius={9} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sanitizeTitle(a.title)}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.artists?.name}</p>
                      {a.year && <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: 0 }}>{a.year}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Pasaulio albumai */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🌍</span> Pasaulio
              </p>
              <div className="hp-scroll" style={{ display: 'flex', gap: 9, paddingBottom: 2 }}>
                {albums.length === 0 ? Array(5).fill(null).map((_, i) => (
                  <div key={i} style={{ width: 200, flexShrink: 0, padding: '10px 12px', borderRadius: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Skel w={46} h={46} r={9} /><div style={{ flex: 1 }}><Skel w="70%" h={10} /><div style={{ marginTop: 5 }}><Skel w="50%" h={9} /></div></div>
                  </div>
                )) : albums.slice(7, 14).map(a => (
                  <Link key={a.id} href={`/muzika/${a.slug}`} className="hp-card"
                    style={{ width: 200, flexShrink: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Cover src={a.cover_image_url || a.artists?.cover_image_url} ytId={null} alt={sanitizeTitle(a.title)} size={46} radius={9} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sanitizeTitle(a.title)}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.artists?.name}</p>
                      {a.year && <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: 0 }}>{a.year}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* ── Renginiai widget (po topais stilius) ── */}
          <section>
            <SH label="Artimiausi renginiai" href="/renginiai" />
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, overflow: 'hidden' }}>
              {filtEvt.length === 0 ? Array(4).fill(null).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <Skel w={52} h={52} r={10} />
                  <div style={{ flex: 1 }}><Skel w="75%" h={11} /><div style={{ marginTop: 5 }}><Skel w="45%" h={9} /></div></div>
                  <Skel w={48} h={10} />
                </div>
              )) : filtEvt.slice(0, 6).map((ev, i, arr) => {
                const d = new Date(ev.event_date)
                const now = new Date()
                const diffMs = d.getTime() - now.getTime()
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
                const countdown = diffDays < 0 ? 'Jau vyko' : diffDays === 0 ? 'Šiandien!' : diffDays === 1 ? 'Rytoj' : `Po ${diffDays} d.`
                const isClose = diffDays >= 0 && diffDays <= 3
                return (
                  <Link key={ev.id} href={`/renginiai/${ev.slug}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', textDecoration: 'none', borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none', transition: 'background .12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = dk ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Thumbnail */}
                    <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-body)' }}>
                      {ev.image_small_url
                        ? <img src={ev.image_small_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🎵</div>
                      }
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sanitizeTitle(ev.title)}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.getDate()} {MONTHS_LT[d.getMonth()]}. · {ev.venues?.name || ev.venue_custom || ''}{ev.venues?.city ? ` · ${ev.venues.city}` : ''}
                      </p>
                    </div>
                    {/* Countdown */}
                    <span style={{
                      flexShrink: 0, fontSize: 10, fontWeight: 800, fontFamily: 'Outfit,sans-serif',
                      color: isClose ? '#f97316' : 'var(--text-muted)',
                      background: isClose ? (dk ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.08)') : 'transparent',
                      padding: isClose ? '3px 8px' : '0',
                      borderRadius: 6,
                    }}>{countdown}</span>
                  </Link>
                )
              })}
            </div>
          </section>

          {/* ── ROW 4: Three-column ── */}
          <section>
            <div className="hp-triple" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'start' }}>
              <div><SH label="Dienos daina" href="/dienos-daina" /><DienosDainaWidget /></div>
              <div><SH label="Gyvi pokalbiai" href="/bendruomene" cta="Bendruomenė →" /><ShoutboxWidget /></div>
              <div>
                <SH label="Veikla" />
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Array(5).fill(null).map((_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Skel w={28} h={28} r={14} />
                      <div style={{ flex: 1 }}><Skel w="85%" h={9} /><div style={{ marginTop: 4 }}><Skel w="55%" h={8} /></div></div>
                    </div>
                  ))}
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', margin: '4px 0 0' }}>Greitai...</p>
                </div>
              </div>
            </div>
          </section>

          {/* ── ROW 5: Diskusijos + Atlikėjai ── */}
          <div className="hp-ne" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <section>
              <SH label="Bendruomenė" href="/diskusijos" cta="Visos diskusijos →" />
              <DiscussionsWidget />
            </section>
            <section>
              <SH label="Atrask atlikėjus" href="/atlikejai" />
              <div className="hp-ag" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
                {artists.length === 0 ? Array(8).fill(null).map((_, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 28, margin: '0 auto' }}><Skel w={56} h={56} r={28} /></div>
                    <div style={{ margin: '8px auto 0', maxWidth: 56 }}><Skel w="100%" h={9} /></div>
                  </div>
                )) : artists.slice(0, 8).map(a => (
                  <Link key={a.id} href={`/atlikejai/${a.slug}`} className="hp-art"
                    style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                    <div className="hp-art-img" style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 8px', overflow: 'hidden', transition: 'transform .3s', boxShadow: `0 5px 18px ${dk ? `hsla(${strHue(a.name)},35%,5%,.9)` : `hsla(${strHue(a.name)},25%,40%,.15)`}` }}>
                      <Cover src={a.cover_image_url} alt={a.name} size={56} radius={28} />
                    </div>
                    <p style={{ fontFamily: 'Outfit,sans-serif', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          {/* ── ROW 6: CTA ── */}
          <section>
            <div className="hp-cta" style={{ padding: '32px 40px', borderRadius: 18, background: dk ? 'linear-gradient(135deg,rgba(29,78,216,.09) 0%,rgba(255,255,255,.015) 100%)' : 'linear-gradient(135deg,rgba(29,78,216,.06) 0%,rgba(255,255,255,.5) 100%)', border: `1px solid ${dk ? 'rgba(29,78,216,.15)' : 'rgba(29,78,216,.12)'}`, display: 'flex', alignItems: 'center', gap: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 0% 50%,rgba(29,78,216,.06) 0%,transparent 55%)', pointerEvents: 'none' }} />
              <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, background: dk ? 'rgba(29,78,216,.15)' : 'rgba(29,78,216,.1)', border: `1px solid ${dk ? 'rgba(29,78,216,.22)' : 'rgba(29,78,216,.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎤</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 19, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 4px' }}>Atlikėjams</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55, maxWidth: 480 }}>Sukurk arba perimk savo profilį Music.lt platformoje. Skelk naujienas, renginius ir naują muziką tiesiai savo gerbėjams — nemokamai.</p>
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
