'use client'
// app/lt/daina/[slug]/[id]/track-page-client.tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import ScoreCard from '@/components/ScoreCard'
import { LikePill } from '@/components/LikePill'
import { SharePill } from '@/components/SharePill'
import { proxyImg } from '@/lib/img-proxy'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import LyricsWithReactions from '@/components/LyricsWithReactions'
import { formatArtistList } from '@/lib/format-artists'

// ── Types ──────────────────────────────────────────────────────────────────────

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null; cover_image_wide_url?: string | null; description?: string | null }
type Track = {
  id: number; slug: string; title: string; type: string
  video_url: string | null; spotify_id: string | null; release_date: string | null
  release_year?: number | null; release_month?: number | null
  lyrics: string | null; chords: string | null; description: string | null
  show_player: boolean; is_new: boolean; featuring: Artist[]
  show_ai_interpretation: boolean
  score?: number | null; score_breakdown?: any
  peak_chart_position?: number | null; certifications?: any
}
type Album = { id: number; slug: string; title: string; year?: number; cover_image_url: string | null; type: string }
type Version = { id: number; slug: string; title: string; type: string; video_url: string | null }
type Props = {
  track: Track; artist: Artist; albums: Album[]
  versions: Version[]; likes: number
  trivia: string | null
  relatedTracks: Track[]
  aiInterpretation?: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}
function fmtDate(d: string | null): string | null {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  const mo = ['sausio','vasario','kovo','balandžio','gegužės','birželio','liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']
  return `${dt.getFullYear()} m. ${mo[dt.getMonth()]} ${dt.getDate()} d.`
}
// Aprašymai saugomi kaip HTML — paverčiam į švarų tekstą.
function plainText(s?: string | null): string {
  if (!s) return ''
  return s
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const MusicIcon = ({ s = 16, c = '#fff' }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
)
const GuitarIcon = ({ s = 13, c = 'currentColor' }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M19.59 3c-.96 0-1.86.37-2.54 1.05L14 7.1C12.45 6.39 10.6 6.6 9.26 7.93L3 14.19l.71.71-1.42 1.41 1.42 1.41 1.06-1.06.7.71-1.41 1.41 1.41 1.41 1.41-1.41.71.71-1.06 1.06 1.41 1.41L16.07 15c1.33-1.33 1.54-3.19.82-4.73l3.06-3.06C20.63 6.53 21 5.63 21 4.66 21 3.74 20.26 3 19.59 3zM15 15l-5-5 1.41-1.41 5 5L15 15z"/></svg>
)
/**
 * CustomPlayOverlay — vietoj YT native chrome'o detail'ų rodom mūsų
 * thumbnail + Play overlay'ą. Paspaudus:
 *   1) inkrementuojam track_plays per /api/tracks/{id}/play (fire-and-forget)
 *   2) mount'inam iframe'ą su autoplay=1&mute=1 — Chrome'as garantuotai laidžia
 *      muted autoplay (bet kokiai MEI score). User'is paskui paspaudžia 🔊
 *      YT chrome'e arba rodyti stay muted.
 *
 * Naudojamas track puslapyje (mobile + desktop col), gali būti reused kitur.
 */
function CustomPlayOverlay({ vid, title, trackId }: { vid: string; title: string; trackId: number }) {
  const [started, setStarted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [needsUnmute, setNeedsUnmute] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const m = window.matchMedia('(max-width: 1023px)')
    setIsMobile(m.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])

  // Auto-attempt unmute on mobile po iframe load — jei browser'is leidžia,
  // garsas pradeda groti tiesiogiai. Jei ne — badge lieka.
  useEffect(() => {
    if (!started || !isMobile) {
      setNeedsUnmute(false)
      return
    }
    setNeedsUnmute(true)
    const tryUnmute = () => {
      try {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
          'https://www.youtube.com'
        )
      } catch {}
    }
    const timers = [
      setTimeout(tryUnmute, 800),
      setTimeout(tryUnmute, 1600),
      setTimeout(tryUnmute, 3000),
    ]
    return () => { timers.forEach(clearTimeout) }
  }, [started, isMobile])

  const handleStart = () => {
    if (started) return
    setStarted(true)
    try {
      fetch(`/api/tracks/${trackId}/play`, { method: 'POST', keepalive: true }).catch(() => {})
    } catch {}
  }
  return (
    <div className="relative h-full w-full" style={{ isolation: 'isolate' }}>
      {!started ? (
        <button
          type="button"
          onClick={handleStart}
          aria-label="Paleisti"
          className="group absolute inset-0 z-10 block cursor-pointer overflow-hidden border-0 p-0 bg-black"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-black/30" />
          <span className="absolute left-1/2 top-1/2 flex h-[64px] w-[64px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_10px_40px_rgba(249,115,22,0.5)] ring-[6px] ring-white/10 transition-transform duration-200 group-hover:scale-110">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      ) : (
        <>
          <iframe
            ref={iframeRef}
            key={`overlay-${vid}`}
            src={`https://www.youtube.com/embed/${vid}?autoplay=1${isMobile ? '&mute=1' : ''}&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`}
            title={title}
            className="absolute inset-0 h-full w-full"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
          {isMobile && needsUnmute && (
            <button
              type="button"
              onClick={() => {
                try {
                  iframeRef.current?.contentWindow?.postMessage(
                    JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
                    'https://www.youtube.com'
                  )
                } catch {}
                setNeedsUnmute(false)
              }}
              className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur-sm px-3 py-1.5 text-white text-xs font-bold shadow-lg ring-1 ring-white/20 hover:bg-black/85 transition-colors"
              title="Įjungti garsą"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              Garsui
            </button>
          )}
        </>
      )}
    </div>
  )
}

