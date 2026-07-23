'use client'
// /v2 mobile reels reader — v1 pilno ekrano „stories/reels" skaitytuvo VERBATIM
// portas (iš app/HomeClient.tsx). Horizontalus braukimas tarp istorijų,
// vertikalus scroll'as tekstui skaityti, čartų / dienos dainos balsavimo
// bottom-sheet'ai. Logika NEPERRAŠYTA — perkelta 1:1, pakeisti tik import'ai.
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { proxyImgResized } from '@/lib/img-proxy'
import { sanitizeRichHtml } from '@/lib/sanitize-html'
import { deviceFpSync } from '@/lib/device-fp'
import { DienosDainaHero } from '@/components/DienosDainaHero'
import { DienosDainaSection } from '@/components/DienosDainaSection'
import { LikePill } from '@/components/LikePill'
import LikesModal, { type LikeUser } from '@/components/LikesModal'
import SocialEmbed from '@/components/SocialEmbed'
import { detectPlatform } from '@/lib/social-embed'
import type { HeroSlide, TopEntry } from '../HeroSlider'

/** Vieningas „patinka" elementas — TAS PATS kaip atlikėjo psl. (LikePill):
 *  širdelė (toggle) + count zona (atidaro „kam patinka" modalą su vartotojų
 *  sąrašu). Naudojam ir dainoms (entity_type='track') ir atlikėjams
 *  (entity_type='artist') — vienodas komponentas visur, be atskirų stilių. */
function EntityLikePill({
  entityType, entityId, subjectName, subjectPhoto, size = 'sm', variant = 'surface',
}: {
  entityType: 'track' | 'artist' | 'news'; entityId: number
  subjectName?: string; subjectPhoto?: string | null
  size?: 'sm' | 'md'; variant?: 'light' | 'surface'
}) {
  const { data: session } = useSession()
  const authed = !!session?.user
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState(0)
  const [pending, setPending] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [users, setUsers] = useState<LikeUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const base = entityType === 'track' ? `/api/tracks/${entityId}/like`
    : entityType === 'artist' ? `/api/artists/${entityId}/like`
    : `/api/news/${entityId}/like`
  useEffect(() => {
    let on = true
    fetch(base, { cache: 'no-store' }).then(r => r.json()).then(d => { if (!on) return; if (typeof d.count === 'number') setCount(d.count); if (typeof d.liked === 'boolean') setLiked(d.liked) }).catch(() => {})
    return () => { on = false }
  }, [base, session?.user])
  const toggle = async () => {
    if (!authed || pending) return
    setPending(true); const prev = liked; setLiked(!prev); setCount(c => prev ? Math.max(0, c - 1) : c + 1)
    try { const r = await fetch(base, { method: 'POST' }); const d = await r.json(); if (typeof d.liked === 'boolean') setLiked(d.liked); if (typeof d.count === 'number') setCount(d.count) } catch { setLiked(prev) } finally { setPending(false) }
  }
  const openModal = () => {
    setModalOpen(true); setLoadingUsers(true)
    fetch(`/api/likes/${entityType}/${entityId}`, { cache: 'no-store' }).then(r => r.json()).then(d => { setUsers(Array.isArray(d?.users) ? d.users : []) }).catch(() => setUsers([])).finally(() => setLoadingUsers(false))
  }
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <LikePill likes={count} selfLiked={liked} onToggle={toggle} onOpenModal={openModal} pending={pending} variant={variant} size={size} />
      <LikesModal open={modalOpen} onClose={() => setModalOpen(false)} title="" count={count} users={users} loading={loadingUsers} subjectName={subjectName} subjectPhoto={subjectPhoto || null} selfLiked={liked} authed={authed} onToggleSelfLike={toggle} selfLikePending={pending} />
    </span>
  )
}

/* ────────────────────────────── Helpers (v1 verbatim) ────────────────────────────── */
function sanitizeTitle(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]{11})/)
  return m?.[1] || null
}

/* ════════════════════════════════════════════════════════════════════
                         REELS OVERLAY COMPONENT
   ════════════════════════════════════════════════════════════════════ */

const REELS_DURATION = 13000
/* Auto-advance trukmė pagal slide tipą: ilgas skaitomas turinys gauna daugiau,
 * trumpos vizualinės kortelės — mažiau. Interaktyvios (chart/daily) auto
 * neturi iš viso (žr. `interactive`). */
function slideDuration(s: HeroSlide): number {
  if (s.type === 'news' || s.type === 'blog') return 18000
  if (s.type === 'daily_winner' || s.type === 'event' || s.type === 'verta' || s.type === 'discovery' || s.type === 'recording' || s.type === 'promo' || s.type === 'custom') return 9000
  return REELS_DURATION
}
/* Unikalus slide raktas „peržiūrėta" žymėjimui. Anksčiau buvo vien href —
 * `daily` ir `daily_winner` abu turi /dienos-daina, tad peržiūrėjus vieną
 * pasižymėdavo abu. */
export const slideKey = (s: HeroSlide) => `${s.type}::${s.href}`

/** Pilno news straipsnio body cache — modulio lygyje, kad keičiant slide'us
 *  nereiktų perkrauti to paties straipsnio iš naujo. */
const newsBodyCache = new Map<number, string>()
const newsEmbedCache = new Map<number, { videoId: string; title: string | null }[]>()
const newsSocialCache = new Map<number, { url: string; caption?: string | null }[]>()
const newsGalleryCache = new Map<number, { url: string; caption?: string | null }[]>()
const blogPostCache = new Map<string, any>()

/** Legacy blog turinio valymas reader'iui: nukerpa scraper'io „mėgstamų" lentelės
 *  šlamštą gale, pašalina klaidingus </img>, santykinius music.lt kelius → absoliučius. */