// AI image with loading state — separate memo so it never re-mounts
// No external image service needed — AI image feature removed for now

// ── Main component ─────────────────────────────────────────────────────────────

export default function TrackPageClient({
  track, artist, albums, versions, likes: initialLikes,
  trivia, relatedTracks,
  aiInterpretation,
}: Props) {
  // ── State ──────────────────────────────────────────────────────────────────
  // Like — PERSISTINAMAS per /api/tracks/[id]/like (auth + anon cookie flow,
  // kaip albumo puslapyje). Anksčiau buvo tik vizualus toggle.
  const [selfLiked, setSelfLiked] = useState(false)
  const [likePending, setLikePending] = useState(false)
  const [likeCount, setLikeCount] = useState(initialLikes)
  const [tab, setTab] = useState<'lyrics' | 'chords'>('lyrics')
  const [showAllV, setShowAllV] = useState(false)
  // Mobile tab toggle — kaip artist'o modal'e: tarp lyrics ir comments,
  // kad nereikėtų stacked column'ų vienoj per kitą screen'e.
  const [mobileTab, setMobileTab] = useState<'lyrics' | 'comments'>('lyrics')
  // Komentarų count — emit'ina EntityCommentsBlock. Rodomas header'io
  // veiksmų eilutėje ir stulpelio antraštėje (consistency su modal'u).
  const [commentTotal, setCommentTotal] = useState(0)
  // Scroll target — „Komentarai" pill desktop'e scroll'ina į komentarų stulpelį.
  const commentsColRef = useRef<HTMLDivElement>(null)
  const { data: authSession } = useSession()
  const isLoggedIn = !!authSession?.user

  // ── Teksto pasiūlymas (kai dainos teksto nėra) ──────────────────────────────
  const [lyricsDraft, setLyricsDraft] = useState('')
  const [lyricsSubmitting, setLyricsSubmitting] = useState(false)
  const [lyricsSubmitted, setLyricsSubmitted] = useState(false)
  const [lyricsErr, setLyricsErr] = useState('')
  const submitLyrics = async () => {
    if (lyricsSubmitting) return
    const text = lyricsDraft.trim()
    if (!text) { setLyricsErr('Įrašyk tekstą'); return }
    setLyricsSubmitting(true); setLyricsErr('')
    try {
      const res = await fetch(`/api/tracks/${track.id}/suggest-lyrics`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: text }),
      })
      const d = await res.json()
      if (!res.ok) { setLyricsErr(d.error || 'Nepavyko išsiųsti'); setLyricsSubmitting(false); return }
      setLyricsSubmitted(true)
    } catch { setLyricsErr('Tinklo klaida') }
    setLyricsSubmitting(false)
  }

  // Like sync + toggle (mirrors album-page-client)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/tracks/${track.id}/like`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (typeof d.liked === 'boolean') setSelfLiked(d.liked)
        if (typeof d.count === 'number') setLikeCount(d.count)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [track.id])

  const onToggleLike = async () => {
    if (likePending) return
    setLikePending(true)
    const prev = selfLiked
    setSelfLiked(!prev)
    setLikeCount(c => c + (prev ? -1 : 1))
    try {
      const res = await fetch(`/api/tracks/${track.id}/like`, { method: 'POST' })
      const data = await res.json()
      if (typeof data.liked === 'boolean') setSelfLiked(data.liked)
      if (typeof data.count === 'number') setLikeCount(data.count)
    } catch {
      setSelfLiked(prev)
      setLikeCount(c => c - (prev ? -1 : 1))
    } finally {
      setLikePending(false)
    }
  }

  // ── ⋯ veiksmų meniu (nuotaikos daina / pasiūlyti į dienos dainą) ──────────
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuBusy, setMenuBusy] = useState(false)
  const [menuMsg, setMenuMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])
  useEffect(() => {
    if (!menuMsg) return
    const t = setTimeout(() => setMenuMsg(null), 3500)
    return () => clearTimeout(t)
  }, [menuMsg])

  const makeMoodSong = async () => {
    if (menuBusy) return
    if (!isLoggedIn) { setMenuOpen(false); setMenuMsg({ ok: false, text: 'Prisijunk, kad pažymėtum nuotaikos dainą.' }); return }
    setMenuBusy(true)
    try {
      const res = await fetch('/api/mano-muzika/mood', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: track.id, make_active: true }),
      })
      const d = await res.json().catch(() => ({}))
      setMenuMsg(res.ok ? { ok: true, text: '✓ Nustatyta kaip tavo nuotaikos daina.' } : { ok: false, text: d.error || 'Nepavyko.' })
    } catch { setMenuMsg({ ok: false, text: 'Tinklo klaida.' }) }
    finally { setMenuBusy(false); setMenuOpen(false) }
  }

  const nominateDienosDaina = async () => {
    if (menuBusy) return
    if (!isLoggedIn) { setMenuOpen(false); setMenuMsg({ ok: false, text: 'Prisijunk, kad pasiūlytum dienos dainą.' }); return }
    setMenuBusy(true)
    try {
      const res = await fetch('/api/dienos-daina/nominations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: track.id }),
      })
      const d = await res.json().catch(() => ({}))
      setMenuMsg(res.ok ? { ok: true, text: '✓ Pasirinkta Dienos daina!' } : { ok: false, text: d.error || 'Nepavyko.' })
    } catch { setMenuMsg({ ok: false, text: 'Tinklo klaida.' }) }
    finally { setMenuBusy(false); setMenuOpen(false) }
  }

  // Likers modal — universal'us pop-over visiems entity types (comment / track /
  // album / post). Atidaromas paspaudus ant ♥N badge'o.
  const [likersModalEntity, setLikersModalEntity] = useState<{ type: string; id: number; label: string } | null>(null)
  const [likersModalUsers, setLikersModalUsers] = useState<Array<{ user_username: string; user_rank: string | null; user_avatar_url: string | null }> | null>(null)
  useEffect(() => {
    if (!likersModalEntity) { setLikersModalUsers(null); return }
    setLikersModalUsers(null)
    fetch(`/api/likes/${likersModalEntity.type}/${likersModalEntity.id}`)
      .then(r => r.json())
      .then(d => setLikersModalUsers(d.users || []))
      .catch(() => setLikersModalUsers([]))
  }, [likersModalEntity])

  // AI
  const [aiText, setAiText] = useState<string | null>(aiInterpretation ?? null)
  const [aiLoad, setAiLoad] = useState(false)
  const [aiErr, setAiErr] = useState(false)

  // Page-view ping — fire-and-forget. Server-side endpoint dedup'ina
  // per cookie (30 min lange), todėl page reload'ai netaškys counter'io.
  // Migracija 20260506_page_view_tracking.sql turi būti aplikuota — jei
  // ne, endpoint'as silently failina ir `tracks.page_view_count` lieka 0.
  useEffect(() => {
    if (!track.id) return
    fetch(`/api/tracks/${track.id}/page-view`, { method: 'POST', keepalive: true }).catch(() => {})
  }, [track.id])

  // ── Derived ────────────────────────────────────────────────────────────────
  const vid = ytId(track.video_url)
  const hasLyrics = !!track.lyrics?.trim()
  const hasChords = !!track.chords?.trim()
  const primaryAlbum = albums[0] ?? null
  // Data: pilna data → metai (+mėn.) → albumo metai (fallback, nes daugumai dainų
  // tikslios datos DB nėra, bet albumas dažnai turi metus).
  const dateStr = fmtDate(track.release_date)
    || (track.release_year ? `${track.release_year} m.` : null)
    || (primaryAlbum?.year ? `${primaryAlbum.year} m.` : null)

  // ── CSS Variables are used instead of inline theme object ──────────────────
  // All theme colors are now defined in globals.css with [data-theme] attribute
  // This keeps the component logic clean and theme management centralized

  const cardStyle: React.CSSProperties = { background: 'var(--card-surface)', border: '1px solid var(--card-border-default)', borderRadius: 16, overflow: 'hidden' }
  const headStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderBottom: '1px solid var(--card-border-subtle)',
    fontSize: 11, fontWeight: 700, color: 'var(--head-text)',
    fontFamily: 'Outfit,sans-serif', textTransform: 'uppercase', letterSpacing: '.08em',
  }

  // ── AI generation ──────────────────────────────────────────────────────────
  const doAI = useCallback(async () => {
    if (!hasLyrics || aiLoad) return
    setAiLoad(true); setAiErr(false); setAiText(null); 
    try {
      const res = await fetch(`/api/tracks/${track.id}/ai-interpretation`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setAiText(d.interpretation ?? null)
      
    } catch { setAiErr(true) }
    setAiLoad(false)
  }, [hasLyrics, aiLoad, track.id])

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  // ── Cards ──────────────────────────────────────────────────────────────────
  // (2026-06-11 valymas: TrackInfoCard, PlayerCard + vidAvailable probe,
  //  DiscussionsCard, RelatedCard, LyricsCard — dead code, niekur
  //  nerenderinti nuo modal-style layout perėjimo. Pašalinti.)


  const AICard = () => {
    if (!track.show_ai_interpretation) return null
    return (
      <div style={cardStyle}>
        <div style={headStyle}>
          <span>✦ AI interpretacija</span>
          {!aiText && <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-faint)', textTransform: 'none', letterSpacing: 0 }}>beta</span>}
        </div>
        <div style={{ padding: 14 }}>
          {!aiText && !aiLoad && !aiErr && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                Claude perskaitys žodžius ir sukurs interpretaciją bei abstraktų paveikslėlį, perteikiantį dainos nuotaiką.
              </p>
              <button onClick={doAI}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 999, background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.35)', color: 'var(--accent-orange)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>
                ✦ Generuoti
              </button>
            </div>
          )}
          {aiLoad && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>
              <span style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block', fontSize: 20, color: 'var(--accent-orange)' }}>✦</span>
              Claude analizuoja žodžius…
            </div>
          )}
          {aiErr && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0' }}>
              Nepavyko. <button onClick={doAI} style={{ color: 'var(--accent-orange)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Bandyti dar kartą</button>
            </div>
          )}
          {aiText && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--dyk-text)', lineHeight: 1.85 }}>
                {aiText.split('\n\n').filter(p => p.trim()).map((p, i) => (
                  <p key={i} style={{ margin: i > 0 ? '12px 0 0' : 0 }}>{p.trim()}</p>
                ))}
              </div>

            </div>
          )}
        </div>
      </div>
    )
  }

  const VersionsCard = () => {
    if (versions.length === 0) return null
    const vis = showAllV ? versions : versions.slice(0, 4)
    return (
      <div style={cardStyle}>
        <div style={headStyle}>Versijos ir remixai <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-faint)', textTransform: 'none', letterSpacing: 0 }}>{versions.length}</span></div>
        {vis.map((v, i) => (
          <Link key={v.id} href={`/dainos/${artist.slug}-${v.slug}-${v.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < vis.length - 1 ? '1px solid var(--card-border-subtle)' : 'none', textDecoration: 'none' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--card-hover-bg)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: ytId(v.video_url) ? 'rgba(249,115,22,.12)' : 'var(--cover-placeholder)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${ytId(v.video_url) ? 'rgba(249,115,22,.2)' : 'var(--card-border-default)'}` }}>
              {ytId(v.video_url) ? <svg width="9" height="9" viewBox="0 0 10 10" fill="var(--accent-orange)"><polygon points="2,1 9,5 2,9"/></svg> : <MusicIcon s={11} c="var(--text-faint)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{v.type === 'normal' ? 'Daina' : v.type}</div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>→</span>
          </Link>
        ))}
        {versions.length > 4 && (
          <button onClick={() => setShowAllV(x => !x)}
            style={{ width: '100%', padding: 9, background: 'transparent', border: 'none', borderTop: '1px solid var(--card-border-subtle)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'Outfit,sans-serif' }}>
            {showAllV ? '↑ Mažiau' : `Visos ${versions.length} versijos ↓`}
          </button>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN RETURN — modal-style layout for the standalone track page.
  // Idėja: pati struktūra atitiktu artist'o TrackInfoModal'ą — top bar pilnu
  // ilgiu su thumb + title + LikePill + DropBar + meta + actions, paskui
  // 3-col body (lyrics | comments | player+related) wide desktop'e, 2-col
  // (lyrics | comments) viduriniam desktop'e, mobile'e tab toggle tarp lyrics
  // ir comments. Vientisas vizualinis flow per modal ir page.
  // ══════════════════════════════════════════════════════════════════════════

  // Pageload helper - main artist + featuring formatted as a single line
  const artistLine = formatArtistList(
    { id: artist.id, slug: artist.slug, name: artist.name },
    track.featuring,
  )

  return (
    // route-enter: 280ms fade-in iš loading.tsx skeleton'o (žr. globals.css).
    <div className="route-enter min-h-screen lg:min-h-0 lg:h-[calc(100vh_-_56px)] lg:flex lg:flex-col lg:overflow-hidden bg-[var(--bg-surface)] text-[var(--text-primary)]" style={{ fontFamily: "'DM Sans',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased' }}>

      {/* ── TOP BAR — border'as pilnu pločiu, turinys centruotas iki max-w-[1400px]
          (suvienodinta su body grid'u). Desktop'e shrink-0 — fiksuoto aukščio
          flex-col root'e, kad body zona užimtų likusį viewport'ą be page scroll. */}
      <div className="lg:shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
       <div className="mx-auto flex w-full max-w-[1400px] items-center gap-4 px-4 py-3 sm:px-5">
        {/* Artist thumb — paveikslėlio click'as = grįžti į atlikėjo page'ą.
            Anksčiau buvo atskira ← rodyklė + thumb, bet rodyklė atrodė kaip
            confusing nav element'as. Dabar: vienas natūralus signal'as —
            click'ini ant atlikėjo nuotraukos, gauni jo puslapį.
            Padidinta iki 64x64 kad atitiktų stilių artist page hero strip'o. */}
        {(() => {
          const thumbSrc = (artist as any).profile_thumb_url || primaryAlbum?.cover_image_url || artist.cover_image_url || null
          return (
            <Link
              href={`/atlikejai/${artist.slug}`}
              aria-label={`Grįžti pas ${artist.name}`}
              title={`Grįžti pas ${artist.name}`}
              className="group relative shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] transition-all hover:border-[var(--accent-orange)] hover:shadow-[0_0_0_3px_rgba(249,115,22,0.18)]"
              style={{ width: 88, height: 88 }}
            >
              {thumbSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImg(thumbSrc)}
                  alt={artist.name}
                  referrerPolicy="no-referrer"
                  style={{ objectPosition: 'center top' }}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--cover-placeholder)] text-[20px]">🎵</div>
              )}
              {/* Subtle hover overlay su back arrow ikona — nuoroda, kad
                  click'as veikia kaip „atgal pas atlikėją" */}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </span>
            </Link>
          )
        })()}
        {/* Identity cluster — kicker (TIPAS · METAI) → title → atlikėjas →
            veiksmų eilutė (LikePill + Komentarai + Dalintis). Ta pati
            struktūra kaip TrackInfoModal header'yje — vienoda „dainos
            kortelės kalba" puslapyje ir modale. */}
        <div className="min-w-0 flex-1">
          {/* Kicker removed — date shown in meta area, was redundant */}
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="truncate font-['Outfit',sans-serif] text-[16px] font-extrabold leading-tight text-[var(--text-primary)] sm:text-[17px]">
              {track.title}
            </h1>
            {track.is_new && (
              <span className="inline-flex items-center rounded-full border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.18)] px-2 py-0.5 font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-orange)]">
                NEW
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] sm:text-[12.5px]">
            {artistLine}
          </div>
          {/* Data PO atlikėjo (albumas perkeltas žemiau, kairėje — nebesikartoja). */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            {dateStr && (
              <span className="font-['Outfit',sans-serif] text-[11px] font-bold text-[var(--text-secondary)]">
                {dateStr}
              </span>
            )}
          </div>
        </div>
        {/* Admin score — kai turim score, mažas chip'as šalia meta. Kiti
            useriai šito nemato (ScoreCard pats handle'ina admin gating). */}
        {track.score !== null && track.score !== undefined && (
          <div className="hidden xl:block">
            <ScoreCard entityType="track" score={track.score} breakdown={track.score_breakdown} compact />
          </div>
        )}
       </div>
      </div>

      {/* ── Body — player left, content right on lg+ ─────────── */}
      <div className={[
        'mx-auto w-full max-w-[1400px]',
        'grid grid-cols-1',
        'lg:grid-cols-[minmax(0,55%)_minmax(0,45%)]',
        // Desktop: dvi-panelių zona užima LIKUSĮ viewport'ą (flex-1 root flex-col'e,
        // po header'io) su overflow-hidden — tekstas/komentarai IR extras scroll'inasi
        // VIDUJ, NE visas puslapis; video visada matomas, scroll apačia matoma be
        // page scroll. grid-rows-[auto_1fr] panaikina „tarpą po video". Mobile: srautas.
        'lg:min-h-0 lg:flex-1 lg:grid-rows-[auto_minmax(0,1fr)]',
        'lg:overflow-hidden',
      ].join(' ')}>

        {/* Video — viršus kairėje (desktop) / pirmas (mobile). Source order:
            video → extras → dešinė; mobile stack'as natūralus, desktop'e
            explicit grid placement grąžina extras po video kairėje. */}
        <div className="order-1 lg:col-start-1 lg:row-start-1">
          {/* Video player */}
          {vid && (
            <div className="w-full bg-black">
              <div className="aspect-video w-full overflow-hidden lg:rounded-none">
                <CustomPlayOverlay vid={vid} title={`${track.title} — ${artist.name}`} trackId={track.id} />
              </div>
            </div>
          )}
          {!vid && (
            <div className="hidden lg:flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-10 mx-5 mt-5 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--card-bg)] ring-1 ring-[var(--border-subtle)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)]">
                  <path d="M23 7l-7 5 7 5V7z" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Vaizdo įrašo nėra
              </div>
            </div>
          )}
        </div>

        {/* Po video (extras) — dainos APRAŠYMAS (jei įdėtas) ARBA susijusi muzika.
            Atlikėjo „grupės info" kortelė pašalinta (Edvardo prašymu). Desktop'e
            scroll'inasi VIDUJ (row2 = 1fr), kad neišstumtų puslapio. */}
        <div className="order-3 flex flex-col gap-3 px-5 py-5 lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:overflow-y-auto">
            <AICard />
            <VersionsCard />
            {(() => {
              const more = relatedTracks.filter(t => ytId(t.video_url)).slice(0, 6)
              const desc = plainText(track.description)
              return (
                <div>
                  {/* Dainos aprašymas, jei įdėtas — kitu atveju susijusi muzika. */}
                  {desc ? (
                    <div className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                      <div className="mb-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Apie dainą
                      </div>
                      <p className="whitespace-pre-line font-['Outfit',sans-serif] text-[13px] leading-[1.7] text-[var(--text-secondary)]">
                        {desc}
                      </p>
                    </div>
                  ) : more.length > 0 ? (
                    <div className="mb-3">
                      <div className="mb-2 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Susijusi muzika
                      </div>
                      {/* Kompaktiškos eilutės 2 stulpeliais (maža miniatiūra + pavadinimas),
                          kad netilptų į scroll'ą ir nebūtų „perdidelės" kortelės. */}
                      <div className="hidden lg:grid grid-cols-2 gap-1.5">
                        {more.slice(0, 6).map(t => {
                          const tvid = ytId(t.video_url)
                          const thumb = tvid ? `https://i.ytimg.com/vi/${tvid}/mqdefault.jpg` : null
                          return (
                            <Link key={t.id} href={`/dainos/${artist.slug}-${t.slug}-${t.id}`}
                              title={`${t.title} — ${artist.name}`}
                              className="group flex items-center gap-2 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]">
                              <div className="aspect-video h-9 shrink-0 overflow-hidden rounded bg-black">
                                {thumb && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-['Outfit',sans-serif] text-[11px] font-extrabold leading-tight text-[var(--text-primary)]">{t.title}</div>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                      <div className="flex lg:hidden gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                        {more.slice(0, 6).map(t => {
                          const tvid = ytId(t.video_url)
                          const thumb = tvid ? `https://i.ytimg.com/vi/${tvid}/mqdefault.jpg` : null
                          return (
                            <Link key={t.id} href={`/dainos/${artist.slug}-${t.slug}-${t.id}`}
                              title={`${t.title} — ${artist.name}`}
                              className="group flex w-[160px] shrink-0 flex-col gap-1.5 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1.5 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]">
                              <div className="aspect-video w-full overflow-hidden rounded bg-black">
                                {thumb && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                                )}
                              </div>
                              <div className="px-1">
                                <div className="truncate font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)]">{t.title}</div>
                                <div className="truncate font-['Outfit',sans-serif] text-[10px] text-[var(--text-faint)]">{artist.name}</div>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                  {/* Albumas, iš kurio daina. */}
                  {primaryAlbum && (
                    <Link
                      href={`/albumai/${artist.slug}-${primaryAlbum.slug}-${primaryAlbum.id}`}
                      title={primaryAlbum.title}
                      className="group flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 no-underline transition-colors hover:border-[var(--border-strong)]"
                    >
                      <span className="h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-[var(--cover-placeholder)]">
                        {primaryAlbum.cover_image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proxyImg(primaryAlbum.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-['Outfit',sans-serif] text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-muted)]">Iš albumo</div>
                        <div className="truncate font-['Outfit',sans-serif] text-[14px] font-extrabold leading-tight text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{primaryAlbum.title}</div>
                        {primaryAlbum.year && (
                          <div className="text-[11.5px] font-semibold text-[var(--text-muted)]">{primaryAlbum.year} m.</div>
                        )}
                      </div>
                      {albums.length > 1 && (
                        <span className="shrink-0 font-['Outfit',sans-serif] text-[10px] font-bold text-[var(--text-faint)]" title={albums.slice(1).map(a => a.title).join(', ')}>+{albums.length - 1}</span>
                      )}
                      <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--text-faint)] transition-colors group-hover:text-[var(--accent-orange)]">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </Link>
                  )}
                </div>
              )
            })()}
          </div>

        {/* Dešinė — tabai (Tekstas/Komentarai) + Patinka/Dalintis/Spotify + turinys.
            Desktop'e dešinis stulpelis per abi eilutes; mobile'e — antras. */}
        <div className="order-2 flex min-h-0 flex-col lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:border-l lg:border-[var(--border-subtle)]">
          {/* Tab juosta — VISUOSE viewport'uose (kaip modale). Dešinėje veiksmai:
              Patinka + Dalintis + Spotify (maža ikona). 2026-06-25: nuimtas
              bg-elevated „bandas" — juosta susilieja su paviršiumi, lieka tik
              vienas plonas border-b (mažiau horizontalių juostų chaoso). */}
          <div className="flex shrink-0 items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-1.5">
            <button
              type="button"
              onClick={() => setMobileTab('lyrics')}
              className={[
                "relative flex items-center gap-1.5 px-1 py-1.5 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
                mobileTab === 'lyrics'
                  ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[6px] after:h-[2px] after:bg-[var(--accent-orange)]'
                  : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              Tekstas
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('comments')}
              className={[
                "relative flex items-center gap-1.5 px-1 py-1.5 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
                mobileTab === 'comments'
                  ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[6px] after:h-[2px] after:bg-[var(--accent-orange)]'
                  : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              Komentarai
              {commentTotal > 0 && (
                <span className="rounded-full bg-[var(--accent-orange)] px-1.5 py-px text-[10px] font-extrabold leading-none text-white">
                  {commentTotal}
                </span>
              )}
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              <LikePill
                likes={likeCount}
                selfLiked={selfLiked}
                onToggle={onToggleLike}
                pending={likePending}
                onOpenModal={() => setLikersModalEntity({ type: 'track', id: track.id, label: 'dainą' })}
                variant="surface"
                size="sm"
              />
              <SharePill title={`${track.title} — ${artist.name}`} url={`/dainos/${artist.slug}-${track.slug}-${track.id}`} size="sm" />
              {track.spotify_id && (
                <a
                  href={`https://open.spotify.com/track/${track.spotify_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Klausyti Spotify"
                  aria-label="Klausyti Spotify"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#1DB954] transition-opacity hover:opacity-80"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                </a>
              )}
              {/* ⋯ veiksmų meniu */}
              <div ref={menuRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setMenuOpen(v => !v)}
                  aria-label="Daugiau veiksmų"
                  title="Daugiau veiksmų"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-9 z-50 w-60 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] py-1 shadow-[0_18px_40px_-10px_rgba(0,0,0,0.5)]">
                    <button
                      type="button"
                      onClick={nominateDienosDaina}
                      disabled={menuBusy}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-['Outfit',sans-serif] text-[12.5px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--accent-orange)]">
                        <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                      </svg>
                      Pasirinkti Dienos dainą
                    </button>
                    <button
                      type="button"
                      onClick={makeMoodSong}
                      disabled={menuBusy}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-['Outfit',sans-serif] text-[12.5px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--text-muted)]">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                      Nustatyti kaip nuotaikos dainą
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {menuMsg && (
            <div className={[
              'shrink-0 px-4 py-2 text-center font-["Outfit",sans-serif] text-[12px] font-bold',
              menuMsg.ok ? 'bg-[rgba(34,197,94,0.12)] text-[#16a34a]' : 'bg-[rgba(239,68,68,0.10)] text-[#dc2626]',
            ].join(' ')}>
              {menuMsg.text}
            </div>
          )}

          {/* Scroll'inama zona — tekstas/komentarai scroll'inasi VIDUJ (desktop),
              video lieka matomas; mobile'e — normalus puslapio srautas. */}
          <div className="flex-1 min-h-0 lg:overflow-y-auto">
          {/* Tekstas — jei yra, rodom; jei ne — siūlymo forma (always present). */}
          <div className={[
            'min-h-0 px-5 py-5',
            mobileTab === 'lyrics' ? 'block' : 'hidden',
          ].join(' ')}>
            <div className="mb-4 flex items-baseline gap-2">
              <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Dainos tekstas
              </div>
              {hasLyrics && (
                <span className="font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-orange)]">
                  pažymėk → reaguok
                </span>
              )}
              {hasLyrics && hasChords && (
                <button
                  type="button"
                  onClick={() => setTab(tab === 'lyrics' ? 'chords' : 'lyrics')}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 py-0.5 font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                >
                  <GuitarIcon s={9} /> {tab === 'lyrics' ? 'Akordai' : 'Tekstas'}
                </button>
              )}
            </div>
            {hasLyrics ? (
              tab === 'lyrics' ? (
                <LyricsWithReactions trackId={track.id} lyrics={track.lyrics ?? ''} compact />
              ) : (
                <pre style={{ fontFamily: "'DM Mono','Fira Mono',monospace", fontSize: 13, lineHeight: 1.9, color: 'var(--lyric-text)', margin: 0, whiteSpace: 'pre-wrap' }}>
                  {(track.chords ?? '').split('\n').map((line, i) => {
                    const isChord = /^[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?(\s+[A-G][#bm]?(maj|min|aug|dim|sus|add|M)?[0-9]?)*\s*$/.test(line)
                    if (isChord) return (
                      <div key={i} style={{ marginBottom: 2 }}>
                        {line.split(/(\s+)/).map((tok, j) => tok.trim()
                          ? <span key={j} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 5, background: 'var(--chord-bg)', color: 'var(--chord-text)', fontWeight: 700, marginRight: 4, fontSize: 12 }}>{tok}</span>
                          : <span key={j}>{tok}</span>)}
                      </div>
                    )
                    return <div key={i}>{line || ' '}</div>
                  })}
                </pre>
              )
            ) : lyricsSubmitted ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-8 text-center">
                <div className="text-[13px] font-extrabold text-[var(--text-primary)]">Ačiū! Tekstas išsiųstas peržiūrai.</div>
                <div className="mt-1 text-[12px] text-[var(--text-muted)]">Administratoriui patvirtinus, jis atsiras čia.</div>
              </div>
            ) : isLoggedIn ? (
              <div>
                <p className="mb-2 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
                  Šios dainos teksto dar nėra. Žinai jį? Pasiūlyk — administratorius peržiūrės ir paskelbs.
                </p>
                <textarea
                  value={lyricsDraft}
                  onChange={e => setLyricsDraft(e.target.value)}
                  rows={6}
                  placeholder="Įrašyk dainos tekstą…"
                  className="w-full resize-y rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] leading-[1.6] text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)]"
                />
                {lyricsErr && <div className="mt-1 text-[11px] font-semibold text-red-500">{lyricsErr}</div>}
                <button
                  type="button"
                  onClick={submitLyrics}
                  disabled={lyricsSubmitting}
                  className="mt-2 rounded-xl bg-[var(--accent-orange)] px-4 py-2 font-['Outfit',sans-serif] text-[12px] font-extrabold text-white disabled:opacity-50"
                >
                  {lyricsSubmitting ? 'Siunčiama…' : 'Pasiūlyti tekstą'}
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-8 text-center">
                <div className="text-[13px] font-extrabold text-[var(--text-primary)]">Šios dainos teksto dar nėra</div>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">Prisijunk, kad galėtum pasiūlyti tekstą.</p>
                <Link href="/auth/signin" className="mt-3 inline-block rounded-xl bg-[var(--accent-orange)] px-4 py-2 font-['Outfit',sans-serif] text-[12px] font-extrabold text-white no-underline">Prisijungti</Link>
              </div>
            )}
          </div>

          {/* Comments */}
          <div ref={commentsColRef} className={[
            'min-h-0 px-5 py-5',
            mobileTab === 'comments' ? 'block' : 'hidden',
          ].join(' ')}>
            <EntityCommentsBlock
              entityType="track"
              entityId={track.id}
              compact
              title={commentTotal > 0 ? `Komentarai (${commentTotal})` : 'Komentarai'}
              onCountChange={setCommentTotal}
            />
          </div>
          </div>
        </div>

      </div>

      {/* Likers modal — universal'us pop-over visiems entity types */}
      {likersModalEntity && (
        <div
          onClick={() => setLikersModalEntity(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', borderRadius: 16, maxWidth: 520, width: '100%', maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--border-default)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 800 }}>
                Patiko {likersModalEntity.label}
                {likersModalUsers && <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 11 }}>({likersModalUsers.length})</span>}
              </div>
              <button onClick={() => setLikersModalEntity(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '12px 18px' }}>
              {likersModalUsers === null ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Kraunama…</div>
              ) : likersModalUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Nėra žinomų užliejusių (likers nebuvo importuoti)</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {likersModalUsers.map(u => (
                    <div key={u.user_username} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8, background: 'var(--card-hover-bg)' }}>
                      {u.user_avatar_url ? (
                        <img src={proxyImg(u.user_avatar_url)} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'rgba(99,102,241,.18)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, fontFamily: 'Outfit,sans-serif' }}>{u.user_username.charAt(0).toUpperCase()}</div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.user_username}</div>
                        {u.user_rank && <div style={{ fontSize: 10, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.user_rank}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media(max-width:860px){.tr-desk{display:none!important}.tr-mob{display:flex!important}}
        ::selection{background:rgba(249,115,22,.25)}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(4px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      `}</style>
    </div>
  )
}