function cleanBlogHtml(html?: string | null): string {
  let s = String(html || '')
  s = s.replace(/<table[\s\S]*$/i, '')                 // legacy favorite_a lentelė + šlamštas gale
  s = s.replace(/<\/img>/gi, '')                         // klaidingi uždarymo tag'ai
  s = s.replace(/(src|href)="(?!https?:|\/\/|\/|#|data:|mailto:|javascript:)/gi, '$1="https://www.music.lt/')
  return s.trim()
}

/** Pozicijos pokyčio ženkliukas topo eilutėje: ▲n pakilo / ▼n nukrito / = ta
 *  pati vieta / N — naujokas. Duomenys iš /api/top/entries (prev_position, is_new). */
function TrendBadge({ prev, pos, isNew }: { prev?: number | null; pos: number; isNew?: boolean }) {
  if (isNew) return <i className="rdr-trend new">N</i>
  if (typeof prev !== 'number' || prev === pos) return <i className="rdr-trend same">=</i>
  return prev > pos
    ? <i className="rdr-trend up">▲{prev - pos}</i>
    : <i className="rdr-trend down">▼{pos - prev}</i>
}

/** Inline topas reader'yje — visas sąrašas, balsavimas KAIP regular topo psl.
 *  („+" mygtukas, daug kartų iki 10/daina, votes_per_track), grojimas per
 *  „Muzika" embed sekciją žemiau (onPlay). */
function ChartVoteList({ topType, accent, onPlay }: { topType: 'lt_top30' | 'top40'; accent: string; onPlay: (videoId: string, meta?: { title?: string | null; artist?: string | null; cover?: string | null }) => void }) {
  const WEEKLY = 10
  const [entries, setEntries] = useState<any[]>([])
  const [weekId, setWeekId] = useState<number | null>(null)
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let c = false
    setLoading(true)
    fetch(`/api/top/entries?type=${topType}`)
      .then(r => r.json())
      .then(d => {
        if (c) return
        setWeekId(d.week?.id ?? null)
        setEntries((d.entries || []).map((e: any, i: number) => ({
          pos: e.position ?? (i + 1),
          track_id: e.track_id,
          title: sanitizeTitle(e.tracks?.title || ''),
          artist: e.tracks?.artists?.name || '',
          cover: e.tracks?.cover_url || e.tracks?.artists?.cover_image_url || null,
          videoId: extractYouTubeId(e.tracks?.video_url || null),
          prev: typeof e.prev_position === 'number' ? e.prev_position : null,
          isNew: !!e.is_new,
        })))
        if (d.week?.id) fetch(`/api/top/vote?week_id=${d.week.id}`).then(r => r.json()).then(v => { if (!c) setCounts(v.votes_per_track || {}) }).catch(() => {})
      })
      .catch(() => {})
      .finally(() => { if (!c) setLoading(false) })
    return () => { c = true }
  }, [topType])

  const vote = async (track_id: number) => {
    if (!weekId || busy) return
    if ((counts[track_id] || 0) >= WEEKLY) return
    setBusy(true)
    setCounts(p => ({ ...p, [track_id]: (p[track_id] || 0) + 1 }))
    try {
      const r = await fetch('/api/top/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track_id, week_id: weekId, vote_type: 'like', fingerprint: deviceFpSync() }) })
      if (r.status === 401) { setCounts(p => ({ ...p, [track_id]: Math.max(0, (p[track_id] || 0) - 1) })); window.location.href = '/auth/signin'; return }
      if (!r.ok) setCounts(p => ({ ...p, [track_id]: Math.max(0, (p[track_id] || 0) - 1) }))
    } catch { setCounts(p => ({ ...p, [track_id]: Math.max(0, (p[track_id] || 0) - 1) })) } finally { setBusy(false) }
  }

  if (loading) return <div className="rdr-load"><span /><span /><span /></div>
  return (
    <div className="rdr-cvl">
      <div className="rdr-cvl-head">Balsuok už mėgstamas</div>
      {entries.map(e => {
        const n = counts[e.track_id] || 0
        const maxed = n >= WEEKLY
        return (
          <div key={e.track_id} className="rdr-chart-row">
            <span className="rdr-chart-pos">{e.pos}<TrendBadge prev={e.prev} pos={e.pos} isNew={e.isNew} /></span>
            <button className="rdr-cvl-cover" onClick={() => e.videoId && onPlay(e.videoId, { title: e.title, artist: e.artist, cover: e.cover })} disabled={!e.videoId} aria-label="Groti">
              {e.cover ? <img src={proxyImgResized(e.cover, 96)} alt="" loading="lazy" decoding="async" /> : <span className="rdr-chart-ph" />}
              {e.videoId && <span className="rdr-cvl-play"><svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span>}
            </button>
            <span className="rdr-chart-info"><b>{e.title}</b><i>{e.artist}</i></span>
            <button className={`rdr-cvl-vote${n > 0 ? ' voted' : ''}`} disabled={maxed} onClick={() => vote(e.track_id)}
              aria-label="Balsuoti" title={maxed ? 'Pasiektas maks. balsų' : 'Spausk tiek kartų, kiek nori'}>
              {n > 0
                ? <span className="rdr-cvl-mine">{n}</span>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Šiandienos dienos dainos kandidatai — balsavimas (1×/daina) + popbar
 *  (lyderis VISADA max) + siūlymas. Grojimas per „Muzika" embed sekciją žemiau. */
function DailyCandidates({ onPlay }: { onPlay: (videoId: string, meta?: { title?: string | null; artist?: string | null; cover?: string | null }) => void }) {
  const [noms, setNoms] = useState<any[]>([])
  const [voted, setVoted] = useState<Set<number>>(new Set())
  const [voting, setVoting] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let on = true
    fetch('/api/dienos-daina/nominations').then(r => r.json()).then(d => { if (on) { setNoms(d.nominations || []); setLoading(false) } }).catch(() => { if (on) setLoading(false) })
    fetch('/api/dienos-daina/votes').then(r => r.json()).then(d => { if (on) setVoted(new Set<number>(d.voted_nomination_ids || [])) }).catch(() => {})
    return () => { on = false }
  }, [])

  const vote = async (id: number) => {
    if (voted.has(id) || voting !== null) return
    setVoting(id)
    setVoted(p => { const n = new Set(p); n.add(id); return n })
    setNoms(p => p.map(n => n.id === id ? { ...n, votes: (n.votes || 0) + 1, weighted_votes: (n.weighted_votes || 0) + 1 } : n))
    try {
      const r = await fetch('/api/dienos-daina/votes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nomination_id: id, fingerprint: deviceFpSync() }) })
      if (r.status === 401) { window.location.href = '/auth/signin'; return }
    } catch {} finally { setVoting(null) }
  }

  if (loading) return <div className="rdr-load"><span /><span /><span /></div>
  const sorted = [...noms].filter(n => n.tracks).sort((a, b) => (b.weighted_votes || b.votes || 0) - (a.weighted_votes || a.votes || 0))
  if (!sorted.length) return null
  const maxV = Math.max(1, ...sorted.map(n => n.weighted_votes || n.votes || 0))
  const imgOf = (t: any) => { const v = extractYouTubeId(t?.video_url || null); return t?.cover_url || (v ? `https://img.youtube.com/vi/${v}/hqdefault.jpg` : null) || t?.artists?.cover_image_url || null }
  return (
    <div className="rdr-dc">
      {sorted.map((n, idx) => {
        const t = n.tracks
        const vid = extractYouTubeId(t?.video_url || null)
        const did = voted.has(n.id)
        const lvl = idx === 0 ? 5 : Math.max(1, Math.round(((n.weighted_votes || n.votes || 0) / maxV) * 5))
        const img = imgOf(t)
        return (
          <div key={n.id} className={`rdr-dc-row${idx === 0 ? ' lead' : ''}`}>
            <span className="rdr-dc-rank">{idx + 1}</span>
            <button className="rdr-cvl-cover" onClick={() => vid && onPlay(vid, { title: sanitizeTitle(t.title || ''), artist: t.artists?.name || null, cover: img })} disabled={!vid} aria-label="Groti">
              {img ? <img src={proxyImgResized(img, 96)} alt="" loading="lazy" decoding="async" /> : <span className="rdr-chart-ph" />}
              {vid && <span className="rdr-cvl-play"><svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span>}
            </button>
            <div className="rdr-dc-info">
              <b>{sanitizeTitle(t.title || '')}</b>
              <i>{t.artists?.name || ''}</i>
              <span className="rdr-dc-bar">{Array.from({ length: 5 }).map((_, i) => <span key={i} className={i < lvl ? 'on' : ''} />)}</span>
            </div>
            <button className={`rdr-dc-vote${did ? ' on' : ''}`} disabled={did || voting === n.id} onClick={() => vote(n.id)} aria-label="Balsuoti">
              {did
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Viršutinis koliažas (mosaic) — čartams ir dienos dainai vietoj vieno grainy
 *  YouTube thumbnail'o. Tas pats vizualinis modelis kaip hero kortelės (didelis
 *  #1/laimėtojas + mažesni), tik horizontalus (reader'is vertikalus). Aukštos
 *  kokybės cover'iai (ne YT thumb) → nuoseklu su news/blog/event posteriais. */
function RdrMosaic({ items, accent }: { items: { cover: string; badge?: number | null; winner?: boolean }[]; accent: string }) {
  const big = items[0]
  const rest = items.slice(1, 5)
  const Tile = ({ it, big: isBig }: { it?: { cover: string; badge?: number | null; winner?: boolean }; big?: boolean }) => {
    if (!it) return <span className="rdr-mos-cell rdr-mos-ph" />
    return (
      <span className="rdr-mos-cell" style={it.winner ? { outline: `2px solid ${accent}`, outlineOffset: -2 } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={proxyImgResized(it.cover, isBig ? 480 : 320)} alt="" loading="lazy" decoding="async" />
        {it.badge != null && <span className="rdr-mos-badge" style={{ background: it.badge === 1 ? accent : 'rgba(0,0,0,0.78)' }}>{it.badge}</span>}
        {it.winner && <span className="rdr-mos-badge" style={{ background: accent }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM5 9a2 2 0 0 1-2-2V5h4M19 9a2 2 0 0 0 2-2V5h-4" /></svg>
        </span>}
      </span>
    )
  }
  return (
    <div className="rdr-mosaic">
      <div className="rdr-mos-big"><Tile it={big} big /></div>
      <div className="rdr-mos-side"><Tile it={rest[0]} /></div>
      <div className="rdr-mos-bottom">
        <Tile it={rest[1]} /><Tile it={rest[2]} /><Tile it={rest[3]} />
      </div>
    </div>
  )
}

// YouTube IFrame Player API — įkeliam vieną kartą. Reikalinga iOS play'inimui:
// playVideo() paspaudimo gesture'e ant JAU paruošto player'io (autoplay=1 URL'e
// iOS neveikia — rodo YT native ir reikia antro paspaudimo).
let ytApiPromise: Promise<any> | null = null
function loadYT(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  const w = window as any
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); resolve(w.YT) }
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script'); s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s)
    }
    const iv = setInterval(() => { if (w.YT && w.YT.Player) { clearInterval(iv); resolve(w.YT) } }, 150)
  })
  return ytApiPromise
}
function trackSlugify(s: string): string {
  return (s || '').toLowerCase()
    .replace(/[ąä]/g, 'a').replace(/[čç]/g, 'c').replace(/[ęè]/g, 'e').replace(/[ėé]/g, 'e')
    .replace(/[į]/g, 'i').replace(/[š]/g, 's').replace(/[ų]/g, 'u').replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'daina'
}

/** Native „susijusios muzikos" grotuvas — cover + oranžinis play mygtukas apatiniam
 *  dešiniam kampe (kaip atlikėjo psl.), oranžinis borderis (kaip „Vakar laimėjo").
 *  Play → skaičiuojam INTERNAL paleidimą (/api/tracks/[id]/play) + playVideo() per
 *  YT IFrame API (kad iOS paleistų iškart). Pavadinimas — nuoroda į dainos psl. */
function SongPlayer({ song, onNavLink }: { song: { videoId: string; title: string; artist?: string | null; songId?: number | null }; onNavLink: () => void }) {
  const holderRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const playingRef = useRef(false)
  const [started, setStarted] = useState(false)
  // Player PRE-CREATE (cued, autoplay=0) — kaip atlikėjo psl.: paruošiam iš anksto,
  // o grojam per playVideo() gesture'e. host=youtube-nocookie (Safari ITP blokuoja
  // youtube.com cookie → klaida 153; nocookie veikia). Jei user'is paspaudė dar
  // player'iui kuriantis — onReady paleidžia.
  useEffect(() => {
    let dead = false
    loadYT().then((YT) => {
      if (dead || !holderRef.current || playerRef.current) return
      const inner = document.createElement('div')
      inner.style.width = '100%'; inner.style.height = '100%'
      holderRef.current.innerHTML = ''
      holderRef.current.appendChild(inner)
      playerRef.current = new YT.Player(inner, {
        host: 'https://www.youtube-nocookie.com',
        videoId: song.videoId,
        width: '100%', height: '100%',
        playerVars: { autoplay: 0, controls: 1, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, enablejsapi: 1, origin: typeof window !== 'undefined' ? window.location.origin : undefined },
        events: { onReady: (e: any) => { if (playingRef.current) { try { e.target.playVideo() } catch { /* ignore */ } } } },
      })
    }).catch(() => {})
    return () => { dead = true; try { playerRef.current?.destroy?.() } catch { /* ignore */ } playerRef.current = null }
  }, [song.videoId])
  const play = () => {
    if (started) return
    playingRef.current = true
    if (song.songId) fetch(`/api/tracks/${song.songId}/play`, { method: 'POST', keepalive: true }).catch(() => {})
    try { playerRef.current?.playVideo?.() } catch { /* ignore */ }
    setStarted(true)
  }
  const cover = `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg`
  const href = song.songId ? `/dainos/${trackSlugify([song.artist, song.title].filter(Boolean).join('-'))}-${song.songId}` : null
  return (
    <div className="rdr-song">
      <div className="rdr-song-video">
        <div className={`rdr-song-ytwrap${started ? ' on' : ''}`}><div ref={holderRef} /></div>
        {!started && (
          <button type="button" className="rdr-song-poster" onClick={play} style={{ backgroundImage: `url(${cover})` }} aria-label={`Groti: ${song.title}`}>
            <span className="rdr-song-play"><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M8 5v14l11-7z" /></svg></span>
          </button>
        )}
      </div>
      <div className="rdr-song-bar">
        <span className="rdr-song-info">
          {href
            ? <Link href={href} onClick={onNavLink} className="rdr-song-title"><b>{song.title}</b></Link>
            : <b>{song.title}</b>}
          {song.artist ? <i>{song.artist}</i> : null}
        </span>
        {song.songId ? <EntityLikePill entityType="track" entityId={song.songId} subjectName={song.title} subjectPhoto={cover} /> : null}
      </div>
    </div>
  )
}

type PlSong = { videoId: string; title: string; artist?: string | null; songId?: number | null }

/** „Susijusi muzika" kai jos daug (albumas/grupė) — VIENAS grotuvas + dainų
 *  sąrašas. YouTube-blokuotos (Vevo „unavailable", klaidos 101/150/153) dainos
 *  praleidžiamos: preflight per /api/yt/embeddable + onError → paslepiam iš
 *  sąrašo ir šokam į kitą veikiančią. iOS play — nocookie + playVideo() gesture. */
function SongPlaylist({ songs, onNavLink }: { songs: PlSong[]; onNavLink: () => void }) {
  const holderRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const playingRef = useRef(false)
  const curVidRef = useRef<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [started, setStarted] = useState(false)
  const [blocked, setBlocked] = useState<Set<string>>(new Set())
  const cur = songs[idx]
  const idxRef = useRef(0)
  useEffect(() => { idxRef.current = idx }, [idx])

  // Embeddable preflight aktyviai dainai — jei blokuota, pažymim.
  useEffect(() => {
    if (!cur?.videoId || blocked.has(cur.videoId)) return
    let cancelled = false
    fetch(`/api/yt/embeddable?videoId=${encodeURIComponent(cur.videoId)}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d && d.embeddable === false) setBlocked(s => { const n = new Set(s); n.add(cur.videoId); return n }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [cur?.videoId]) // eslint-disable-line

  // Aktyvi daina blokuota → šokam į kitą neblokuotą (skip).
  useEffect(() => {
    if (!cur || !blocked.has(cur.videoId)) return
    const nextI = songs.findIndex((s, i) => i > idx && !blocked.has(s.videoId))
    const anyI = nextI >= 0 ? nextI : songs.findIndex(s => !blocked.has(s.videoId))
    if (anyI >= 0 && anyI !== idx) setIdx(anyI)
  }, [blocked, idx]) // eslint-disable-line

  // YT player — sukuriam kartą; track switch'ai per loadVideoById.
  useEffect(() => {
    let dead = false
    loadYT().then((YT) => {
      // Naudojam idxRef (ne stale `cur` iš mount closure) — jei pirma daina
      // blokuota ir idx pašoko kol kraunasi YT API, sukuriam su TIKRU aktyviu.
      const startSong = songs[idxRef.current]
      if (dead || !holderRef.current || playerRef.current || !startSong?.videoId) return
      const inner = document.createElement('div')
      inner.style.width = '100%'; inner.style.height = '100%'
      holderRef.current.innerHTML = ''
      holderRef.current.appendChild(inner)
      playerRef.current = new YT.Player(inner, {
        host: 'https://www.youtube-nocookie.com',
        videoId: startSong.videoId,
        width: '100%', height: '100%',
        playerVars: { autoplay: 0, controls: 1, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, enablejsapi: 1, origin: typeof window !== 'undefined' ? window.location.origin : undefined },
        events: {
          onReady: (e: any) => { if (playingRef.current) { try { e.target.playVideo() } catch { /* ignore */ } } },
          onError: (e: any) => {
            const c = e?.data
            if (c === 101 || c === 150 || c === 153) {
              const v = curVidRef.current
              if (v) setBlocked(s => { const n = new Set(s); n.add(v); return n })
            }
          },
        },
      })
      curVidRef.current = startSong.videoId
    }).catch(() => {})
    return () => { dead = true; try { playerRef.current?.destroy?.() } catch { /* ignore */ } playerRef.current = null }
  }, []) // eslint-disable-line

  // idx pasikeitė → įkeliam naują video į esamą player'į.
  useEffect(() => {
    const p = playerRef.current
    if (!p || !cur?.videoId || curVidRef.current === cur.videoId) return
    try {
      if (playingRef.current) p.loadVideoById?.(cur.videoId)
      else p.cueVideoById?.(cur.videoId)
      curVidRef.current = cur.videoId
    } catch { /* ignore */ }
  }, [idx, cur?.videoId])

  const play = (i: number) => {
    const s = songs[i]; if (!s) return
    playingRef.current = true
    setIdx(i); setStarted(true)
    if (s.songId) fetch(`/api/tracks/${s.songId}/play`, { method: 'POST', keepalive: true }).catch(() => {})
    const p = playerRef.current
    try {
      if (p) {
        if (curVidRef.current !== s.videoId) { p.loadVideoById?.(s.videoId); curVidRef.current = s.videoId }
        else p.playVideo?.()
      }
    } catch { /* ignore */ }
  }

  const trackHref = (s?: PlSong) => s?.songId ? `/dainos/${trackSlugify([s.artist, s.title].filter(Boolean).join('-'))}-${s.songId}` : null
  const visible = songs.filter(s => !blocked.has(s.videoId))
  if (!visible.length) return null
  const cover = cur ? `https://i.ytimg.com/vi/${cur.videoId}/hqdefault.jpg` : ''

  return (
    <div className="rdr-song rdr-plist" onClick={(e) => e.stopPropagation()}>
      <div className="rdr-song-video">
        <div className={`rdr-song-ytwrap${started ? ' on' : ''}`}><div ref={holderRef} /></div>
        {!started && (
          <button type="button" className="rdr-song-poster" onClick={() => play(idx)} style={{ backgroundImage: `url(${cover})` }} aria-label={`Groti: ${cur?.title}`}>
            <span className="rdr-song-play"><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M8 5v14l11-7z" /></svg></span>
          </button>
        )}
      </div>
      <div className="rdr-song-bar">
        <span className="rdr-song-info">
          {trackHref(cur)
            ? <Link href={trackHref(cur)!} onClick={onNavLink} className="rdr-song-title"><b>{cur?.title}</b></Link>
            : <b>{cur?.title}</b>}
          {cur?.artist ? <i>{cur.artist}</i> : null}
        </span>
        {cur?.songId ? <EntityLikePill key={cur.songId} entityType="track" entityId={cur.songId} subjectName={cur.title} subjectPhoto={cover} /> : null}
      </div>
      <div className="rdr-plist-list">
        {visible.map((s, vi) => {
          const realI = songs.indexOf(s)
          const on = realI === idx
          return (
            <button key={`${s.videoId}-${realI}`} type="button" className={`rdr-plist-row${on ? ' on' : ''}`} onClick={() => play(realI)}>
              <span className="rdr-plist-num">{vi + 1}</span>
              <span className="rdr-plist-tx"><b>{s.title}</b>{s.artist ? <i>{s.artist}</i> : null}</span>
              <span className="rdr-plist-play">
                {on && started
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
                  : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Naujienos nuotraukų galerija reader'yje — grid + fullscreen lightbox su
 *  prev/next. Viena nuotrauka → didesnė; kelios → 2 stulpelių grid'as. */
// Kreditas iš URL (weserv/proxy nerodo šaltinio) — Wikimedia/YouTube/hostname.
function photoCredit(url: string): string {
  try {
    const h = new URL(url).hostname
    if (/wikimedia|wikipedia/.test(h)) return 'Wikimedia Commons'
    if (/ytimg|youtube/.test(h)) return 'YouTube'
    if (/fbcdn|cdninstagram/.test(h)) return 'Instagram'
    return h.replace(/^www\./, '')
  } catch { return '' }
}
// weserv proxy 404'ina URL'us su encoded special chars (pvz. %2C kablelis) →
// onError fallback į RAW URL (kaip news psl. galerija, kuri naudoja raw).
function imgFallbackRaw(raw: string) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget
    if (el.dataset.fb) return
    el.dataset.fb = '1'
    el.src = raw
  }
}

function RdrGallery({ photos }: { photos: { url: string; caption?: string | null }[] }) {
  const [lb, setLb] = useState<number | null>(null)
  useEffect(() => {
    if (lb === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLb(null)
      else if (e.key === 'ArrowRight') setLb(i => (i === null ? i : (i + 1) % photos.length))
      else if (e.key === 'ArrowLeft') setLb(i => (i === null ? i : (i - 1 + photos.length) % photos.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lb, photos.length])
  const cur = lb !== null ? photos[lb] : null
  const MAX = 4
  const shown = photos.slice(0, MAX)
  const extra = photos.length - MAX
  return (
    // Thumbnail juostelė — dedama ant hero nuotraukos apačioje (overlay). Mygtukai
    // (ne swipe) → tap atidaro fullscreen lightbox'ą. ignoreGesture (closest button)
    // apsaugo, kad braukimas nuo thumbnail'o nekeistų naujienos.
    <div className="rdr-gal-strip" onClick={(e) => e.stopPropagation()}>
      {shown.map((p, i) => (
        <button key={i} type="button" className="rdr-gal-thumb" onClick={() => setLb(i)} aria-label="Peržiūrėti nuotraukas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyImgResized(p.url, 240)} alt={p.caption || ''} loading="lazy" decoding="async" onError={imgFallbackRaw(p.url)} />
          {i === MAX - 1 && extra > 0 && <span className="rdr-gal-more">+{extra}</span>}
        </button>
      ))}
      {cur !== null && lb !== null && createPortal(
        <div className="rdr-gal-lb" onClick={() => setLb(null)}>
          <button type="button" className="rdr-gal-x" onClick={(e) => { e.stopPropagation(); setLb(null) }} aria-label="Uždaryti">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          {photos.length > 1 && (
            <button type="button" className="rdr-gal-nav prev" onClick={(e) => { e.stopPropagation(); setLb((lb - 1 + photos.length) % photos.length) }} aria-label="Ankstesnė">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rdr-gal-lb-img" src={proxyImgResized(cur.url, 1600)} alt={cur.caption || ''} onClick={(e) => e.stopPropagation()} decoding="async" onError={imgFallbackRaw(cur.url)} />
          {photos.length > 1 && (
            <button type="button" className="rdr-gal-nav next" onClick={(e) => { e.stopPropagation(); setLb((lb + 1) % photos.length) }} aria-label="Kita">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          )}
          {(cur.caption || photoCredit(cur.url)) && (
            <p className="rdr-gal-cap">
              {cur.caption ? <span>{cur.caption}</span> : null}
              {photoCredit(cur.url) ? <span className="rdr-gal-credit">{cur.caption ? ' · ' : ''}{photoCredit(cur.url)}</span> : null}
            </p>
          )}
          {photos.length > 1 && <span className="rdr-gal-count">{lb + 1} / {photos.length}</span>}
        </div>,
        document.body,
      )}
    </div>
  )
}

/** Viena istorija reader'yje. Pati valdo savo VERTIKALŲ scroll'ą (pauzina
 *  auto-advance kai nuscrollinta žemyn — „skaitymo režimas"), news pilno body
 *  lazy-fetch'ą, ♥ ir apatinę veiksmų juostą. Muzika — STANDARTINIAI YouTube
 *  embed'ai „Muzika" sekcijoje po tekstu (jokio custom grotuvo). */
function ReaderSlide({ slide, active, seen, dk, scrollTopSignal, onScrolledChange, onPlayingChange, onClose, onChartVote, onDailyVote, onNavLink }: {
  slide: HeroSlide
  active: boolean
  seen: boolean
  dk: boolean
  scrollTopSignal: number
  onScrolledChange: (scrolled: boolean) => void
  onPlayingChange: (playing: boolean) => void
  onClose: () => void
  onChartVote?: (slide: HeroSlide) => void
  onDailyVote?: (slide: HeroSlide) => void
  onNavLink: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const embedsRef = useRef<HTMLDivElement>(null)
  // Vienintelis grojimo state'as: iš topo/kandidatų eilutės paprašytas video —
  // jo embed'as „Muzika" sekcijoje perkraunamas su autoplay=1.
  const [reqVideoId, setReqVideoId] = useState<string | null>(null)
  const [body, setBody] = useState<string | null>(
    slide.body || (slide.newsId ? newsBodyCache.get(slide.newsId) || null : null)
  )
  const [bodyLoading, setBodyLoading] = useState(false)
  // News video: dažnai NE `songs`, o `embeds` lauke (pvz. Chelsea Wolfe) — jį
  // ištraukiam iš /api/news/[id] atsakymo ir rodom „Muzika" sekcijoj.
  const [socialEmbeds, setSocialEmbeds] = useState<{ url: string; caption?: string | null }[]>(
    () => (slide.newsId ? newsSocialCache.get(slide.newsId) || [] : [])
  )
  const [gallery, setGallery] = useState<{ url: string; caption?: string | null }[]>(
    () => (slide.newsId ? newsGalleryCache.get(slide.newsId) || [] : [])
  )
  const [extraEmbeds, setExtraEmbeds] = useState<{ videoId: string; title: string | null }[]>(
    () => (slide.newsId ? newsEmbedCache.get(slide.newsId) || [] : [])
  )
  const [blogTopas, setBlogTopas] = useState<any[] | null>(null)
  const [blogIntro, setBlogIntro] = useState<string | null>(null)
  const [blogOutro, setBlogOutro] = useState<string | null>(null)

  const isChart = slide.type === 'chart_lt' || slide.type === 'chart_world'
  const isDaily = slide.type === 'daily'
  const isDailyWinner = slide.type === 'daily_winner'
  const isNews = slide.type === 'news'
  const isRecording = slide.type === 'recording'
  const isBlog = slide.type === 'blog'

  /* Neaktyvi kortelė — grįžtam į viršų ir nuimam autoplay užklausą. Embed'ai
   * mount'inami tik aktyvioj kortelėj (žr. „Muzika" sekciją), tad sunkūs
   * iframe'ai patys išsivalo keičiant istoriją. */
  useEffect(() => {
    if (!active) {
      setReqVideoId(null)
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    }
  }, [active])

  /* „Į viršų" rodyklė (reels) — tėvas didina signalą, aktyvi kortelė nuslenka į
   *  viršų ir auto-slide vėl pradeda eiti (scrolled → false). */
  useEffect(() => {
    if (active && scrollTopSignal > 0) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [scrollTopSignal]) // eslint-disable-line

  /* Pilno news body + embed'ų (YouTube) lazy-fetch. */
  useEffect(() => {
    if (!active || !slide.newsId) return
    if (body && extraEmbeds.length) return // jau turim viską
    setBodyLoading(true)
    fetch(`/api/news/${slide.newsId}`)
      .then(r => r.json())
      .then(d => {
        const html: string = d?.body || d?.news?.body || ''
        if (html) { newsBodyCache.set(slide.newsId!, html); setBody(html) }
        // embeds → „Muzika" (kai news neturi `songs`, bet turi įdėtą YouTube).
        const ems = (Array.isArray(d?.embeds) ? d.embeds : [])
          .filter((e: any) => (e?.type === 'youtube' || /youtu/.test(e?.url || '')))
          .map((e: any) => extractYouTubeId(e?.embedUrl || e?.url || null))
          .filter((v: any): v is string => !!v)
          .slice(0, 3)
          .map((v: string) => ({ videoId: v, title: null }))
        newsEmbedCache.set(slide.newsId!, ems)
        if (ems.length) setExtraEmbeds(ems)
        // Social embed'ai (Instagram / X / TikTok / Facebook) → SocialEmbed
        // komponentas (blockquote + oficialus embed skriptas). Anksčiau reader'yje
        // buvo VISAI nerodomi.
        const socials = (Array.isArray(d?.embeds) ? d.embeds : [])
          .filter((e: any) => { const p = detectPlatform(e?.url || ''); return p === 'instagram' || p === 'x' || p === 'tiktok' || p === 'facebook' })
          .map((e: any) => ({ url: e.url as string, caption: e.title || null }))
          .slice(0, 5)
        newsSocialCache.set(slide.newsId!, socials)
        if (socials.length) setSocialEmbeds(socials)
        // Nuotraukų galerija — iš `gallery` lauko arba image1..5_url (kaip news psl.).
        let gal: { url: string; caption?: string | null }[] = Array.isArray(d?.gallery) && d.gallery.length
          ? d.gallery.filter((g: any) => g?.url).map((g: any) => ({ url: g.url as string, caption: g.caption || null }))
          : []
        if (!gal.length) {
          for (let i = 1; i <= 5; i++) {
            const url = d?.[`image${i}_url`]
            if (url) gal.push({ url, caption: d?.[`image${i}_caption`] || null })
          }
        }
        newsGalleryCache.set(slide.newsId!, gal)
        if (gal.length) setGallery(gal)
      })
      .catch(() => {})
      .finally(() => setBodyLoading(false))
  }, [active, slide.newsId]) // eslint-disable-line

  /* Bendruomenės įrašo (blog) pilno turinio lazy-fetch. Topas → struktūruotas
   *  sąrašas (kaip įrašo psl.), kiti → išvalytas content HTML. */
  useEffect(() => {
    if (!active || !slide.blogId) return
    if (body || blogTopas) return
    const apply = (d: any) => {
      if (d?.post_type === 'topas' && Array.isArray(d.list_items) && d.list_items.length) {
        setBlogTopas(d.list_items)
        setBlogIntro(d.topas_meta?.intro ? cleanBlogHtml(d.topas_meta.intro) : null)
        setBlogOutro(d.topas_meta?.outro ? cleanBlogHtml(d.topas_meta.outro) : null)
      } else if (d?.content) {
        setBody(cleanBlogHtml(d.content))
      }
    }
    const cached = blogPostCache.get(slide.blogId)
    if (cached) { apply(cached); return }
    setBodyLoading(true)
    fetch(`/api/blog/posts/${slide.blogId}`)
      .then(r => r.json())
      .then(d => { if (d && !d.error) { blogPostCache.set(slide.blogId!, d); apply(d) } })
      .catch(() => {})
      .finally(() => setBodyLoading(false))
  }, [active, slide.blogId]) // eslint-disable-line

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const top = el.scrollTop
    onScrolledChange(top > 4)
  }

  /* Grojimas iš topo/kandidatų eilutės (▶) — atitinkamas embed'as „Muzika"
   *  sekcijoje perkraunamas su autoplay=1 ir nuscrollinama iki jo. Jokio custom
   *  grotuvo — standartinis YouTube embed'as (iOS gali dar paprašyti YT tap'o —
   *  sąmoningai priimtina dėl paprastumo). */
  const play = (vid?: string, _meta?: { title?: string | null; artist?: string | null; cover?: string | null }) => {
    const id = vid || slide.videoId
    if (!id) return
    setReqVideoId(id)
    requestAnimationFrame(() => embedsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  // Naujienoms — santykinė data („prieš X d.") vietoj metų formato. Kitiems —
  // metaLine (renginiams: vieta · data; blog: autorius · data).
  const place = (isNews && slide.publishedAt ? relDate(slide.publishedAt) : '') || slide.metaLine || (isChart ? '' : slide.subtitle) || ''
  // Trumpo turinio kortelės (be body teksto) — aukštesnis posteris, kad kortelė
  // neatrodytų pustuštė (event/verta/discovery/recording).
  const tallPoster = !body && !bodyLoading && !isChart && !isDaily && !isNews && !isBlog && slide.type !== 'daily_winner'

  // Koliažas (mosaic) vietoj vieno grainy YT-thumb — čartams ir dienos dainos
  // laimėtojui. Aukštos kokybės cover'iai, tas pats modelis kaip hero kortelės.
  const mosaicAccent = slide.type === 'chart_world' ? '#3b82f6' : 'var(--accent-orange)'
  const mosaicItems: { cover: string; badge?: number | null; winner?: boolean }[] = isChart
    ? (slide.chartTops || []).slice(0, 5)
        .map(t => ({ cover: (t.cover_url || t.artist_image) as string, badge: t.pos }))
        .filter(x => !!x.cover)
    : slide.type === 'daily_winner' && slide.collage
      ? slide.collage.slice(0, 5).map(c => ({ cover: c.cover, winner: c.isWinner }))
      : []

  /* „Muzika" sekcijos embed'ai (max 3): slide.songs arba vienas slide.videoId.
   * Jei iš sąrašo paprašytas video nėra tarp jų — įterpiam pirmu. Antraštė
   * rodoma TIK kai yra tikras dainos pavadinimas (ne tuščias/generinis „Daina"). */
  const realTitle = (t?: string | null): string | null => {
    const s = (t || '').trim()
    return s && s.toLowerCase() !== 'daina' ? s : null
  }
  // „Susijusi muzika" — tikri track'ai (turi songId) → NATIVE grotuvas (play skaičius).
  // >3 dainos (albumas/grupės diskografija) → VIENAS playlist grotuvas su sąrašu.
  // ≤3 (atskirai parinktos dainos) → atskiri grotuvai (kaip anksčiau).
  const nativeAll = (slide.songs || []).filter(s => !!s.songId)
  const isPlaylist = nativeAll.length > 3
  // Playlist (albumas/grupė) → rikiuojam pagal populiarumą: score desc, tada
  // video_views desc (kaip atlikėjo psl. — dažnai score=0, tad YouTube peržiūros
  // duoda tikrą tvarką). Atskirai parinktos dainos (≤3) → redaktoriaus tvarka.
  const nativeSongs = isPlaylist
    ? [...nativeAll].sort((a, b) => ((b.score ?? 0) - (a.score ?? 0)) || ((b.video_views ?? 0) - (a.video_views ?? 0)))
    : nativeAll.slice(0, 3)
  // Raw embed'ai (news `embeds` YouTube, chart/daily videoId, songs be songId) → paprastas iframe.
  const embeds: { videoId: string; title: string | null; artist?: string | null }[] = []
  if (!nativeSongs.length) {
    if (slide.songs && slide.songs.length) {
      for (const s of slide.songs.slice(0, 3)) embeds.push({ videoId: s.videoId, title: realTitle(s.title), artist: s.artist || null })
    } else if (slide.videoId) {
      embeds.push({ videoId: slide.videoId, title: realTitle(slide.songTitle), artist: slide.songArtist || null })
    } else if (extraEmbeds.length) {
      for (const e of extraEmbeds) embeds.push({ videoId: e.videoId, title: realTitle(e.title), artist: null })
    }
  }
  if (reqVideoId && !embeds.some(e => e.videoId === reqVideoId)) {
    embeds.unshift({ videoId: reqVideoId, title: null })
    if (embeds.length > 3) embeds.length = 3
  }

  return (
    <div ref={scrollRef} className="rdr-slide" onScroll={onScroll}>
      {/* ── Viršus: čartams — cover koliažas (mosaic); kitiems — statinė nuotrauka
          (blur-fill posteris). Dienos dainai — jokio hero (turinį valdo widget'as). ── */}
      {isDailyWinner ? null : mosaicItems.length >= 3 ? (
        <div className="rdr-media rdr-media-mosaic">
          <RdrMosaic items={mosaicItems} accent={mosaicAccent} />
          <div className="rdr-media-fade" />
        </div>
      ) : slide.bgImg ? (
        <div className={`rdr-media${tallPoster ? ' rdr-media-tall' : ''}`}>
          <span className="rdr-poster-bg" style={{ backgroundImage: `url(${proxyImgResized(slide.bgImg, 64)})` }} />
          <img className="rdr-poster-img" src={proxyImgResized(slide.bgImg, 1080)} alt="" draggable={false} decoding="async" />
          <div className="rdr-media-fade" />
          {/* Nuotraukų galerija — thumbnail juostelė ANT hero (viršuje), tap →
              fullscreen lightbox. Nėra inline swipe → nesikerta su naujienų swipe. */}
          {active && isNews && gallery.length > 0 && <RdrGallery photos={gallery} />}
        </div>
      ) : null}

      {/* ── Tekstinė dalis ── */}
      <div className="rdr-content">
        <div className="rdr-head">
          {/* „NAUJIENA" chip nereikalingas (ir taip aišku) — rodom tik prasmingus
              tipus (Recenzija/Interviu/Renginys/Dienos daina/Top ir pan.). */}
          {slide.chip && slide.chip !== 'NAUJIENA' && (
            <span className="rdr-chip" style={{ background: seen ? (dk ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)') : slide.chipBg, color: seen && !dk ? 'var(--text-primary)' : '#fff' }}>{slide.chip}</span>
          )}
          {place && !isDailyWinner && <span className="rdr-date">{place}</span>}
          {/* News veiksmai (♥ like naujieną / ↗ share / ⤢ open) — VIRŠUJ prie datos/
              antraštės, ne footeryje. Atlikėjo sekimas ČIA neberodomas (jis prie
              atlikėjo — širdele, atlikėjo psl.), kad nebūtų painiavos ir tilptų keli atlikėjai. */}
          {isNews && <NewsQuickActions slide={slide} />}
          {isDailyWinner && (
            <div className="rdr-head-acts">
              <a className="rdr-na-btn" href="/dienos-daina" target="_blank" rel="noopener noreferrer" title="Atidaryti dienos dainos puslapį" aria-label="Atidaryti naujame lange">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
              </a>
            </div>
          )}
        </div>
        {isRecording
          ? <Link href={slide.href} onClick={onNavLink} className="rdr-title rdr-title-link">{slide.title}</Link>
          : <h2 className="rdr-title">{isDailyWinner ? 'Dienos daina' : slide.title}</h2>}

        {isDailyWinner ? (
          active ? <div className="rdr-dd"><DienosDainaSection variant="reel" /></div>
                 : (slide.excerpt ? <p className="rdr-excerpt">{slide.excerpt}</p> : null)
        ) : isChart ? (
          active ? (
            <ChartVoteList
              topType={slide.type === 'chart_lt' ? 'lt_top30' : 'top40'}
              accent="var(--accent-orange)"
              onPlay={play}
            />
          ) : slide.chartTops && slide.chartTops.length > 0 ? (
            <div className="rdr-chart">
              {slide.chartTops.map(t => (
                <div key={t.pos} className="rdr-chart-row">
                  <span className="rdr-chart-pos">{t.pos}<TrendBadge prev={t.prevPos} pos={t.pos} isNew={t.trend === 'new'} /></span>
                  {t.cover_url || t.artist_image
                    ? <img src={proxyImgResized(t.cover_url || t.artist_image!, 96)} alt="" loading="lazy" decoding="async" />
                    : <span className="rdr-chart-ph" />}
                  <span className="rdr-chart-info"><b>{t.title}</b><i>{t.artist}</i></span>
                </div>
              ))}
            </div>
          ) : null
        ) : isDaily ? (
          active ? <DailyCandidates onPlay={play} /> : (slide.excerpt ? <p className="rdr-excerpt">{slide.excerpt}</p> : null)
        ) : (isBlog && blogTopas && blogTopas.length) ? (
          <div className="rdr-toplist-wrap">
            {blogIntro && <div className="rdr-html" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(blogIntro) }} />}
            <div className="rdr-toplist">
              {blogTopas.map((it: any, idx: number) => (
                <div key={idx} className="rdr-top-item">
                  <span className="rdr-top-rank">{it.rank ?? idx + 1}</span>
                  {it.image_url
                    ? <img className="rdr-top-cover" src={proxyImgResized(it.image_url, 96)} alt="" loading="lazy" decoding="async" />
                    : <span className="rdr-top-cover rdr-top-ph" />}
                  <div className="rdr-top-info">
                    <p className="rdr-top-title">{it.title}{it.artist ? <span className="rdr-top-artist"> — {it.artist}</span> : null}</p>
                    {it.comment && <p className="rdr-top-comment">{it.comment}</p>}
                  </div>
                </div>
              ))}
            </div>
            {blogOutro && <div className="rdr-html rdr-outro" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(blogOutro) }} />}
          </div>
        ) : body ? (
          <div className="rdr-html" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(body) }} />
        ) : bodyLoading ? (
          <div className="rdr-load"><span /><span /><span /></div>
        ) : (slide.excerpt || slide.subtitle) ? (
          <p className="rdr-excerpt">{slide.excerpt || slide.subtitle}</p>
        ) : null}

        {/* ── Social embed'ai (Instagram / X / TikTok / Facebook) — VISADA PIRMI,
            prieš muziką ir nuotraukas. Oficialūs widget'ai per SocialEmbed. ── */}
        {active && isNews && socialEmbeds.length > 0 && (
          <div className="rdr-social">
            {socialEmbeds.map((s, i) => <SocialEmbed key={`${s.url}-${i}`} url={s.url} caption={s.caption} />)}
          </div>
        )}

        {/* ── „Muzika" — standartiniai YouTube embed'ai (16/9). Grojimą paleidžia
            pats YouTube mygtukas iframe'e (vienas tap'as visur, jokio custom
            grotuvo). Mount'inam tik aktyvioj kortelėj (perf — sunkūs iframe'ai).
            Iš topo/kandidatų eilutės paprašytas video (reqVideoId) gauna autoplay=1. ── */}
        {active && !isDailyWinner && (nativeSongs.length > 0 || embeds.length > 0) && (
          <div className="rdr-embeds" ref={embedsRef}>
            {/* Susijusi muzika → native grotuvas (be pasikartojančio title, su like
                + internal play skaičiavimu). Albumas/grupė (>3) → vienas playlist
                grotuvas. Kiti (raw YouTube) → paprastas iframe. */}
            {isPlaylist
              ? <SongPlaylist songs={nativeSongs} onNavLink={onNavLink} />
              : nativeSongs.map(s => <SongPlayer key={s.videoId} song={s} onNavLink={onNavLink} />)}
            {embeds.map(e => (
              <div key={e.videoId} className="rdr-embed">
                {e.title && (
                  <p className="rdr-embed-cap">{e.title}{e.artist ? ` · ${e.artist}` : ''}</p>
                )}
                <div className="rdr-embed-frame">
                  <iframe
                    src={`https://www.youtube.com/embed/${e.videoId}?playsinline=1&rel=0${reqVideoId === e.videoId ? '&autoplay=1' : ''}`}
                    loading="lazy"
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    title={e.title || 'YouTube grotuvas'}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {slide.authorName && <p className="rdr-author">— {slide.authorName}</p>}

        {/* Vieningas kortelės pabaigos blokas — kontekstas (atlikėjas/lineup)
            ir veiksmai (CTA + Bilietai) VIENODU stiliumi visiems tipams. */}
        <CardFooter slide={slide} onNavLink={onNavLink} />
      </div>
    </div>
  )
}

/** News greiti veiksmai — VIRŠUJ, prie datos/antraštės (ne footeryje): ♥ patinka
 *  naujieną, ↗ dalintis, ⤢ atidaryti naujame lange. JOKIO atlikėjo/sekimo čia —
 *  atlikėjų gali būti keli, o sekimas gyvena atlikėjo puslapyje (širdele), kad
 *  nebūtų painiavos ir nekonkuruotų ikonos. */
function NewsQuickActions({ slide }: { slide: HeroSlide }) {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = (typeof location !== 'undefined' ? location.origin : '') + slide.href
    try { if (typeof navigator !== 'undefined' && (navigator as any).share) { await (navigator as any).share({ title: slide.title, url }); return } } catch { /* fallback */ }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* ignore */ }
  }

  return (
    <div className="rdr-head-acts" onClick={(e) => e.stopPropagation()}>
      {slide.newsId ? <EntityLikePill entityType="news" entityId={slide.newsId} subjectName={slide.title} subjectPhoto={slide.bgImg || null} /> : null}
      <button type="button" className="rdr-na-btn" onClick={share} title="Dalintis naujiena" aria-label="Dalintis">
        {copied
          ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>
          : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98M15.41 6.51 8.59 10.49" /></svg>}
      </button>
      <a className="rdr-na-btn" href={slide.href} target="_blank" rel="noopener noreferrer" title="Atidaryti naujieną naujame lange" aria-label="Atidaryti naujame lange">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
      </a>
    </div>
  )
}

// Santykinė data komentarams.
function cmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (!isFinite(m) || m < 0) return ''
  if (m < 1) return 'ką tik'
  if (m < 60) return `prieš ${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `prieš ${h} val.`
  const d = Math.floor(h / 24)
  if (d < 30) return `prieš ${d} d.`
  return new Date(iso).toLocaleDateString('lt-LT')
}

// Santykinė data reels header'iui (naujienoms) — „ką tik / prieš X min./val./
// d./sav./mėn./m." (santrumpos → be linksniavimo problemų). Lengviau skaityti
// nei pilna metų data.
function relDate(iso?: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const now = Date.now()
  const s = Math.max(0, Math.floor((now - t) / 1000))
  const m = Math.floor(s / 60), h = Math.floor(m / 60)
  // Kalendorinių dienų skirtumas (ne 24h blokai) — kad „prieš 20 val." persisukus
  // per vidurnaktį taptų „vakar", o ne liktų valandomis.
  const then = new Date(t), nd = new Date(now)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(nd) - startOfDay(then)) / 86_400_000)
  if (s < 60) return 'ką tik'
  if (m < 60) return `prieš ${m} min.`
  if (dayDiff === 0) return `prieš ${h} val.`
  if (dayDiff === 1) return 'vakar'
  if (dayDiff < 7) return `prieš ${dayDiff} d.`
  if (dayDiff < 30) return `prieš ${Math.floor(dayDiff / 7)} sav.`
  if (dayDiff < 365) return `prieš ${Math.floor(dayDiff / 30)} mėn.`
  return `prieš ${Math.floor(dayDiff / 365)} m.`
}

type RelArtist = { id: number; name: string; slug: string; image: string | null }

/** Vieno susijusio atlikėjo eilutė — avataras + vardas + „Sekti" ŠIRDELĖ (tas
 *  pats mechanizmas kaip atlikėjo psl. FollowPill: /api/artists/[id]/like). */
function ArtistFollowRow({ artist, onNavLink }: { artist: RelArtist; onNavLink: () => void }) {
  return (
    <div className="rdr-relart">
      <Link href={`/atlikejai/${artist.slug}`} onClick={onNavLink} className="rdr-relart-link">
        {artist.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={proxyImgResized(artist.image, 96)} alt="" loading="lazy" decoding="async" />
          : <span className="rdr-relart-ph">{artist.name[0]}</span>}
        <span>{artist.name}</span>
      </Link>
      <EntityLikePill entityType="artist" entityId={artist.id} subjectName={artist.name} subjectPhoto={artist.image} />
    </div>
  )
}

/** News footeris — susiję atlikėjai (kiekvienas sekamas širdele) + komentarai. */
function NewsFooter({ slide, onNavLink }: { slide: HeroSlide; onNavLink: () => void }) {
  const [related, setRelated] = useState<RelArtist[]>(
    slide.artist?.id ? [{ id: slide.artist.id, name: slide.artist.name, slug: slide.artist.slug, image: slide.artist.image || null }] : []
  )
  const [comments, setComments] = useState<any[] | null>(null)
  useEffect(() => {
    if (!slide.newsId) return
    let on = true
    fetch(`/api/news/${slide.newsId}`).then(r => r.json()).then(d => {
      if (!on) return
      const arts = [d?.artist, d?.artist2].filter((a: any) => a && a.id).map((a: any) => ({ id: a.id, name: a.name, slug: a.slug, image: a.cover_image_url || null }))
      if (arts.length) setRelated(arts)
    }).catch(() => {})
    fetch(`/api/comments?entity_type=news&entity_id=${slide.newsId}`).then(r => r.json()).then(d => { if (on) setComments(Array.isArray(d?.comments) ? d.comments : []) }).catch(() => { if (on) setComments([]) })
    return () => { on = false }
  }, [slide.newsId]) // eslint-disable-line
  const cmts = (comments || []).filter((c: any) => !c.parent_id && !c.is_deleted)
  const shown = cmts.slice(0, 3)
  return (
    <div className="rdr-nfoot" onClick={(e) => e.stopPropagation()}>
      {related.length > 0 && (
        <div className="rdr-nfoot-sec">
          <div className="rdr-relart-list">
            {related.map(a => <ArtistFollowRow key={a.id} artist={a} onNavLink={onNavLink} />)}
          </div>
        </div>
      )}
      {cmts.length > 0 && (
        <div className="rdr-nfoot-sec">
          <div className="rdr-nfoot-head">Komentarai</div>
          <div className="rdr-cmt-list">
            {shown.map((c: any) => (
              <div key={c.id} className="rdr-cmt">
                {c.author_avatar
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img className="rdr-cmt-av" src={c.author_avatar} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
                  : <span className="rdr-cmt-av rdr-cmt-av-ph">{(c.author_name || '?')[0]}</span>}
                <div className="rdr-cmt-main">
                  <div className="rdr-cmt-meta"><b>{c.author_name || 'Vartotojas'}</b><span>{cmtAgo(c.created_at)}</span></div>
                  <div className="rdr-cmt-body" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(c.body || '') }} />
                </div>
              </div>
            ))}
          </div>
          {cmts.length > shown.length && (
            <a href={slide.href} target="_blank" rel="noopener noreferrer" className="rdr-nfoot-more">Visi komentarai ({cmts.length}) →</a>
          )}
        </div>
      )}
    </div>
  )
}

/** Vieningas kortelės pabaigos blokas (footer) — VIENODAS visiems slide tipams,
 *  PASKUTINIS kortelės elementas (scrollinasi su turiniu, po jo tik nedidelis
 *  tarpas). Eilutė 1 (TIK jei yra konteksto): atlikėjo avataras+vardas ARBA
 *  renginio lineup'as; be konteksto — jokios tuščios eilutės/skirtuko.
 *  Eilutė 2: pilno pločio solid CTA (+ „Bilietai" outlined, jei yra ticketUrl). */
function CardFooter({ slide, onNavLink }: {
  slide: HeroSlide
  onNavLink: () => void
}) {
  const isNews = slide.type === 'news'
  // News → veiksmai (like/share/open) VIRŠUJ; footeryje — susiję atlikėjai (sekimas) + komentarai.
  if (isNews) return <NewsFooter slide={slide} onNavLink={onNavLink} />
  const isChart = slide.type === 'chart_lt' || slide.type === 'chart_world'
  const showLineup = !!(slide.lineup && slide.lineup.length)
  const showArtist = !showLineup && !!slide.artist && slide.type !== 'event' && !isChart && slide.type !== 'daily' && slide.type !== 'daily_winner'
  const hasCtx = showLineup || showArtist
  // Vieninga CTA etikečių logika — tipas → aiškus veiksmas, fallback ctaLabel.
  const ctaLabel = isNews ? 'Pilna versija ir komentarai'
    : isChart ? 'Visas topas'
    : slide.type === 'daily' || slide.type === 'daily_winner' ? 'Dienos daina'
    : slide.type === 'event' ? 'Apie renginį'
    : slide.type === 'verta' ? 'Apie kelionę'
    : slide.ctaLabel || 'Skaityti'
  return (
    <div className="rdr-foot" onClick={(e) => e.stopPropagation()}>
      {hasCtx && (
        <>
          <div className="rdr-foot-ctx">
            {showLineup ? (
              <div className="rdr-foot-lineup">
                {slide.lineup!.map(a => (
                  <Link key={a.slug} href={`/atlikejai/${a.slug}`} onClick={onNavLink} className="rdr-lineup-item">
                    {a.image
                      ? <img src={proxyImgResized(a.image, 96)} alt="" loading="lazy" decoding="async" />
                      : <span className="rdr-lineup-ph">{a.name[0]}</span>}
                    <span>{a.name}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <Link href={`/atlikejai/${slide.artist!.slug}`} onClick={onNavLink} className="rdr-foot-artist">
                {slide.artist!.image
                  ? <img src={proxyImgResized(slide.artist!.image, 96)} alt="" loading="lazy" decoding="async" />
                  : <span className="rdr-foot-ph">{slide.artist!.name[0]}</span>}
                <span>{slide.artist!.name}</span>
              </Link>
            )}
          </div>
          <div className="rdr-foot-div" />
        </>
      )}
      <div className="rdr-foot-actions">
        <Link href={slide.href} onClick={onNavLink} className="rdr-foot-cta">
          {ctaLabel}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </Link>
        {slide.ticketUrl && (
          <a href={slide.ticketUrl} target="_blank" rel="noopener noreferrer" className="rdr-foot-ticket">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v3a2 2 0 0 1 0 4v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-4V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" /></svg>
            Bilietai
          </a>
        )}
      </div>
    </div>
  )
}

export function ReelsOverlay({ slides, initialIdx, seenSlides, onSeen, onClose, onChartVote, onDailyVote, dk }: {
  slides: HeroSlide[]
  initialIdx: number
  seenSlides: Set<string>
  onSeen: (href: string) => void
  onClose: () => void
  /** Chart slide'ams — atveria voting sheet'ą (reels lieka fone). */
  onChartVote?: (slide: HeroSlide) => void
  /** Dienos dainos slide'ui — atveria balsavimo/siūlymo sheet'ą. */
  onDailyVote?: (slide: HeroSlide) => void
  dk: boolean
}) {
  const [idx, setIdx] = useState(initialIdx)
  const [scrolled, setScrolled] = useState(false)   // aktyvi kortelė nuscrollinta žemyn
  const [playing, setPlaying] = useState(false)      // legacy: grojimas nebe sekamas (standartiniai YT embed'ai) — lieka false
  const [scrollTopReq, setScrollTopReq] = useState(0) // „į viršų" rodyklės signalas aktyviai kortelei
  // Vienkartinis swipe hint naujiems — kad suprastų, jog naujienos keičiamos
  // braukiant į šoną. Rodom tik pirmą kartą (localStorage), auto-dingsta.
  const [showHint, setShowHint] = useState(false)
  useEffect(() => {
    if (slides.length <= 1) return
    try {
      if (!localStorage.getItem('reels_swipe_hint')) {
        localStorage.setItem('reels_swipe_hint', '1')
        setShowHint(true)
        const t = setTimeout(() => setShowHint(false), 3400)
        return () => clearTimeout(t)
      }
    } catch { /* ignore */ }
  }, []) // eslint-disable-line

  // PERF PERDARYMAS (2026-07-03): progresas ir braukimas — per ref'us + tiesioginį
  // DOM stilių, BE React state. Anksčiau setProgress kas RAF kadrą (~60fps)
  // re-renderindavo VISĄ overlay su visomis kortelėmis → strigo, pamesdavo
  // tap'us/klavišus. Dabar React re-renderina TIK keičiantis idx/scrolled/playing.
  const startRef = useRef<number>(0)
  const rafRef = useRef<any>(null)
  const barFillRef = useRef<HTMLDivElement | null>(null)   // aktyvios juostelės fill
  const trackRef = useRef<HTMLDivElement | null>(null)     // slide track (drag transform)
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const gestureDir = useRef<'h' | 'v' | null>(null)
  const ignoreGesture = useRef<boolean>(false)  // tap'ai ant mygtukų/nuorodų/grotuvo NEturi tapti braukimu
  const draggingRef = useRef(false)

  const slide = slides[idx]
  // Interaktyvios kortelės (topai, dienos daina) — auto-advance IŠ VISO neveikia
  // (kad nepradingtų bebalsuojant/beklausant). Kitur — stoja skaitant/grojant.
  const interactive = !!slide && (slide.type === 'chart_lt' || slide.type === 'chart_world' || slide.type === 'daily' || slide.type === 'daily_winner')
  const autoOff = interactive || scrolled || playing
  // Braukimas į šoną veikia VISADA (ir skaitant) — pagal gesto kryptį (h vs v).

  const goTo = useCallback((n: number) => {
    setShowHint(false)
    if (n < 0) return
    if (n >= slides.length) { onClose(); return }
    setIdx(n)
  }, [slides.length, onClose])

  // Ref'ai stabiliems handler'iams (klaviatūra/RAF nesikabina iš naujo kas idx).
  const idxRef = useRef(idx); idxRef.current = idx
  const goToRef = useRef(goTo); goToRef.current = goTo
  const autoOffRef = useRef(autoOff); autoOffRef.current = autoOff

  const stopProgress = useCallback(() => { cancelAnimationFrame(rafRef.current) }, [])
  const startProgress = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    startRef.current = Date.now()
    const dur = slides[idxRef.current] ? slideDuration(slides[idxRef.current]) : REELS_DURATION
    const tick = () => {
      const p = Math.min((Date.now() - startRef.current) / dur, 1)
      if (barFillRef.current) barFillRef.current.style.width = `${p * 100}%`
      if (p >= 1) { if (!autoOffRef.current) goToRef.current(idxRef.current + 1); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [slides]) // eslint-disable-line

  /* Slide pasikeitė — reset; pažymim seen išeinant. */
  useEffect(() => {
    if (!slide) return
    setScrolled(false)
    setPlaying(false)
    if (barFillRef.current) barFillRef.current.style.width = '0%'
    startProgress()
    return () => { stopProgress(); onSeen(slideKey(slide)) }
  }, [idx]) // eslint-disable-line

  /* Pauzė kai skaitoma/grojama. */
  useEffect(() => {
    if (autoOff) stopProgress(); else startProgress()
  }, [autoOff]) // eslint-disable-line

  /* Klaviatūra (desktop) — VIENAS stabilus listener'is (per ref'us). Anksčiau
   * re-subscribindavo kas idx ir per re-render audrą pamesdavo paspaudimus. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') goToRef.current(idxRef.current + 1)
      else if (e.key === 'ArrowLeft') goToRef.current(idxRef.current - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /* Touch — horizontalus braukimas keičia istoriją; vertikalus = native scroll.
   * Drag poslinkis piešiamas TIESIOGIAI ant track'o (be state → be re-render'ų). */
  const setTrackX = (extraPx: number) => {
    const el = trackRef.current
    if (!el) return
    const w = typeof window !== 'undefined' ? window.innerWidth : 400
    el.style.transition = 'none'
    el.style.transform = `translateX(calc(${-idxRef.current * 100}% + ${(extraPx / w) * 100}%))`
  }
  const resetTrackX = () => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = 'transform .32s cubic-bezier(.4,0,.2,1)'
    el.style.transform = `translateX(${-idxRef.current * 100}%)`
  }
  const onTouchStart = (e: React.TouchEvent) => {
    if (showHint) setShowHint(false)
    const t = e.target as HTMLElement
    ignoreGesture.current = !!(t && t.closest && t.closest('button, a, iframe, input, textarea, .rdr-foot'))
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    gestureDir.current = null
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (ignoreGesture.current) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    if (gestureDir.current === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
      gestureDir.current = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v'
      if (gestureDir.current === 'h') { draggingRef.current = true; stopProgress() }
    }
    if (gestureDir.current === 'h') {
      e.preventDefault()
      setTrackX(dx)
    }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (ignoreGesture.current) { ignoreGesture.current = false; return }
    if (gestureDir.current === 'h') {
      const dx = e.changedTouches[0].clientX - touchStartX.current
      draggingRef.current = false
      if (Math.abs(dx) > 55) { resetTrackX(); goTo(dx < 0 ? idx + 1 : idx - 1) }
      else { resetTrackX(); if (!autoOff) startProgress() }
    }
    gestureDir.current = null
  }

  const translateX = -idx * 100

  return (
    <div className={`hp-reels${dk ? '' : ' light'}`}>
      <style>{REELS_CSS}</style>
      {/* Progreso juostelės — aktyvios fill'as varomas per ref (RAF), be state. */}
      <div className="rdr-bars">
        {slides.map((s, i) => {
          const isSeen = seenSlides.has(slideKey(s))
          const isPast = i < idx
          const isCurrent = i === idx
          const barColor = isCurrent ? 'var(--accent-orange)' : isPast ? (isSeen ? 'rgba(255,255,255,0.7)' : 'var(--accent-orange)') : 'rgba(255,255,255,0.0)'
          return (
            <div key={i} className="rdr-bar">
              <div ref={isCurrent ? barFillRef : undefined} style={{ height: '100%', borderRadius: 2, background: barColor, width: isPast ? '100%' : '0%' }} />
            </div>
          )
        })}
      </div>

      {scrolled && (
        <button className="rdr-uptop" aria-label="Į viršų" onClick={() => setScrollTopReq(n => n + 1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      )}

      <button onClick={onClose} className="rdr-close" aria-label="Uždaryti">✕</button>

      {idx > 0 && <button className="rdr-nav rdr-nav-l" onClick={() => goTo(idx - 1)} aria-label="Atgal">‹</button>}
      <button className="rdr-nav rdr-nav-r" onClick={() => goTo(idx + 1)} aria-label="Toliau">›</button>

      {/* Vienkartinis swipe hint — naujiems, kad suprastų naršymą braukiant. */}
      {showHint && (
        <div className="rdr-hint" aria-hidden onClick={() => setShowHint(false)}>
          <span className="rdr-hint-chev">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </span>
          <span className="rdr-hint-txt">Braukite — kitos naujienos</span>
        </div>
      )}

      <div
        ref={trackRef}
        className="hp-reels-track"
        style={{ transform: `translateX(${translateX}%)`, transition: 'transform .32s cubic-bezier(.4,0,.2,1)' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {slides.map((s, i) => (
          <div key={`${s.type}-${s.href}-${i}`} className="hp-reels-slide">
            {/* PERF: mount'inam tik aktyvią kortelę ±1 (kaimynai preload'ui).
                Anksčiau visos ~25 kortelės kartu — sunkus atidarymas. */}
            {Math.abs(i - idx) <= 1 ? (
              <ReaderSlide
                slide={s}
                active={i === idx}
                seen={seenSlides.has(slideKey(s))}
                dk={dk}
                scrollTopSignal={i === idx ? scrollTopReq : 0}
                onScrolledChange={(sc) => { if (i === idx) setScrolled(sc) }}
                onPlayingChange={(pl) => { if (i === idx) setPlaying(pl) }}
                onClose={onClose}
                onChartVote={onChartVote}
                onDailyVote={onDailyVote}
                onNavLink={onClose}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────── Chart bottom sheet ──────────────────────────────
   Reader'io chart slide'o balsavimo bottom-sheet'as. Naudoja tą patį /api/top
   API kaip /top30 ir /top40 puslapiuose, todėl balsų limitai sutampa. */

type ChartSheetEntry = {
  position: number
  track_id: number
  title: string
  artist: string
  cover_url: string | null
  artist_image: string | null
  is_new?: boolean
  weeks_in_top?: number
  prev_position?: number | null
}

export function ChartBottomSheet({
  open, onClose, topType, title, accent,
}: {
  open: boolean
  onClose: () => void
  topType: 'lt_top30' | 'top40'
  title: string
  accent: string
}) {
  const [entries, setEntries] = useState<ChartSheetEntry[]>([])
  const [weekId, setWeekId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [votedIds, setVotedIds] = useState<number[]>([])
  const [votesRemaining, setVotesRemaining] = useState<number>(5)
  const [voteErr, setVoteErr] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)

  // Load entries + vote status when opened. Reset state when closed so a fresh
  // open re-fetches (rotating-week scenarios + chart switches).
  useEffect(() => {
    if (!open) return
    let cancel = false
    setLoading(true)
    setVoteErr(null)
    fetch(`/api/top/entries?type=${topType}`)
      .then(r => r.json())
      .then(d => {
        if (cancel) return
        const wId = d.week?.id ?? null
        setWeekId(wId)
        const list: ChartSheetEntry[] = (d.entries || []).map((e: any, i: number) => ({
          position: e.position ?? (i + 1),
          track_id: e.track_id,
          title: sanitizeTitle(e.tracks?.title || ''),
          artist: e.tracks?.artists?.name || '',
          cover_url: e.tracks?.cover_url || null,
          artist_image: e.tracks?.artists?.cover_image_url || null,
          is_new: e.is_new,
          weeks_in_top: e.weeks_in_top,
          prev_position: e.prev_position,
        }))
        setEntries(list)
        if (wId) {
          fetch(`/api/top/vote?week_id=${wId}`).then(r => r.json()).then(v => {
            if (cancel) return
            setVotedIds(v.voted_track_ids || [])
            setVotesRemaining(v.votes_remaining ?? 5)
          }).catch(() => {})
        }
      })
      .catch(() => { if (!cancel) setEntries([]) })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [open, topType])

  // Lock body scroll while sheet is open. Restore previous overflow on unmount.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const handleVote = async (trackId: number) => {
    if (!weekId || votedIds.includes(trackId) || pendingId === trackId) return
    if (votesRemaining <= 0) {
      setVoteErr('Pasiekei savaitės balsų limitą')
      setTimeout(() => setVoteErr(null), 2500)
      return
    }
    setPendingId(trackId)
    try {
      const res = await fetch('/api/top/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId, week_id: weekId, vote_type: 'like', fingerprint: deviceFpSync() }),
      })
      const d = await res.json()
      if (res.ok) {
        setVotedIds(p => [...p, trackId])
        setVotesRemaining(p => Math.max(0, p - 1))
      } else {
        setVoteErr(d.error || 'Klaida')
        setTimeout(() => setVoteErr(null), 2500)
      }
    } catch {
      setVoteErr('Tinklo klaida')
      setTimeout(() => setVoteErr(null), 2500)
    } finally {
      setPendingId(null)
    }
  }

  if (!open) return null
  if (typeof document === 'undefined') return null

  // Portal į body — escape'ina bet kokį parent transform/filter/overflow,
  // kuris galėtų sulaužyti `position: fixed` (iOS Safari ypač jautrus).
  return createPortal((
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} balsavimas`}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
        animation: 'cbs-fade 0.18s ease-out',
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes cbs-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cbs-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes cbs-spin { to { transform: rotate(360deg) } }
        .cbs-vote-btn { transition: all 0.15s; }
        .cbs-vote-btn:active:not(:disabled) { transform: scale(0.94); }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '90vh',
          background: 'linear-gradient(180deg, #0f1320 0%, #060912 100%)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          borderTop: `2px solid ${accent}`,
          boxShadow: '0 -24px 80px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          animation: 'cbs-slide 0.28s cubic-bezier(0.32,0.72,0.28,1)',
          animationFillMode: 'forwards',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 44, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.22)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 18px 12px', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, fontFamily: 'Outfit,sans-serif' }}>
              Balsuoti · šios savaitės topas
            </span>
            <h2 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: 'Outfit,sans-serif', letterSpacing: '-0.02em', lineHeight: 1.05 }}>
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Uždaryti"
            style={{
              flexShrink: 0, width: 38, height: 38, borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        {/* Vote status bar */}
        <div style={{
          margin: '0 18px 8px', padding: '9px 12px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
            Balsų liko: <span style={{ color: accent, fontWeight: 900 }}>{votesRemaining}</span>
          </span>
          <Link
            href={topType === 'lt_top30' ? '/top30' : '/top40'}
            style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontWeight: 700 }}
          >
            Visas puslapis →
          </Link>
        </div>

        {voteErr && (
          <div style={{ margin: '0 18px 8px', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', color: '#fecaca', fontSize: 14, fontWeight: 600 }}>
            {voteErr}
          </div>
        )}

        {/* Entries list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 18px', WebkitOverflowScrolling: 'touch' }}>
          {loading && entries.length === 0 && (
            <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 28, height: 28, border: `2.5px solid ${accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'cbs-spin 0.7s linear infinite' }} />
            </div>
          )}
          {entries.map(e => {
            const c = e.cover_url || e.artist_image
            const voted = votedIds.includes(e.track_id)
            const pending = pendingId === e.track_id
            const trend =
              e.is_new ? 'new'
              : e.prev_position == null ? 'same'
              : e.position < e.prev_position ? 'up'
              : e.position > e.prev_position ? 'down'
              : 'same'
            return (
              <div
                key={e.track_id || e.position}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 6px', borderRadius: 10,
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                {/* Position */}
                <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
                  <div style={{
                    fontSize: 16, fontWeight: 900, color: e.position <= 3 ? accent : 'rgba(255,255,255,0.9)',
                    fontFamily: 'Outfit,sans-serif', lineHeight: 1,
                  }}>{e.position}</div>
                  {trend !== 'same' && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : accent, marginTop: 2, lineHeight: 1 }}>
                      {trend === 'up' ? '▲' : trend === 'down' ? '▼' : 'NEW'}
                    </div>
                  )}
                </div>
                {/* Cover */}
                <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }}>
                  {c && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImgResized(c, 96)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  )}
                </div>
                {/* Title + artist */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'Outfit,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.005em' }}>{e.title}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.artist}</p>
                </div>
                {/* Vote button */}
                <button
                  className="cbs-vote-btn"
                  onClick={() => handleVote(e.track_id)}
                  disabled={voted || pending || votesRemaining <= 0}
                  aria-label={voted ? 'Jau balsavai' : 'Balsuoti'}
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 11px', borderRadius: 999,
                    border: voted ? `1.5px solid ${accent}` : '1.5px solid rgba(255,255,255,0.18)',
                    background: voted ? `${accent}` : 'rgba(255,255,255,0.04)',
                    color: voted ? '#fff' : 'rgba(255,255,255,0.85)',
                    fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 800,
                    cursor: (voted || pending || votesRemaining <= 0) ? 'default' : 'pointer',
                    opacity: !voted && votesRemaining <= 0 ? 0.4 : 1,
                  }}
                >
                  {pending ? (
                    <span style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'cbs-spin 0.7s linear infinite' }} />
                  ) : voted ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 7"/>
                    </svg>
                  ) : null}
                  <span>{voted ? 'Balsavai' : 'Balsuok'}</span>
                </button>
              </div>
            )
          })}
          {!loading && entries.length === 0 && (
            <p style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Topas dar tuščias.</p>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}

/* ────────────────────────────── Mobile chart slide ──────────────────────────────
   Asimetrinis mosaic + swipe-down gestural. Tap atidaro sheet'ą; swipe-down
   tą patį, su pull animacija. Kortelė neslinkamos juostos child'as — todėl
   horizontal swipe NETURI būti perimtas (ignore'uojam, jei dx > dy). */

export function MobileChartSlide({
  slide, onOpen,
}: {
  slide: HeroSlide
  onOpen: () => void
}) {
  const tops = slide.chartTops || []
  const accent = slide.type === 'chart_lt' ? 'var(--accent-orange)' : '#3b82f6'
  const accentShadow = slide.type === 'chart_lt' ? 'rgba(249,115,22,0.45)' : 'rgba(59,130,246,0.45)'
  const cover = (t: TopEntry | undefined) => t ? (t.cover_url || t.artist_image) : null

  // Plain onClick — kaip news/event preview kortelės. Joks touch handler
  // nereikalingas: paprastas tap'as atidaro reels (kuris pats turi swipe-down
  // logiką balsavimo sheet'ui).
  const handleClick = () => onOpen()

  // Top 3 only (ne 4) — #1 didžiausias top half, #2 + #3 50/50 apačioje.
  const t1 = tops[0]
  const t2 = tops[1]
  const t3 = tops[2]

  // Render single tile — #1 (big) gauna title + artist, #2/#3 tik artist'o
  // vardą (paprastesnis preview, kad nesusikrautų teksto kiekiu).
  const renderTile = (t: TopEntry | undefined, big: boolean) => {
    const c = cover(t)
    if (!t || !c) return <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }} />
    const numSize = big ? 13 : 10.5
    const numPad = big ? '3px 8px' : '2px 6px'
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={proxyImgResized(c, 320)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.25) 45%, transparent 70%)' }} />
        <span style={{
          position: 'absolute', top: 5, left: 5, padding: numPad, borderRadius: 6,
          background: t.pos === 1 ? accent : 'rgba(0,0,0,0.82)',
          color: '#fff', fontSize: numSize, fontWeight: 900,
          fontFamily: 'Outfit,sans-serif', lineHeight: 1,
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        }}>{t.pos}</span>
        {big ? (
          // #1 — title + artist (du eilutes)
          <div style={{ position: 'absolute', left: 8, right: 8, bottom: 6 }}>
            <p style={{
              margin: 0, fontSize: 14, fontWeight: 900, color: '#fff',
              fontFamily: 'Outfit,sans-serif',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              letterSpacing: '-0.01em', textShadow: '0 1px 4px rgba(0,0,0,0.95)',
              lineHeight: 1.15,
            }}>{t.title}</p>
            <p style={{
              margin: '1px 0 0', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
              fontFamily: 'Outfit,sans-serif',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
              lineHeight: 1.2,
            }}>{t.artist}</p>
          </div>
        ) : (
          // #2/#3 — tik artist'o vardas
          <p style={{
            position: 'absolute', left: 5, right: 5, bottom: 4,
            margin: 0, fontSize: 12, fontWeight: 800, color: '#fff',
            fontFamily: 'Outfit,sans-serif',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: '-0.005em', textShadow: '0 1px 4px rgba(0,0,0,0.95)',
            lineHeight: 1.15,
          }}>{t.artist}</p>
        )}
      </>
    )
  }

  return (
    <button
      onClick={handleClick}
      style={{
        flexShrink: 0, position: 'relative', borderRadius: 16, overflow: 'hidden',
        border: `2px solid ${accent}`,
        background: '#000', cursor: 'pointer', padding: 0, width: 156, height: 236,
        scrollSnapAlign: 'start',
        transition: 'border-color 0.15s, transform 0.15s',
        boxShadow: 'var(--hero-card-shadow)',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* BG gradient base — absolutus, neblokuoja flex layout'o */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: slide.type === 'chart_lt'
          ? `linear-gradient(180deg, rgba(249,115,22,0.32) 0%, #0a0e1a 30%, #050810 100%)`
          : `linear-gradient(180deg, rgba(59,130,246,0.32) 0%, #0a0e1a 30%, #050810 100%)`,
      }} />

      {/* CHIP — virš kortelės */}
      <div style={{ position: 'relative', zIndex: 2, padding: '10px 12px 8px', display: 'flex', justifyContent: 'flex-start' }}>
        <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: accent, fontFamily: 'Outfit,sans-serif', letterSpacing: '0.03em', textTransform: 'uppercase', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
          {slide.chip}
        </span>
      </div>

      {/* MOSAIC — flex'as imantis likusios erdvės. #1 70% aukščio, #2+#3 30%. */}
      <div style={{
        position: 'relative', zIndex: 2, flex: 1,
        padding: '0 12px',
        display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0,
      }}>
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', boxShadow: '0 5px 18px rgba(0,0,0,0.5)', flex: '1.55 1 0', minHeight: 0 }}>
          {renderTile(t1, true)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, flex: '1 1 0', minHeight: 0 }}>
          <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', boxShadow: '0 3px 12px rgba(0,0,0,0.45)' }}>
            {renderTile(t2, false)}
          </div>
          <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', boxShadow: '0 3px 12px rgba(0,0,0,0.45)' }}>
            {renderTile(t3, false)}
          </div>
        </div>
      </div>

      {/* CTA "Balsuok" — flex item apačioje, fixed dydžio. Niekas po juo nelenda. */}
      <div style={{ position: 'relative', zIndex: 2, padding: '8px 12px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '9px 12px', borderRadius: 10,
          background: accent, color: '#fff',
          fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 900,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          boxShadow: `0 4px 14px ${accentShadow}`,
        }}>
          Balsuok
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </div>
    </button>
  )
}

/* ────────────────────────────── Dienos daina sheet ──────────────────────────────
   Reels'ų dienos dainos balsavimo/siūlymo bottom-sheet'as — createPortal overlay,
   rodantis <DienosDainaHero fullPage />. Markup 1:1 iš v1 HomeClient. */
export function DailyVoteSheet({ onClose }: { onClose: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal((
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', background: 'var(--bg-body)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '14px 14px 28px', position: 'relative' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <span style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border-strong)' }} />
        </div>
        <button onClick={onClose} aria-label="Uždaryti"
          style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-hover)', border: 'none', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', zIndex: 2 }}>✕</button>
        <DienosDainaHero fullPage />
      </div>
    </div>
  ), document.body)
}

/* ── Reels reader v3 CSS — horizontal istorijos, vertikalus skaitymas.
   Perkelta VERBATIM iš v1 HomeClient didžiojo <style> bloko. ── */
const REELS_CSS = `
        /* ── Reels reader v3 — horizontal istorijos, vertikalus skaitymas.
           z-index VIRŠ site header'io — overlay dengia visą ekraną (fullscreen). ── */
        .hp-reels{position:fixed;inset:0;z-index:9999;background:#101319;overflow:hidden}
        .hp-reels-track{height:100%;display:flex;flex-direction:row;will-change:transform}
        .hp-reels-slide{height:100dvh;width:100vw;flex-shrink:0;position:relative;overflow:hidden;background:#101319}

        /* Vertikaliai scrollinama istorija */
        .rdr-slide{height:100%;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;scrollbar-width:none}
        .rdr-slide::-webkit-scrollbar{display:none}

        /* Media viršuje — VISADA tik statinė nuotrauka (contain + blur fonas) */
        .rdr-media{position:relative;width:100%;aspect-ratio:16/10;max-height:60vh;background:#0a0a0a;overflow:hidden}
        .rdr-media-fade{position:absolute;left:0;right:0;bottom:0;height:42%;background:linear-gradient(to top,#000,transparent);pointer-events:none;z-index:1}
        /* Trumpo turinio kortelės — aukštesnis posteris */
        .rdr-media-tall{aspect-ratio:4/5;max-height:60vh}
        .rdr-poster-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(26px) brightness(0.55);transform:scale(1.18)}
        .rdr-poster-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1}
        /* Čartų / dienos dainos koliažas (mosaic) — vietoj grainy YT thumb. */
        .rdr-media-mosaic{aspect-ratio:16/10;max-height:52vh;background:#0a0a0a;padding:12px;display:grid;grid-template-columns:2.4fr 1fr;grid-template-rows:1.7fr 1fr;gap:7px}
        .rdr-mosaic{display:contents}
        .rdr-mos-big{grid-column:1;grid-row:1}
        .rdr-mos-side{grid-column:2;grid-row:1}
        .rdr-mos-bottom{grid-column:1 / -1;grid-row:2;display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}
        .rdr-mos-cell{position:relative;display:block;width:100%;height:100%;border-radius:9px;overflow:hidden;background:#1a1a1a;box-shadow:0 4px 14px rgba(0,0,0,0.4)}
        .rdr-mos-cell img{width:100%;height:100%;object-fit:cover;display:block}
        .rdr-mos-ph{background:rgba(255,255,255,0.05)}
        .rdr-mos-badge{position:absolute;top:6px;left:6px;min-width:22px;height:22px;padding:0 5px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;font-weight:900;font-size:12.5px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)}
        .rdr-media-mosaic .rdr-media-fade{display:none}
        /* News greitų veiksmų footer (♥ / ↗ / ⤢) */
        .rdr-foot-news{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px}
        .rdr-na-left{display:flex;align-items:center;gap:7px;min-width:0;flex:1 1 auto}
        .rdr-na-artist{display:inline-flex;align-items:center;gap:8px;min-width:0;text-decoration:none;color:#fff}
        .rdr-na-artist img,.rdr-na-artist-ph{width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--accent-orange);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;text-transform:uppercase;font-family:'Outfit',sans-serif}
        .rdr-na-artist span{font-family:'Outfit',sans-serif;font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-na-follow{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--accent-orange);background:transparent;color:var(--accent-orange);font-family:'Outfit',sans-serif;font-weight:800;font-size:12.5px;cursor:pointer;white-space:nowrap}
        .rdr-na-follow.on{background:var(--accent-orange);color:#fff}
        .rdr-na-follow:disabled{opacity:0.5;cursor:not-allowed}
        .rdr-na-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
        .rdr-na-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:38px;min-width:38px;padding:0 11px;border-radius:11px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:#fff;font-family:'Outfit',sans-serif;font-weight:800;font-size:13px;cursor:pointer;text-decoration:none}
        .rdr-na-btn.on{color:#fff;border-color:var(--accent-orange);background:var(--accent-orange)}
        .rdr-na-btn.on svg{fill:#fff}
        .rdr-na-btn:disabled{opacity:0.5;cursor:not-allowed}
        /* News veiksmai header'yje (prie datos) — dešinėj, kiek mažesni */
        .rdr-head-acts{display:flex;align-items:center;gap:7px;margin-left:auto}
        /* share / open — apvalūs, žemesni, kad derėtų su LikePill (apvalus) */
        .rdr-head-acts .rdr-na-btn{height:30px;min-width:30px;width:30px;padding:0;border-radius:999px;font-size:12.5px}
        /* News footeris: susiję atlikėjai (sekimas širdele) + komentarai */
        .rdr-nfoot{margin:24px 0 0;display:flex;flex-direction:column;gap:20px}
        .rdr-nfoot-sec{display:flex;flex-direction:column;gap:10px}
        .rdr-nfoot-head{font-family:'Outfit',sans-serif;font-weight:800;font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,0.5)}
        .rdr-relart-list{display:flex;flex-direction:column;gap:8px}
        .rdr-relart{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10)}
        .rdr-relart-link{display:inline-flex;align-items:center;gap:9px;min-width:0;text-decoration:none;color:#fff}
        .rdr-relart-link img,.rdr-relart-ph{width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--accent-orange);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;font-family:'Outfit',sans-serif;text-transform:uppercase}
        .rdr-relart-link span{font-family:'Outfit',sans-serif;font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-relart-follow{display:inline-flex;align-items:center;justify-content:center;gap:5px;flex-shrink:0;min-width:38px;height:38px;padding:0 13px;border-radius:999px;border:1px solid var(--accent-orange);background:transparent;color:var(--accent-orange);font-family:'Outfit',sans-serif;font-weight:800;font-size:13px;cursor:pointer}
        .rdr-relart-follow.on{background:var(--accent-orange);color:#fff}
        .rdr-relart-follow:disabled{opacity:.5;cursor:not-allowed}
        .rdr-cmt-list{display:flex;flex-direction:column;gap:13px}
        .rdr-cmt{display:flex;gap:9px;align-items:flex-start}
        .rdr-cmt-av{width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;background:rgba(255,255,255,0.1)}
        .rdr-cmt-av-ph{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-family:'Outfit',sans-serif;font-size:13px;text-transform:uppercase}
        .rdr-cmt-main{min-width:0;flex:1}
        .rdr-cmt-meta{display:flex;align-items:baseline;gap:8px}
        .rdr-cmt-meta b{font-family:'Outfit',sans-serif;font-weight:700;font-size:13.5px;color:#fff}
        .rdr-cmt-meta span{font-size:11.5px;color:rgba(255,255,255,0.5)}
        .rdr-cmt-body{font-size:14px;line-height:1.5;color:rgba(255,255,255,0.85);margin-top:2px}
        .rdr-cmt-body p{margin:0}
        .rdr-nfoot-more{display:inline-block;font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;color:var(--accent-orange);text-decoration:none;margin-top:2px}
        .hp-reels.light .rdr-nfoot-head,.hp-reels.light .rdr-cmt-meta span{color:var(--text-muted)}
        .hp-reels.light .rdr-relart{background:var(--bg-hover);border-color:var(--border-default)}
        .hp-reels.light .rdr-relart-link,.hp-reels.light .rdr-relart-link span{color:var(--text-primary)}
        .hp-reels.light .rdr-relart-follow{color:var(--accent-orange)}
        .hp-reels.light .rdr-relart-follow.on{color:#fff}
        .hp-reels.light .rdr-cmt-meta b{color:var(--text-primary)}
        .hp-reels.light .rdr-cmt-body{color:var(--text-secondary)}
        /* Native „susijusios muzikos" grotuvas — stilius kaip homepage „Vakar laimėjo"
           (oranžinis borderis), play mygtukas apatiniam dešiniam kampe (kaip atlikėjo psl.) */
        .rdr-song{border-radius:14px;overflow:hidden;background:var(--bg-surface);border:2px solid var(--accent-orange)}
        .rdr-song-video{position:relative;width:100%;aspect-ratio:16/9;background:#000}
        .rdr-song-ytwrap{position:absolute;inset:0;display:none}
        .rdr-song-ytwrap.on{display:block}
        .rdr-song-ytwrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}
        .rdr-song-title{text-decoration:none;color:inherit}
        .rdr-song-title:hover b{color:var(--accent-orange)}
        .rdr-song-poster{position:absolute;inset:0;z-index:2;width:100%;height:100%;border:0;padding:0;cursor:pointer;background-color:#000;background-size:cover;background-position:center}
        .rdr-song-play{position:absolute;bottom:10px;right:10px;display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:var(--accent-orange);box-shadow:0 8px 24px rgba(249,115,22,0.5);border:3px solid rgba(255,255,255,0.15);padding-left:2px;transition:transform .2s}
        .rdr-song-poster:hover .rdr-song-play{transform:scale(1.08)}
        .rdr-song-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.05)}
        .rdr-song-info{display:flex;flex-direction:column;min-width:0}
        .rdr-song-info b{font-family:'Outfit',sans-serif;font-weight:800;font-size:14.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-song-info i{font-style:normal;font-size:12.5px;color:rgba(255,255,255,0.62);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
        .rdr-song-like{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;height:34px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);background:transparent;color:#fff;font-family:'Outfit',sans-serif;font-weight:800;font-size:13px;cursor:pointer}
        .rdr-song-like.on{color:#fff;background:var(--accent-orange);border-color:var(--accent-orange)}
        .rdr-song-like:disabled{opacity:.55;cursor:not-allowed}
        /* Playlist (albumas/grupė) — dainų sąrašas po grotuvu */
        .rdr-plist-list{display:flex;flex-direction:column;max-height:236px;overflow-y:auto;border-top:1px solid rgba(255,255,255,0.08);scrollbar-width:thin}
        .rdr-plist-row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;text-align:left;color:#fff}
        .rdr-plist-row:last-child{border-bottom:0}
        .rdr-plist-row.on{background:rgba(249,115,22,0.14)}
        .rdr-plist-num{width:20px;flex-shrink:0;text-align:center;font-family:'Outfit',sans-serif;font-weight:800;font-size:13px;font-variant-numeric:tabular-nums;color:rgba(255,255,255,0.5)}
        .rdr-plist-row.on .rdr-plist-num{color:var(--accent-orange)}
        .rdr-plist-tx{display:flex;flex-direction:column;min-width:0;flex:1 1 auto}
        .rdr-plist-tx b{font-family:'Outfit',sans-serif;font-weight:700;font-size:13.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-plist-tx i{font-style:normal;font-size:12px;color:rgba(255,255,255,0.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
        .rdr-plist-row.on .rdr-plist-tx b{color:var(--accent-orange)}
        /* Play mygtukas DEŠINĖJ — aktyvus oranžinis (kaip PlayerCard), kiti neutralūs */
        .rdr-plist-play{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex-shrink:0;border-radius:50%;background:rgba(255,255,255,0.1);color:#fff;padding-left:1px}
        .rdr-plist-row.on .rdr-plist-play{background:var(--accent-orange);color:#fff;box-shadow:0 4px 14px rgba(249,115,22,0.35)}
        .hp-reels.light .rdr-plist-list{border-top-color:var(--border-default)}
        .hp-reels.light .rdr-plist-row{border-bottom-color:var(--border-subtle);color:var(--text-primary)}
        .hp-reels.light .rdr-plist-num{color:var(--text-muted)}
        .hp-reels.light .rdr-plist-tx b{color:var(--text-primary)}
        .hp-reels.light .rdr-plist-tx i{color:var(--text-muted)}
        .hp-reels.light .rdr-plist-play{background:var(--card-bg);color:var(--text-primary);border:1px solid var(--border-default)}
        .hp-reels.light .rdr-plist-row.on{background:rgba(249,115,22,0.12)}
        .hp-reels.light .rdr-plist-row.on .rdr-plist-play{background:var(--accent-orange);color:#fff;border-color:var(--accent-orange)}
        .hp-reels.light .rdr-song{border-color:var(--border-default)}
        .hp-reels.light .rdr-song-bar{background:var(--bg-elevated)}
        .hp-reels.light .rdr-song-info b{color:var(--text-primary)}
        .hp-reels.light .rdr-song-info i{color:var(--text-muted)}
        .hp-reels.light .rdr-song-like{color:var(--text-primary);border-color:var(--border-default)}
        .hp-reels.light .rdr-song-like.on{color:#fff}
        .hp-reels.light .rdr-na-artist,.hp-reels.light .rdr-na-artist span{color:var(--text-primary)}
        .hp-reels.light .rdr-na-btn{background:var(--bg-hover);border-color:var(--border-default);color:var(--text-primary)}
        .hp-reels.light .rdr-na-btn.on{color:#fff;border-color:var(--accent-orange);background:var(--accent-orange)}
        /* Antraštės galvutė: badge + data vienoj eilutėj (kompaktiška) */
        .rdr-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
        .rdr-date{font-size:14px;font-weight:600;color:rgba(255,255,255,0.62);font-family:'Outfit',sans-serif}

        /* ── Šviesi tema (light mode) — reels neturi būti juodas ── */
        .hp-reels.light,.hp-reels.light .hp-reels-slide,.hp-reels.light .rdr-slide{background:var(--bg-body)}
        .hp-reels.light .rdr-title,.hp-reels.light .rdr-title-link{color:var(--text-primary)}
        .hp-reels.light .rdr-date{color:var(--text-muted)}
        .hp-reels.light .rdr-excerpt,.hp-reels.light .rdr-html{color:var(--text-secondary)}
        .hp-reels.light .rdr-html h2,.hp-reels.light .rdr-html h3{color:var(--text-primary)}
        .hp-reels.light .rdr-html a{color:var(--accent-link)}
        .hp-reels.light .rdr-author{color:var(--text-muted)}
        .hp-reels.light .rdr-media-fade{display:none}
        .hp-reels.light .rdr-embeds-head{color:var(--text-muted)}
        .hp-reels.light .rdr-embed-cap{color:var(--text-muted)}
        .hp-reels.light .rdr-foot{background:var(--bg-elevated);border-color:var(--border-default)}
        .hp-reels.light .rdr-foot-artist span{color:var(--text-primary)}
        .hp-reels.light .rdr-foot-div{background:var(--border-default)}
        .hp-reels.light .rdr-foot-ticket{border-color:var(--border-default);color:var(--text-primary)}
        .hp-reels.light .rdr-uptop{background:var(--bg-elevated);border-color:var(--border-default);color:var(--text-primary)}
        .hp-reels.light .rdr-chart-info b,.hp-reels.light .rdr-top-title{color:var(--text-primary)}
        .hp-reels.light .rdr-toplist .rdr-top-comment,.hp-reels.light .rdr-chart-info i,.hp-reels.light .rdr-top-artist{color:var(--text-muted)}

        /* Turinys — footer'is yra PASKUTINIS elementas; apačioje tik nedidelis
           tarpas + safe-area, kad kortelė baigtųsi švariai (be tuščio scroll'o). */
        .rdr-content{padding:16px 20px calc(16px + env(safe-area-inset-bottom))}
        .rdr-chip{display:inline-block;padding:3px 10px;border-radius:14px;font-size:12px;font-weight:700;color:#fff;font-family:'Outfit',sans-serif;letter-spacing:0.03em;text-transform:uppercase}
        .rdr-title{font-family:'Outfit',sans-serif;font-size:25px;font-weight:900;color:#eef1f6;line-height:1.16;letter-spacing:-0.02em;margin:0 0 8px;display:block}
        a.rdr-title-link{text-decoration:none}
        a.rdr-title-link:active{opacity:0.7}
        .rdr-meta{font-size:14px;font-weight:600;color:rgba(255,255,255,0.64);margin:0 0 12px}
        .rdr-excerpt{font-size:16px;line-height:1.62;color:rgba(255,255,255,0.88);margin:0}
        /* Lineup „pill'ės" — naudojamos footer'io konteksto eilutėje */
        .rdr-lineup-item{display:inline-flex;align-items:center;gap:7px;padding:4px 12px 4px 4px;border-radius:999px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);text-decoration:none;flex-shrink:0}
        .rdr-lineup-item img,.rdr-lineup-ph{width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--accent-orange);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:12px;text-transform:uppercase}
        .rdr-lineup-item span:last-child{font-size:14px;font-weight:700;color:#eef1f6;white-space:nowrap}
        .hp-reels.light .rdr-lineup-item{background:var(--bg-hover);border-color:var(--border-default)}
        .hp-reels.light .rdr-lineup-item span:last-child{color:var(--text-primary)}
        .rdr-html{font-size:16px;line-height:1.66;color:rgba(255,255,255,0.88)}
        .rdr-html p{margin:0 0 14px}
        .rdr-html a{color:#fb923c;text-decoration:underline}
        .rdr-html .news-source{display:none}
        .rdr-html h2,.rdr-html h3{font-family:'Outfit',sans-serif;color:#eef1f6;font-size:20px;margin:20px 0 8px;line-height:1.2}
        .rdr-html img{max-width:100%;height:auto;border-radius:12px;margin:12px 0;display:block}
        .rdr-html iframe{max-width:100%;border-radius:12px;margin:12px 0}
        .rdr-html ul,.rdr-html ol{padding-left:20px;margin:0 0 14px}
        .rdr-html blockquote{border-left:3px solid var(--accent-orange);padding-left:14px;margin:0 0 14px;color:rgba(255,255,255,0.7);font-style:italic}
        .rdr-toplist-wrap .rdr-html{margin-bottom:14px}
        .rdr-toplist{display:flex;flex-direction:column;gap:15px;margin:4px 0}
        .rdr-top-item{display:flex;gap:11px;align-items:flex-start}
        .rdr-top-rank{flex-shrink:0;width:26px;height:26px;border-radius:8px;background:rgba(249,115,22,0.22);color:#fb923c;font-family:'Outfit',sans-serif;font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center;margin-top:1px}
        .rdr-top-cover{flex-shrink:0;width:56px;height:56px;border-radius:10px;object-fit:cover;display:block}
        .rdr-top-ph{background:rgba(255,255,255,0.08)}
        .rdr-top-info{min-width:0;flex:1}
        .rdr-top-title{margin:0;font-family:'Outfit',sans-serif;font-weight:800;font-size:16px;color:#eef1f6;line-height:1.25}
        .rdr-top-artist{font-weight:600;color:rgba(255,255,255,0.72)}
        .rdr-top-comment{margin:5px 0 0;font-size:14px;line-height:1.5;color:rgba(255,255,255,0.8)}
        .rdr-outro{margin-top:20px}
        .rdr-outro a{display:flex;align-items:center;gap:9px;color:#fff;text-decoration:none;margin:0 0 9px;font-size:14px}
        .rdr-outro .bp-enrich-thumb{width:38px;height:38px;border-radius:8px;object-fit:cover;margin:0;flex-shrink:0}
        .rdr-author{font-size:14px;font-weight:700;color:rgba(255,255,255,0.72);margin:14px 0 0}
        .rdr-load{display:flex;flex-direction:column;gap:10px;margin-top:4px}
        .rdr-load span{height:13px;border-radius:6px;background:linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.13),rgba(255,255,255,0.06));background-size:200% 100%;animation:rdr-sk 1.2s infinite}
        .rdr-load span:nth-child(1){width:100%}.rdr-load span:nth-child(2){width:92%}.rdr-load span:nth-child(3){width:68%}
        @keyframes rdr-sk{0%{background-position:200% 0}100%{background-position:-200% 0}}

        /* Chart sąrašas */
        .rdr-chart{display:flex;flex-direction:column;gap:8px;margin:4px 0 16px}
        .rdr-chart-row{display:flex;align-items:center;gap:10px}
        .rdr-chart-pos{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:22px;text-align:center;font-family:'Outfit',sans-serif;font-weight:900;font-size:16px;color:var(--accent-orange);flex-shrink:0;line-height:1}
        /* Pozicijos pokytis: ▲n / ▼n / = / N (naujokas) */
        .rdr-trend{font-style:normal;font-size:12px;font-weight:800;letter-spacing:0;line-height:1}
        .rdr-trend.up{color:#22c55e}
        .rdr-trend.down{color:#ef4444}
        .rdr-trend.same{color:rgba(255,255,255,0.35)}
        .rdr-trend.new{color:#fb923c}
        .hp-reels.light .rdr-trend.same{color:var(--text-muted)}
        .rdr-chart-row img,.rdr-chart-ph{width:42px;height:42px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#1a1a1a}
        .rdr-chart-info{display:flex;flex-direction:column;min-width:0;flex:1}
        .rdr-chart-info b{font-size:14px;font-weight:700;color:#eef1f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-chart-info i{font-size:12px;font-style:normal;color:rgba(255,255,255,0.64);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

        /* Inline topas (balsavimas + grojimas) */
        .rdr-cvl{display:flex;flex-direction:column;gap:9px;margin:4px 0 12px}
        .rdr-cvl-head{font-family:'Outfit',sans-serif;font-size:12px;font-weight:800;letter-spacing:0.04em;color:rgba(255,255,255,0.55);text-transform:uppercase}
        .rdr-cvl-cover{position:relative;width:42px;height:42px;border-radius:8px;overflow:hidden;flex-shrink:0;border:none;padding:0;background:#1a1a1a;cursor:pointer}
        .rdr-cvl-cover img{width:100%;height:100%;object-fit:cover;display:block}
        .rdr-cvl-cover:disabled{cursor:default}
        .rdr-cvl-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.32)}
        .rdr-cvl-vote{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:38px;height:38px;border-radius:50%;border:1.5px solid var(--accent-orange);background:transparent;color:var(--accent-orange);font-family:'Outfit',sans-serif;cursor:pointer;transition:transform .12s,background .15s}
        .rdr-cvl-vote.voted{background:var(--accent-orange);color:#fff}
        .rdr-cvl-vote:disabled{opacity:0.5}
        .rdr-cvl-vote:active:not(:disabled){transform:scale(0.9)}
        .rdr-cvl-mine{font-size:16px;font-weight:900}

        /* ── „Muzika" sekcija — standartiniai YouTube embed'ai po tekstu (16/9,
           užapvalinti). Grojimą paleidžia pats YouTube — jokio custom UI.
           Antraštė tik kai yra TIKRAS dainos pavadinimas. ── */
        .rdr-embeds{display:flex;flex-direction:column;gap:10px;margin:20px 0 0}
        /* Dienos daina widget'as reader'yje */
        .rdr-dd{margin:14px 0 0}
        /* Social embed'ai (Instagram/X/TikTok) — oficialūs widget'ai; centruojam,
           ribojam plotį kad tilptų reader'yje, balta IG kortelė turi savo foną. */
        .rdr-social{display:flex;flex-direction:column;align-items:center;gap:16px;margin:20px 0 0}
        .rdr-social>div{width:100%;max-width:400px}
        .rdr-social iframe{max-width:100%!important}
        .rdr-social .instagram-media,.rdr-social .twitter-tweet,.rdr-social .tiktok-embed{margin:0 auto!important;max-width:100%!important;min-width:0!important}
        /* Nuotraukų galerija — thumbnail juostelė ANT hero (overlay apačioje) */
        .rdr-gal-strip{position:absolute;left:0;right:0;bottom:10px;z-index:3;display:flex;gap:6px;padding:0 12px}
        .rdr-gal-thumb{position:relative;width:52px;height:52px;flex-shrink:0;border-radius:9px;overflow:hidden;border:2px solid rgba(255,255,255,0.9);background:rgba(0,0,0,0.35);padding:0;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.5)}
        .rdr-gal-thumb img{width:100%;height:100%;object-fit:cover;display:block}
        .rdr-gal-more{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.58);color:#fff;font-family:'Outfit',sans-serif;font-weight:800;font-size:15px}
        .rdr-gal-lb{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.94);display:flex;align-items:center;justify-content:center;padding:24px}
        .rdr-gal-lb-img{max-width:96vw;max-height:86vh;object-fit:contain;border-radius:8px}
        .rdr-gal-x{position:absolute;top:16px;right:16px;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,0.14);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
        .rdr-gal-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,0.14);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
        .rdr-gal-nav.prev{left:10px}
        .rdr-gal-nav.next{right:10px}
        .rdr-gal-cap{position:absolute;left:0;right:0;bottom:52px;margin:0 auto;max-width:90vw;text-align:center;color:#fff;font-size:13px;font-family:'Outfit',sans-serif;padding:0 16px}
        .rdr-gal-credit{color:rgba(255,255,255,0.55);font-size:12px}
        .rdr-gal-count{position:absolute;bottom:20px;left:0;right:0;text-align:center;color:rgba(255,255,255,0.7);font-size:13px;font-weight:700;font-family:'Outfit',sans-serif}
        .rdr-embeds-head{font-family:'Outfit',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.08em;color:rgba(255,255,255,0.6);text-transform:uppercase}
        .rdr-embed-cap{margin:0 0 5px;font-size:14px;font-weight:600;color:rgba(255,255,255,0.74);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-embed-frame{position:relative;width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000}
        .rdr-embed-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}

        /* Dienos dainos kandidatai */
        .rdr-dc{display:flex;flex-direction:column;gap:9px;margin:4px 0 12px}
        .rdr-dc-row{display:flex;align-items:center;gap:10px;padding:7px;border-radius:12px;background:rgba(255,255,255,0.04)}
        .rdr-dc-row.lead{background:rgba(245,158,11,0.13);border:1px solid rgba(245,158,11,0.3)}
        .rdr-dc-rank{width:18px;text-align:center;font-family:'Outfit',sans-serif;font-weight:900;font-size:14px;color:#f59e0b;flex-shrink:0}
        .rdr-dc-info{display:flex;flex-direction:column;min-width:0;flex:1;gap:3px}
        .rdr-dc-info b{font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-dc-info i{font-size:12px;font-style:normal;color:rgba(255,255,255,0.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-dc-bar{display:flex;gap:3px;margin-top:1px}
        .rdr-dc-bar span{width:13px;height:3px;border-radius:2px;background:rgba(255,255,255,0.18)}
        .rdr-dc-bar span.on{background:#f59e0b}
        .rdr-dc-vote{width:40px;height:40px;flex-shrink:0;border-radius:11px;background:rgba(245,158,11,0.14);border:1px solid rgba(245,158,11,0.32);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .12s}
        .rdr-dc-vote:disabled{cursor:default}
        .rdr-dc-vote.on{background:rgba(245,158,11,0.06)}
        .rdr-dc-vote:active:not(:disabled){transform:scale(0.92)}
        .rdr-dc-suggest{display:block;text-align:center;margin-top:4px;padding:12px;border-radius:12px;background:#f59e0b;color:#fff;font-family:'Outfit',sans-serif;font-size:14px;font-weight:800;text-decoration:none}
        .rdr-dc-empty{display:flex;flex-direction:column;gap:12px;padding:8px 0}
        .rdr-dc-empty p{font-size:16px;font-weight:600;color:rgba(255,255,255,0.85);margin:0}

        /* ── Vieningas kortelės pabaigos blokas (footer) — vienas konteineris:
           konteksto eilutė (atlikėjas/lineup + ♥), skirtukas, veiksmų eilutė
           (pilno pločio CTA + „Bilietai"). Scrollinasi su turiniu. ── */
        .rdr-foot{margin:20px 0 0;border-radius:18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);overflow:hidden}
        .rdr-foot-ctx{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 10px}
        .rdr-foot-artist{display:inline-flex;align-items:center;gap:8px;text-decoration:none;min-width:0;flex:1}
        .rdr-foot-artist img,.rdr-foot-ph{width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--accent-orange);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;text-transform:uppercase}
        .rdr-foot-artist span{font-size:14px;font-weight:700;color:#eef1f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rdr-foot-lineup{display:flex;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:none;min-width:0;flex:1}
        .rdr-foot-lineup::-webkit-scrollbar{display:none}
        .rdr-foot-div{height:1px;background:rgba(255,255,255,0.08)}
        .rdr-foot-actions{display:flex;gap:8px;padding:10px}
        .rdr-foot-cta{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;height:48px;border-radius:12px;background:var(--accent-orange);color:#fff;font-family:'Outfit',sans-serif;font-size:16px;font-weight:800;letter-spacing:-0.01em;text-decoration:none;min-width:0}
        .rdr-foot-cta:active{opacity:0.85}
        .rdr-foot-ticket{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:48px;border-radius:12px;background:transparent;border:1px solid rgba(255,255,255,0.25);color:#fff;font-family:'Outfit',sans-serif;font-size:14px;font-weight:800;text-decoration:none;min-width:0}

        /* Progreso juostelės + kontrolės */
        .rdr-bars{position:fixed;top:12px;left:14px;right:54px;z-index:312;display:flex;gap:4px;align-items:center;pointer-events:none}
        .rdr-bar{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,0.22);overflow:hidden}
        .rdr-close{position:fixed;top:9px;right:14px;z-index:312;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)}
        .rdr-uptop{position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:312;display:flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;color:#fff;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);border-radius:50%;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
        .rdr-uptop:active{transform:translateX(-50%) scale(0.9)}
        .rdr-nav{position:fixed;top:50%;transform:translateY(-50%);z-index:308;width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:24px;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
        .rdr-nav-l{left:12px}.rdr-nav-r{right:12px}
        @media(min-width:900px){.rdr-nav{display:flex}.rdr-media,.rdr-content{max-width:560px;margin-left:auto;margin-right:auto}}
        /* Vienkartinis swipe hint — dešinės briaunos chevron + tekstas, pulsuoja */
        /* Hint — ANT foto srities (viršuje), ne ant teksto (~hero vidurys) */
        .rdr-hint{position:fixed;right:16px;top:25%;transform:translateY(-50%);z-index:320;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:auto;animation:rdrHintFade .3s ease}
        .rdr-hint-chev{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;backdrop-filter:blur(8px);box-shadow:0 6px 20px rgba(0,0,0,0.4);animation:rdrHintSwipe 1.25s ease-in-out infinite}
        .rdr-hint-txt{font-family:'Outfit',sans-serif;font-size:12px;font-weight:800;color:#fff;background:rgba(0,0,0,0.6);padding:5px 10px;border-radius:999px;backdrop-filter:blur(8px);white-space:nowrap;letter-spacing:.01em}
        @keyframes rdrHintSwipe{0%,100%{transform:translateX(6px)}50%{transform:translateX(-8px)}}
        @keyframes rdrHintFade{from{opacity:0}to{opacity:1}}
`
