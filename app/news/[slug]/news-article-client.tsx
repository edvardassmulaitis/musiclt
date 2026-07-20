'use client'
// app/news/[slug]/news-article-client.tsx
//
// 2026-06-18 redesign v2: hero suvienodintas su artist page, „Susijusi muzika"
// player'is pakeistas į identišką artist-page player'io layout'ą/stilių.
// Naudoja realius temos token'us (light+dark). Hero band visada tamsus.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import LikesModal, { type LikeUser } from '@/components/LikesModal'
import { HomeTrackModal } from '@/components/HomeTrackModal'

/* ─── Types ──────────────────────────────────────────────────────────────── */
type Photo     = { url: string; caption?: string; source?: string }
type NewsEmbed = { url: string; type?: string; embedUrl?: string | null; thumbnailUrl?: string | null; title?: string | null }
type SongEntry = { id?: number; song_id?: number | null; title: string; artist_name: string; youtube_url: string; cover_url?: string }
type ArtistRef = { id: number; name: string; cover_image_url?: string }
type NewsItem  = {
  id: number; title: string; slug: string; body: string; type: string
  source_url?: string; source_name?: string; published_at: string
  image_small_url?: string; gallery?: Photo[]; embeds?: NewsEmbed[]
  heroCredit?: { author: string; license: string; url: string } | null
  artist?:  { id: number; name: string; cover_image_url?: string; photos?: any[] }
  artist2?: { id: number; name: string; cover_image_url?: string } | null
  artists?: ArtistRef[]
}
type RelatedNews = { id: number; title: string; slug: string; image_small_url?: string; published_at: string; type: string }

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function ytId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}
function formatDate(d: string) {
  try { return new Date(d).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' }) }
  catch { return d }
}

function ytThumbId(url?: string | null) {
  if (!url) return null
  const m = url.match(/(?:i\.ytimg\.com|img\.youtube\.com)\/vi\/([\w-]+)/)
  return m ? m[1] : null
}

/* Deterministinė (be fetch'o) Wikimedia/Wikipedia File: puslapio nuoroda. */
function commonsFilePage(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(/upload\.wikimedia\.org\/wikipedia\/([a-z-]+)\/[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)$/i)
  if (!m) return null
  const host = m[1].toLowerCase() === 'commons' ? 'commons.wikimedia.org' : `${m[1].toLowerCase()}.wikipedia.org`
  return `https://${host}/wiki/File:${m[2]}`
}

/* ─── Photo credit / source badge ──────────────────────────────────────────
   Maža © ikona ant nuotraukos; hover/tap atskleidžia šaltinį. Wiki nuotraukai —
   realus autorius (iš `credit`, paimto iš Wikimedia) + nuoroda į PAČIĄ
   nuotrauką (File: puslapį). YouTube kadrui — nuoroda į dainą. */
function PhotoCredit({ url, source, credit }: {
  url?: string | null
  source?: string | null
  credit?: { author: string; license: string; url: string } | null
}) {
  const [open, setOpen] = useState(false)
  // Užsidaro paspaudus šalia arba Escape (hook'ai VISADA prieš early return).
  useEffect(() => {
    if (!open) return
    const onDoc = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  if (!url) return null

  const ytVid = ytThumbId(url)
  const wikiPage = commonsFilePage(url) || (credit?.url || null)
  const isWiki = !!commonsFilePage(url) || /wikimedia\.org|wikipedia\.org/i.test(url)
  let label = ''
  let href: string | null = null
  if (ytVid) {
    label = 'YouTube kadras'; href = `https://www.youtube.com/watch?v=${ytVid}`
  } else if (credit && (credit.author || credit.url)) {
    // Realus autorius iš Wikimedia — „Foto: <autorius> · <licencija>"
    label = credit.author
      ? `Foto: ${credit.author}${credit.license ? ' · ' + credit.license : ''}`
      : 'Šaltinis: Wikipedia'
    href = credit.url || wikiPage
  } else if (isWiki) {
    label = 'Šaltinis: Wikipedia'; href = wikiPage
  } else if (source && /^https?:\/\//i.test(source)) {
    try { label = 'Šaltinis: ' + new URL(source).hostname.replace(/^www\./, '') } catch { label = 'Šaltinis' }
    href = source
  } else if (source) { label = 'Šaltinis: ' + source }
  else { label = '© Autorių teisės' }

  // Trumpas nuorodos tekstas modaliuke
  let linkText = 'Peržiūrėti šaltinį'
  if (ytVid) linkText = 'Žiūrėti „YouTube"'
  else if (isWiki) linkText = 'Atidaryti Wikipedia'
  else if (href) { try { linkText = new URL(href).hostname.replace(/^www\./, '') } catch { /* keep default */ } }

  const ico = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M14.6 9.4a3.5 3.5 0 1 0 0 5.2" /></svg>
  )
  // Paspaudus © NIEKADA iškart nenaviguoja — atidaro informacinį modaliuką su
  // kreditu ir (jei yra) mini nuoroda į šaltinį.
  return (
    <div className={`na-credit ${open ? 'is-open' : ''}`} onClick={(e) => e.stopPropagation()}>
      <button
        className="na-credit-btn"
        type="button"
        aria-label="Nuotraukos informacija"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
      >
        {ico}
      </button>
      {open && (
        <div className="na-credit-pop" role="dialog" aria-label="Nuotraukos šaltinis">
          <span className="na-credit-pop-label">{label}</span>
          {href && (
            <a className="na-credit-pop-link" href={href} target="_blank" rel="noopener noreferrer">
              {linkText} <span aria-hidden>↗</span>
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── News article like button ───────────────────────────────────────────── */
function NewsLikeButton({ newsId }: { newsId: number }) {
  const { data: session } = useSession()
  const [count, setCount] = useState(0)
  const [liked, setLiked] = useState(false)
  const [likers, setLikers] = useState<LikeUser[]>([])
  const [modalOpen, setModalOpen] = useState(false)

  const refreshLikers = () => {
    fetch(`/api/likes/news/${newsId}`)
      .then(r => r.json())
      .then(d => {
        const users: LikeUser[] = d.users || []
        setCount(d.count || 0)
        setLikers(users)
        const myUsername = (session?.user as any)?.name || (session?.user as any)?.email
        if (myUsername) {
          setLiked(users.some(u => (u.user_username || '').toLowerCase() === myUsername.toLowerCase()))
        } else setLiked(false)
      })
      .catch(() => {})
  }

  useEffect(() => {
    refreshLikers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsId, session?.user])

  async function toggleLike() {
    if (!session?.user) return
    const next = !liked
    setLiked(next)
    setCount(c => next ? c + 1 : Math.max(0, c - 1))
    try { await fetch(`/api/news/${newsId}/like`, { method: 'POST' }); refreshLikers() } catch {}
  }

  return (
    <>
      <button
        type="button"
        onClick={session?.user ? toggleLike : undefined}
        className={`na-act ${liked ? 'na-act-liked' : ''}`}
        style={{ cursor: session?.user ? 'pointer' : 'not-allowed' }}
        title={session?.user ? (liked ? 'Nebepatinka' : 'Patinka') : 'Prisijunk, kad pamėgtum'}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        {count > 0 && (
          <span onClick={e => { e.stopPropagation(); setModalOpen(true) }} className="na-act-count" title="Pamatyti kas paspaudė">
            {count}
          </span>
        )}
      </button>
      <LikesModal open={modalOpen} onClose={() => setModalOpen(false)} title="Patinka" count={count} users={likers} />
    </>
  )
}

/* ─── Share (copy link) button ───────────────────────────────────────────── */
function ShareButton() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="na-act"
      onClick={() => navigator.clipboard.writeText(location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })}
      title="Kopijuoti nuorodą"
    >
      {copied
        ? <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5"/></svg>Nuoroda nukopijuota</>
        : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51 8.59 10.49"/></svg>Dalintis</>
      }
    </button>
  )
}

/* ─── Music Player — IDENTIŠKAS artist-page player'iui ───────────────────── */
/* Be „Susijusi muzika" header'io. Player area (thumbnail + corner play btn,
   embeddable preflight → „Žiūrėti YouTube'e" fallback) + švarus track sąrašas
   (numeris + pavadinimas/atlikėjas + play). Stilius — Tailwind, lygiai kaip
   atlikejai/[slug] PlayerCard. */
function MusicPlayer({ songs }: { songs: SongEntry[] }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [modalTrack, setModalTrack] = useState<any | null>(null)
  const [playing, setPlaying]     = useState(false)
  const [thumbAlive, setThumbAlive] = useState<boolean | null>(null)
  const [embedDisabled, setEmbedDisabled] = useState<Set<string>>(new Set())
  const [apiReady, setApiReady] = useState(false)

  const cur = songs[activeIdx]
  const vid = ytId(cur?.youtube_url)
  const hq  = vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : null
  const showThumb = thumbAlive === true && !!hq
  const isBlocked = !!vid && embedDisabled.has(vid)

  // YT IFrame API refs — kaip atlikėjo psl. PlayerCard. Būtina 1-tap-su-garsu
  // grojimui iOS'e (playVideo() gesture'e; plain iframe autoplay iOS'e blokuojamas).
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<any>(null)
  const playingRef = useRef(playing)
  useEffect(() => { playingRef.current = playing }, [playing])

  useEffect(() => {
    if (!vid) { setThumbAlive(null); return }
    setThumbAlive(null)
    const img = new window.Image()
    img.onload  = () => setThumbAlive(img.naturalWidth >= 200)
    img.onerror = () => setThumbAlive(false)
    img.src = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
  }, [vid])

  useEffect(() => {
    if (!vid || embedDisabled.has(vid)) return
    let cancelled = false
    fetch(`/api/yt/embeddable?videoId=${encodeURIComponent(vid)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d && d.embeddable === false) setEmbedDisabled(s => { const n = new Set(s); n.add(vid); return n }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [vid]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load YT IFrame API script kartą.
  useEffect(() => {
    const W = window as any
    if (W.YT && W.YT.Player) { setApiReady(true); return }
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script')
      s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    }
    const prev = W.onYouTubeIframeAPIReady
    W.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); setApiReady(true) }
    const iv = window.setInterval(() => { if (W.YT && W.YT.Player) { setApiReady(true); window.clearInterval(iv) } }, 120)
    return () => window.clearInterval(iv)
  }, [])

  // PRE-CREATE cued (autoplay=0) player kai tik turim vid → READY dar prieš tap'ą.
  // Grojam SINKRONIŠKAI tap handler'yje (play()) → playVideo gesture → 1 tap su garsu.
  useEffect(() => {
    const W = window as any
    if (!apiReady || !vid || !containerRef.current) return
    if (isBlocked) return
    if (playerRef.current) return // sukurta kartą; track switch'ai per loadVideoById
    const inner = document.createElement('div')
    inner.style.width = '100%'; inner.style.height = '100%'
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(inner)
    const player = new W.YT.Player(inner, {
      host: 'https://www.youtube-nocookie.com', // Safari ITP-safe (Klaida 153)
      videoId: vid, width: '100%', height: '100%',
      playerVars: { autoplay: 0, controls: 1, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, enablejsapi: 1, origin: window.location.origin },
      events: {
        onReady: (e: any) => { if (playingRef.current) { try { e.target.playVideo() } catch {} } },
        onError: (e: any) => {
          const c = e?.data
          if (c === 101 || c === 150 || c === 153) {
            const vn = (player as any)._vid || vid
            setEmbedDisabled(s => { if (s.has(vn)) return s; const n = new Set(s); n.add(vn); return n })
            try { playerRef.current?.destroy() } catch {}
            playerRef.current = null
            try { if (containerRef.current) containerRef.current.innerHTML = '' } catch {}
          }
        },
      },
    })
    ;(player as any)._vid = vid
    playerRef.current = player
  }, [apiReady, vid, isBlocked])

  // vid pasikeitė be gesture path'o (backup) — sinchronizuojam player'į.
  useEffect(() => {
    if (!playerRef.current || !vid) return
    if ((playerRef.current as any)._vid === vid) return
    try {
      if (playingRef.current) playerRef.current.loadVideoById?.(vid)
      else playerRef.current.cueVideoById?.(vid)
      ;(playerRef.current as any)._vid = vid
    } catch {}
  }, [vid])

  useEffect(() => () => { try { playerRef.current?.destroy() } catch {}; playerRef.current = null }, [])

  if (!songs.length) return null
  const placeholder = 'var(--player-placeholder-bg, linear-gradient(135deg, #1a2436 0%, #0f1825 50%, #0a0f1a 100%))'

  // Grojimas per user-gesture: state + play-count + SINKRONIŠKAS playVideo/loadVideoById.
  const play = (i: number) => {
    const newVid = ytId(songs[i]?.youtube_url)
    setActiveIdx(i)
    setPlaying(true)
    const sid = songs[i]?.song_id
    if (sid) { try { fetch(`/api/tracks/${sid}/play`, { method: 'POST', keepalive: true }).catch(() => {}) } catch {} }
    const p = playerRef.current
    if (p && newVid) {
      try {
        if ((p as any)._vid !== newVid) { p.loadVideoById(newVid); (p as any)._vid = newVid }
        else p.playVideo()
      } catch {}
    }
  }

  return (
    <>
    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)]">
      {/* Player area — YT.Player įdedamas į stabilų containerRef; play overlay ant viršaus kol negroja */}
      <div className="relative aspect-video w-full max-w-full overflow-hidden bg-black">
        {vid ? (
          <>
            {/* YT.Player target — React-owned, visada mount'intas kai yra vid; hidden kol negroja/blocked */}
            <div ref={containerRef} className={`absolute inset-0 h-full w-full ${(!playing || isBlocked) ? 'hidden' : ''}`} />
            {!playing && !isBlocked && (
              <button
                type="button"
                onClick={() => play(activeIdx)}
                aria-label="Paleisti"
                className="group absolute inset-0 block cursor-pointer overflow-hidden border-0 p-0"
                style={{ background: placeholder }}
              >
                {showThumb && (
                  <img src={hq!} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" style={{ filter: 'saturate(1.1) contrast(1.05)' }} />
                )}
                {showThumb && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/30" />}
                <span className="absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-[3px] ring-white/15 transition-transform duration-200 group-hover:scale-110 sm:h-14 sm:w-14">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden className="ml-0.5"><path d="M8 5v14l11-7z" /></svg>
                </span>
              </button>
            )}
            {isBlocked && (
              <a href={`https://www.youtube.com/watch?v=${vid}`} target="_blank" rel="noopener noreferrer"
                className="absolute inset-0 flex items-center justify-center overflow-hidden no-underline">
                {showThumb && <img src={hq!} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/45" />
                <span className="relative z-10 flex flex-col items-center gap-2.5 px-6 text-center text-white">
                  <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-red-600 shadow-[0_10px_36px_rgba(0,0,0,0.5)] ring-[5px] ring-white/10">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="#fff" aria-hidden><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                  </span>
                  <span className="text-[14px] font-semibold">Žiūrėti YouTube'e</span>
                </span>
              </a>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-6 text-center" style={{ background: placeholder }}>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
            </span>
            <span className="font-['Outfit',sans-serif] text-[16px] font-extrabold uppercase tracking-[0.15em] text-white/60">Video dar nėra</span>
          </div>
        )}
      </div>

      {/* Track list */}
      <ul className="max-h-[320px] divide-y divide-[var(--border-subtle)] overflow-y-auto bg-[var(--bg-surface)]">
        {songs.map((s, i) => {
          const v = ytId(s.youtube_url)
          const isActive = i === activeIdx
          return (
            <li key={i}>
              <div
                onClick={() => v && play(i)}
                role={v ? 'button' : undefined}
                tabIndex={v ? 0 : undefined}
                onKeyDown={(e) => { if (v && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); play(i) } }}
                aria-label={v ? `Leisti ${s.title}` : `${s.title} — video nėra`}
                className={[
                  'flex w-full items-center gap-2 px-3 py-2 transition-colors',
                  isActive ? 'bg-[rgba(249,115,22,0.08)]' : 'hover:bg-[var(--bg-hover)]',
                  v ? 'cursor-pointer' : '',
                ].join(' ')}
              >
                <span className={['w-5 shrink-0 text-center font-["Outfit",sans-serif] text-[14px] font-bold tabular-nums', isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]'].join(' ')} aria-hidden>
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col items-start">
                  <span className={['w-full truncate font-["Outfit",sans-serif] text-[14px] font-bold leading-tight', isActive ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]'].join(' ')}>
                    {s.title}
                  </span>
                  {s.artist_name && <span className="w-full truncate text-[14px] text-[var(--text-muted)]">{s.artist_name}</span>}
                </div>
                {s.song_id ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setModalTrack({ id: s.song_id, title: s.title, cover_url: s.cover_url, video_url: s.youtube_url, artist_name: s.artist_name }) }}
                    aria-label={`${s.title} — daugiau informacijos`}
                    title="Daugiau: žodžiai, komentarai, video"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-orange)] hover:bg-[rgba(249,115,22,0.1)] hover:text-[var(--accent-orange)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                      <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
                    </svg>
                  </button>
                ) : null}
                <button
                  onClick={(e) => { e.stopPropagation(); if (v) play(i) }}
                  disabled={!v}
                  aria-label={!v ? 'Video nėra' : `Leisti ${s.title}`}
                  className={[
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                    v ? (isActive
                      ? 'bg-[var(--accent-orange)] text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]'
                      : 'bg-[var(--card-bg)] text-[var(--text-primary)] hover:bg-[var(--accent-orange)] hover:text-white')
                      : 'cursor-default bg-transparent text-[var(--text-faint)] opacity-50',
                  ].join(' ')}
                >
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
    <HomeTrackModal track={modalTrack} onClose={() => setModalTrack(null)} />
    </>
  )
}

/* ─── Embedded media (real iframes, teksto pabaigoje) ────────────────────────
   YT/Spotify/SoundCloud realūs grotuvai — ne thumbnail'ai. embedUrl pirmas;
   jei nėra (Instagram/X/Bandcamp) — rodom nuorodos kortelę. */
function embedSrc(e: NewsEmbed): string | null {
  if (e.embedUrl) return e.embedUrl
  const v = ytId(e.url) || (e.url.match(/youtube\.com\/shorts\/([\w-]{11})/)?.[1] ?? null)
  if (v) return `https://www.youtube.com/embed/${v}`
  return null
}
function NewsEmbeds({ embeds }: { embeds: NewsEmbed[] }) {
  if (!embeds.length) return null
  return (
    <div className="na-embeds">
      {embeds.map((e, i) => {
        const src = embedSrc(e)
        const t = (e.type || '').toLowerCase()
        const isAudio = t.startsWith('spotify') || t === 'soundcloud'
        // Video (16:9) = YouTube/Vimeo. Social (Instagram/X/TikTok/FB) yra
        // portretiniai/aukšti — jiems NEtaikom 16:9, kitaip apačia nukerpama.
        const isVideoEmbed = /youtube|youtu\.be|vimeo/.test(t) || /youtube\.com\/embed|player\.vimeo/.test(src || '')
        const isSocial = !isAudio && !isVideoEmbed
        if (!src) {
          return (
            <a key={i} href={e.url} target="_blank" rel="noopener noreferrer" className="na-embed-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span>{e.title || e.url}</span>
            </a>
          )
        }
        return (
          <div key={i} className={isAudio ? 'na-embed na-embed-audio' : isSocial ? 'na-embed na-embed-social' : 'na-embed'}>
            <iframe
              src={src}
              loading="lazy"
              scrolling="no"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              title={e.title || 'Įterptas vaizdo įrašas'}
            />
          </div>
        )
      })}
    </div>
  )
}

/* ─── Photo Gallery ──────────────────────────────────────────────────────── */
/* Vienas foto → blur-fill + object-contain (rodo VISĄ kadrą, be nukirpimo,
   kaip artist page galerija). Keli — mozaikinis cover grid'as. */
function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [lb, setLb]           = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  if (!photos.length) return null

  const single = photos.length === 1
  const PREVIEW = 5
  const shown   = showAll ? photos : photos.slice(0, PREVIEW)
  const hidden  = photos.length - PREVIEW

  return (
    <>
      <div className="pg-wrap">
        <div className="pg-divider">
          <div className="pg-divider-line" />
          <span className="pg-divider-label">Galerija · {photos.length} nuotr.</span>
          <div className="pg-divider-line" />
        </div>

        {single ? (
          <div className="pg-solo" onClick={() => setLb(0)}>
            <div className="pg-solo-blur" style={{ backgroundImage: `url(${photos[0].url})` }} />
            <img src={photos[0].url} alt={photos[0].caption || ''} className="pg-solo-img" />
            <PhotoCredit url={photos[0].url} source={photos[0].source} />
          </div>
        ) : (
          <div className={`pg-grid pg-grid-${Math.min(shown.length, 5)}`}>
            {shown.map((p, i) => (
              <div key={i} className={`pg-cell pg-cell-${i}`} onClick={() => setLb(i)}>
                <img src={p.url} alt={p.caption || ''} />
                {!showAll && i === PREVIEW - 1 && hidden > 0 && (
                  <div className="pg-more" onClick={e => { e.stopPropagation(); setShowAll(true) }}>
                    <span>+{hidden}</span>
                    <small>nuotraukos</small>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {lb !== null && (
        <div className="lb" onClick={() => setLb(null)}>
          <button className="lb-close" onClick={e => { e.stopPropagation(); setLb(null) }}>✕</button>
          {photos.length > 1 && <button className="lb-prev" onClick={e => { e.stopPropagation(); setLb(i => Math.max(0, i! - 1)) }}>‹</button>}
          <div className="lb-inner" onClick={e => e.stopPropagation()}>
            <img src={photos[lb].url} alt="" />
            {photos[lb].caption && <p className="lb-cap">{photos[lb].caption}</p>}
          </div>
          {photos.length > 1 && <button className="lb-next" onClick={e => { e.stopPropagation(); setLb(i => Math.min(photos.length - 1, i! + 1)) }}>›</button>}
          {photos.length > 1 && <div className="lb-counter">{lb + 1} / {photos.length}</div>}
        </div>
      )}
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ══════════════════════════════════════════════════════════════════════════ */
export default function NewsArticleClient({
  news, songs = [],
}: {
  news: NewsItem
  related?: RelatedNews[]   // nebenaudojamas (susijusių straipsnių skiltis pašalinta)
  songs?: SongEntry[]
}) {
  const rawHero = news.image_small_url || news.artist?.cover_image_url
  // Straipsnio hero'je rodom TIK realias nuotraukas (manual high-quality arba iš
  // Wikipedia). Jei vienintelis vizualas — embed/video thumbnail (YouTube
  // hqdefault fallback / Instagram), NErodom on-top: jis dubliuoja tai, kas jau
  // yra grotuve, ir yra žemos kokybės. (Feed'o kortelėse thumbnail lieka — kad
  // ten nebūtų tuščia.) Tokiu atveju rodom švarų tekstinį hero.
  const isEmbedThumb = !!rawHero && /(?:\.|\/\/)ytimg\.com|img\.youtube\.com|youtube\.com\/vi\/|ggpht\.com|cdninstagram\.com|fbcdn\.net/i.test(rawHero)
  const heroImg = isEmbedThumb ? undefined : rawHero
  // Hero orientacija — nustatoma kliente iš natūralių nuotraukos matmenų
  // (news lentelė nesaugo W/H). 'cine' = plati (cover kadras), 'split' = vertikali/
  // kvadratinė (rodoma visa ant blur), 'pending' = kol dar nežinom.
  const [heroOrient, setHeroOrient] = useState<'pending' | 'cine' | 'split'>('pending')
  const gallery = news.gallery || []
  const artists = (news.artists && news.artists.length > 0
    ? news.artists
    : news.artist ? [news.artist] : []) as ArtistRef[]

  // Rodom TIK dainas su realiu video embedu (ytId). Be video („Video dar nėra")
  // eilučių neberodom — jei nė viena daina neturi video, sidebar'o išvis nėra.
  const validSongs = songs.filter(s => ytId(s.youtube_url))
  const hasSidebar = validSongs.length > 0

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

        @keyframes na-in   { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
        @keyframes na-zoom { 0%{transform:scale(1.0)} 100%{transform:scale(1.06)} }

        .na-root { background:var(--bg-body); color:var(--text-primary); font-family:'DM Sans',sans-serif; -webkit-font-smoothing:antialiased; min-height:100vh; overflow-x:clip; }

        /* ══ HERO — ADAPTYVUS pagal nuotraukos orientaciją ══
           Orientacija nustatoma kliente (img.onLoad, natural W/H), nes news lentelė
           nesaugo matmenų. Aukštis rezervuojamas iškart → jokio CLS desktop'e.
             • cine  = plati (landscape) nuotrauka → PILNO PLOČIO kadras (cover),
                       antraštė ant jos. Kadangi cover kerpa — taikom TIK plačioms.
             • split = vertikali arba kvadratinė → nuotrauka rodoma VISA (contain)
                       šone ant ambient blur, antraštė greta. Niekada nekerpa
                       (albumų viršelių NEsuploja į siaurą juostą).
             • pending = kol JS dar nenustatė: rodom tik ambient blur + antraštę,
                       aštri foto paslėpta (opacity:0), kad nemirktelėtų blogas kadras. */
        .na-hero {
          position:relative; width:100%;
          min-height:340px; max-height:480px; height:46vh;
          overflow:hidden; background:#080d14;
          display:flex; align-items:flex-end;
        }
        /* Ambient fonas — TA PATI nuotrauka per visą plotį, išblukinta+patamsinta. */
        .na-hero-bg    { position:absolute; inset:0; z-index:0; background-size:cover; background-position:center 30%; filter:blur(60px) saturate(1.25) brightness(0.5); transform:scale(1.18); }
        .na-hero-scrim { position:absolute; inset:0; z-index:1; pointer-events:none; }
        .na-hero-photo { position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; }
        .na-hero-frame { position:relative; display:flex; min-width:0; min-height:0; overflow:hidden; }
        .na-hero-img   { display:block; filter:saturate(1.04) contrast(1.02); transition:opacity .35s ease; }
        .na-hero-noimg  { position:absolute; inset:0; background:linear-gradient(135deg,#0d1420 0%,#111826 100%); }
        .na-hero-noimg::after { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at 75% 40%, rgba(249,115,22,0.12) 0%, transparent 55%); }

        /* ── NOIMG: tekstinis hero (be nuotraukos). Temos-suderintas gradientas su
              akcentu → gražu ir light, ir dark; tekstas visada įskaitomas. Kompaktiškas. */
        .na-hero--noimg { min-height:0; max-height:none; height:auto; align-items:stretch; background:var(--bg-body); }
        .na-hero--noimg .na-hero-noimg { background:
            radial-gradient(115% 130% at 12% 0%, rgba(249,115,22,0.18) 0%, rgba(249,115,22,0.05) 26%, transparent 52%),
            linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-body) 100%); }
        .na-hero--noimg .na-hero-noimg::after { background:radial-gradient(ellipse at 88% 12%, rgba(249,115,22,0.10) 0%, transparent 48%); }
        .na-hero--noimg .na-hero-wrap { padding-top:42px; padding-bottom:28px; }
        .na-hero--noimg .na-h1 { color:var(--text-primary); text-shadow:none; }
        .na-hero--noimg .na-date { color:var(--text-muted); }
        .na-hero--noimg .na-meta-sep { background:var(--text-muted); }
        .na-hero--noimg .na-artpill { background:var(--bg-body); border-color:var(--border-default); }
        .na-hero--noimg .na-artpill:hover { background:var(--bg-elevated); }
        .na-hero--noimg .na-artpill span { color:var(--text-primary); }
        .na-hero--noimg .na-act { background:var(--bg-body); border-color:var(--border-default); color:var(--text-primary); }
        .na-hero--noimg .na-act:hover { background:var(--bg-elevated); }
        .na-hero--noimg .na-act-liked { color:var(--accent-orange); background:rgba(249,115,22,0.14); border-color:rgba(249,115,22,0.4); }

        /* ── PENDING: aštri foto paslėpta; scrim neutralus (kol nežinom orientacijos) ── */
        .na-hero--pending .na-hero-photo { opacity:0; }
        .na-hero--pending .na-hero-scrim{
          background:
            linear-gradient(to top, var(--bg-body) 1%, rgba(8,13,20,0.10) 42%, rgba(8,13,20,0.30) 100%),
            linear-gradient(to right, rgba(8,13,20,0.88) 0%, rgba(8,13,20,0.5) 50%, rgba(8,13,20,0.12) 82%, transparent 100%); }

        /* ── CINE (landscape): TAS PATS principas kaip SPLIT — foto dešinėje + feather
              kairėj, tekstas kairėj — TIK object-fit:cover (platus kadras užpildo panelį,
              subjektas matomas, nebeužtemdytas full-width scrim'u). ── */
        .na-hero--cine .na-hero-bg   { filter:blur(48px) saturate(1.55) brightness(0.66); transform:scale(1.25); }
        .na-hero--cine .na-hero-photo{ left:auto; right:0; width:62%; padding:0; align-items:stretch; justify-content:flex-end; }
        .na-hero--cine .na-hero-frame{ position:relative; height:100%; max-width:100%; border-radius:0; box-shadow:none; overflow:hidden; }
        .na-hero--cine .na-hero-img  { width:100%; height:100%; object-fit:cover; object-position:center;
          -webkit-mask-image:linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 14%, #000 44%);
          mask-image:linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 14%, #000 44%); }
        .na-hero--cine .na-hero-wrap { align-self:center; }
        .na-hero--cine .na-hero-inner{ max-width:560px; }
        .na-hero--cine .na-hero-scrim{
          background:
            linear-gradient(to top, var(--bg-body) 1%, transparent 52%),
            linear-gradient(to right, rgba(8,13,20,0.96) 0%, rgba(8,13,20,0.7) 32%, rgba(8,13,20,0.28) 58%, transparent 86%); }

        /* ── SPLIT (portretas/kvadratas): foto VISA dešinėje ant blur, antraštė kairėje ── */
        .na-hero--split { align-items:stretch; }
        /* Desktop split — nuotrauka rodoma VISA (contain), flush prie dešinio krašto,
           BE rėmelio. Kairysis kraštas FEATHER'inamas (mask gradientas) → aštri foto
           sklandžiai persilieja į savo pačios ambient blur → jokios kietos briaunos,
           jokio „box in box". Nekerpa (tinka portretui IR kvadratiniam albumui). */
        .na-hero--split .na-hero-bg   { filter:blur(48px) saturate(1.55) brightness(0.66); transform:scale(1.25); }
        .na-hero--split .na-hero-photo{ left:auto; right:0; width:54%; padding:0; align-items:stretch; justify-content:flex-end; }
        .na-hero--split .na-hero-frame{ height:100%; max-width:100%; border-radius:0; box-shadow:none; overflow:hidden; }
        .na-hero--split .na-hero-img  { height:100%; width:auto; max-width:100%; object-fit:contain; object-position:center;
          -webkit-mask-image:linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 12%, #000 40%);
          mask-image:linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 12%, #000 40%); }
        .na-hero--split .na-hero-wrap { align-self:center; }
        .na-hero--split .na-hero-inner{ max-width:560px; }
        .na-hero--split .na-hero-scrim{
          background:
            linear-gradient(to top, var(--bg-body) 1%, transparent 50%),
            linear-gradient(to right, rgba(8,13,20,0.96) 0%, rgba(8,13,20,0.72) 34%, rgba(8,13,20,0.3) 60%, transparent 88%); }

        .na-hero-wrap  { position:relative; z-index:3; width:100%; max-width:1240px; margin:0 auto; padding:0 28px 22px; }
        .na-hero-inner { max-width:700px; animation:na-in .7s .05s both; }
        .na-h1 { font-family:'Outfit',sans-serif; font-size:clamp(1.7rem,3.1vw,2.8rem); font-weight:900; line-height:1.06; letter-spacing:-.03em; color:#fff; margin:0 0 16px; text-shadow:0 2px 24px rgba(0,0,0,0.45); overflow-wrap:break-word; word-break:break-word; hyphens:auto; }

        /* Veiksmai VIRŠ pavadinimo */
        .na-actbar { display:flex; flex-wrap:wrap; gap:9px; margin-top:18px; }
        /* Meta po pavadinimu: data kairėje, susiję atlikėjai dešinėje */
        .na-meta { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
        .na-date { font-size:12px; color:rgba(255,255,255,0.55); font-weight:600; font-family:'Outfit',sans-serif; }
        .na-meta-sep { width:3px; height:3px; border-radius:50%; background:rgba(255,255,255,0.3); }
        .na-artbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }

        .na-artpill { display:inline-flex; align-items:center; gap:7px; background:rgba(255,255,255,0.09); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.14); border-radius:100px; padding:4px 13px 4px 4px; text-decoration:none; transition:background .2s,border-color .2s; }
        .na-artpill:hover { background:rgba(255,255,255,0.16); border-color:rgba(255,255,255,0.28); }
        .na-artpill img { width:24px; height:24px; border-radius:50%; object-fit:cover; }
        .na-artpill-av { width:24px; height:24px; border-radius:50%; background:rgba(249,115,22,0.85); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:900; color:#fff; }
        .na-artpill span { font-size:12px; font-weight:700; color:#fff; }

        .na-act { display:inline-flex; align-items:center; gap:7px; padding:7px 15px; border-radius:100px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.16); color:rgba(255,255,255,0.92); font-size:12px; font-weight:800; font-family:'Outfit',sans-serif; cursor:pointer; transition:all .18s; backdrop-filter:blur(8px); }
        .na-act:hover { background:rgba(255,255,255,0.15); border-color:rgba(255,255,255,0.3); }
        .na-act-liked { color:var(--accent-orange); background:rgba(249,115,22,0.14); border-color:rgba(249,115,22,0.4); }
        .na-act-count { margin-left:3px; padding-left:8px; border-left:1px solid rgba(255,255,255,0.22); font-weight:800; cursor:pointer; }

        /* Foto kreditas — © ženkliukas, hover atskleidžia šaltinį */
        .na-credit { position:absolute; z-index:6; bottom:12px; right:14px; }
        .na-hero--pending .na-credit { display:none; } /* kol foto paslėpta */
        /* split desktop: © ant dešinės nuotraukos apačios (photo padding ~ dešinė 40 / apačia 30) */
        .na-hero--split .na-credit { bottom:34px; right:48px; }
        .na-credit-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; padding:0; border-radius:50%; background:rgba(0,0,0,0.5); backdrop-filter:blur(6px); border:1px solid rgba(255,255,255,0.22); color:rgba(255,255,255,0.85); cursor:pointer; transition:background .2s,border-color .2s,color .2s; }
        .na-credit-btn:hover { background:rgba(0,0,0,0.78); border-color:rgba(255,255,255,0.4); color:#fff; }
        /* Informacinis modaliukas (atsidaro virš © mygtuko, visada tamsus → įskaitomas) */
        .na-credit-pop { position:absolute; bottom:36px; right:0; z-index:5; min-width:172px; max-width:250px; display:flex; flex-direction:column; gap:9px; padding:11px 13px; border-radius:12px; background:rgba(10,12,16,0.92); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.16); box-shadow:0 14px 40px -14px rgba(0,0,0,0.78); animation:na-in .16s ease both; }
        .na-credit-pop-label { color:rgba(255,255,255,0.9); font-size:12px; line-height:1.45; font-weight:600; font-family:'DM Sans',sans-serif; }
        .na-credit-pop-link { display:inline-flex; align-items:center; gap:4px; color:var(--accent-orange); font-size:12px; font-weight:800; font-family:'Outfit',sans-serif; text-decoration:none; }
        .na-credit-pop-link:hover { text-decoration:underline; }

        /* ── Page layout — platesnis player'is (420), siauresnis tekstas ── */
        .na-page { max-width:1240px; margin:0 auto; padding:0 28px; }
        .na-grid { display:grid; gap:60px; align-items:start; padding:22px 0 90px; }
        /* has-sb: kairė = straipsnis + komentarai (viena po kitos), dešinė = sticky
           player per abi eilutes. Areas leidžia mobile'e perrikiuoti į
           main → sidebar (muzika) → comments. */
        .na-grid.has-sb { grid-template-columns:minmax(0,1fr) 420px; grid-template-areas:"main sidebar" "comments sidebar"; }
        .na-grid.has-sb > .na-main    { grid-area:main; }
        .na-grid.has-sb > .na-sidebar { grid-area:sidebar; }
        .na-grid.has-sb > .na-comments{ grid-area:comments; }
        .na-grid.no-sb  { grid-template-columns:minmax(0,1fr); max-width:760px; margin:0 auto; }
        /* komentarų tarpą tvarko grid gap (ne margin) — kitaip grid'e dvigubas tarpas */
        .na-grid > .na-comments { margin-top:0; }

        /* ── Prose ── */
        .na-prose { color:var(--text-secondary); font-size:1.08rem; line-height:1.85; max-width:680px; overflow-wrap:break-word; word-break:break-word; }
        /* „pagal pirminį šaltinį" nuoroda (įdėta į body kaip .news-source) — slepiam */
        .na-prose .news-source { display:none; }
        .na-prose p  { margin-bottom:22px; }
        .na-prose a  { color:var(--accent-link); text-decoration:underline; }
        .na-prose h2 { font-family:'Outfit',sans-serif; font-size:1.5rem; font-weight:900; color:var(--text-primary); margin:40px 0 16px; letter-spacing:-.025em; }
        .na-prose h3 { font-family:'Outfit',sans-serif; font-size:1.18rem; font-weight:800; color:var(--text-primary); margin:32px 0 12px; }
        .na-prose blockquote { border-left:3px solid var(--accent-orange); padding:14px 22px; margin:32px 0; background:rgba(249,115,22,.06); border-radius:0 12px 12px 0; }
        .na-prose blockquote p { font-size:1.08rem; font-weight:700; font-style:italic; color:var(--text-primary); line-height:1.55; margin:0; }
        .na-prose ul,.na-prose ol { margin:16px 0 24px 22px; }
        .na-prose li { margin-bottom:6px; line-height:1.78; color:var(--text-secondary); }
        .na-prose strong { color:var(--text-primary); font-weight:700; }
        .na-prose img { max-width:100%; border-radius:10px; }

        /* ── Sidebar ── */
        .na-sidebar { position:sticky; top:80px; display:flex; flex-direction:column; gap:12px; }

        /* ── Gallery ── */
        .pg-wrap { margin-top:48px; }
        .pg-divider { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
        .pg-divider-line { flex:1; height:1px; background:var(--border-default); }
        .pg-divider-label { font-size:12px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--text-muted); white-space:nowrap; font-family:'Outfit',sans-serif; }
        /* Vienas foto — blur fill + contain (pilnas kadras) */
        .pg-solo { position:relative; border-radius:14px; overflow:hidden; background:#0a0f1a; aspect-ratio:16/10; max-height:560px; cursor:zoom-in; }
        .pg-solo-blur { position:absolute; inset:0; background-size:cover; background-position:center; filter:blur(34px) brightness(0.55) saturate(1.1); transform:scale(1.2); }
        .pg-solo-img { position:relative; z-index:1; width:100%; height:100%; object-fit:contain; display:block; }
        .pg-grid { display:grid; gap:3px; border-radius:12px; overflow:hidden; }
        .pg-grid-2 { grid-template-columns:1fr 1fr; }
        .pg-grid-3 { grid-template-columns:2fr 1fr; grid-template-rows:220px 170px; }
        .pg-grid-4,.pg-grid-5 { grid-template-columns:2fr 1fr 1fr; grid-template-rows:220px 170px; }
        .pg-grid-3 .pg-cell-0,.pg-grid-4 .pg-cell-0,.pg-grid-5 .pg-cell-0 { grid-row:1/3; }
        .pg-cell { position:relative; overflow:hidden; cursor:zoom-in; background:var(--bg-elevated); }
        .pg-grid-2 .pg-cell { aspect-ratio:16/9; }
        .pg-cell img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .4s; }
        .pg-cell:hover img { transform:scale(1.05); }
        .pg-more { position:absolute; inset:0; background:rgba(8,13,20,.75); backdrop-filter:blur(4px); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; cursor:pointer; }
        .pg-more span { font-size:26px; font-weight:900; color:#fff; }
        .pg-more small { font-size:12px; font-weight:600; color:rgba(255,255,255,.5); letter-spacing:.08em; text-transform:uppercase; }

        /* ── Lightbox ── */
        .lb { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.96); backdrop-filter:blur(12px); display:flex; align-items:center; justify-content:center; }
        .lb-inner { max-width:88vw; max-height:88vh; display:flex; flex-direction:column; align-items:center; }
        .lb-inner img { max-width:100%; max-height:80vh; object-fit:contain; border-radius:8px; }
        .lb-cap { font-size:12px; color:rgba(255,255,255,.4); margin-top:10px; text-align:center; }
        .lb-close { position:absolute; top:18px; right:22px; width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,.1); border:none; color:rgba(255,255,255,.7); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .lb-prev,.lb-next { position:absolute; top:50%; transform:translateY(-50%); width:52px; height:52px; border-radius:50%; background:rgba(255,255,255,.08); border:none; color:rgba(255,255,255,.7); font-size:34px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .lb-prev { left:14px; } .lb-next { right:14px; }
        .lb-counter { position:absolute; bottom:18px; left:50%; transform:translateX(-50%); font-size:12px; font-weight:600; color:rgba(255,255,255,.28); }

        /* ── Comments spacing ── */
        .na-comments { margin-top:44px; }

        /* ── Įterpti embedai (realūs grotuvai) teksto pabaigoje ── */
        .na-embeds { margin-top:32px; display:flex; flex-direction:column; gap:18px; }
        .na-embed { position:relative; width:100%; padding-bottom:56.25%; height:0; border-radius:14px; overflow:hidden; background:#000; box-shadow:0 12px 36px -16px rgba(0,0,0,0.5); }
        .na-embed iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }
        .na-embed-audio { padding-bottom:0; height:auto; background:transparent; box-shadow:none; }
        .na-embed-audio iframe { position:static; height:152px; }
        /* Social (Instagram/X/TikTok) — natūralus aukštis (portretinis), be 16:9 nukirpimo.
           Ribojam plotį ~ social embedų natūraliam pločiui, centruojam. */
        .na-embed-social { padding-bottom:0; height:auto; background:transparent; box-shadow:none; border-radius:0; display:flex; justify-content:center; overflow:visible; }
        .na-embed-social iframe { position:static; width:100%; max-width:540px; height:720px; border-radius:14px; background:#fff; box-shadow:0 12px 36px -16px rgba(0,0,0,0.5); }
        .na-embed-link { display:inline-flex; align-items:center; gap:8px; padding:12px 16px; border-radius:12px; background:var(--bg-elevated); border:1px solid var(--border-default); color:var(--accent-link); font-size:14px; font-weight:600; text-decoration:none; word-break:break-all; }
        .na-embed-link:hover { border-color:var(--accent-orange); }

        /* ── Responsive ── */
        @media(max-width:1024px){
          /* minmax(0,1fr) — NE plain 1fr: plain 1fr track'o min-width:auto neleidžia
             stulpeliui susitraukti žemiau turinio min-content, todėl platus vaikas
             (pvz. „Susijusi muzika" sh-strip) ištempdavo stulpelį >viewport ir tekstas
             būdavo nukerpamas per .na-root overflow-x:clip (be scrollo). */
          .na-grid.has-sb { grid-template-columns:minmax(0,1fr); grid-template-areas:"main" "sidebar" "comments"; }
          .na-grid.has-sb > *, .na-prose, .na-sidebar { min-width:0; }
          .na-sidebar { position:static; }
        }
        /* ── MOBILE: tas pats adaptyvus principas, tik vertikaliai ──
           CINE (landscape) → cover juosta, antraštė ant jos.
           SPLIT (portretas/kvadratas) → foto VISA viršuje ant blur, antraštė po ja.
           PENDING → rezervuojam juostą, antraštė apačioje. */
        @media(max-width:860px){
          .na-hero { height:auto; min-height:0; max-height:none; display:block; }
          .na-hero-bg, .na-hero--split .na-hero-bg { filter:blur(38px) saturate(1.5) brightness(0.6); transform:scale(1.28); }

          /* Mobile CINE — full-bleed cover juosta, antraštė apačioje (feather/right-panel
             tik desktop'e; mobile'e per siaura). */
          .na-hero--pending, .na-hero--cine { position:relative; aspect-ratio:16/10; }
          .na-hero--pending .na-hero-wrap, .na-hero--cine .na-hero-wrap { position:absolute; left:0; right:0; bottom:0; max-width:100%; align-self:auto; }
          .na-hero--cine .na-hero-inner { max-width:100%; }
          .na-hero--cine .na-hero-photo { position:absolute; inset:0; width:auto; }
          .na-hero--cine .na-hero-frame { height:100%; }
          .na-hero--cine .na-hero-img { width:100%; height:100%; object-fit:cover; object-position:center 28%; -webkit-mask-image:none; mask-image:none; }
          .na-hero--cine .na-hero-scrim { background:linear-gradient(to top, var(--bg-body) 1%, rgba(8,13,20,0.62) 10%, rgba(8,13,20,0.4) 52%, rgba(8,13,20,0.15) 78%, transparent 100%); }

          .na-hero--split { display:block; }
          .na-hero--split .na-hero-photo { position:relative; inset:auto; width:100%; padding:22px 20px 4px; justify-content:center; }
          .na-hero--split .na-hero-frame { height:auto; border-radius:14px; box-shadow:0 18px 44px -18px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.09); }
          .na-hero--split .na-hero-img { height:auto; width:auto; max-height:56vh; max-width:100%; -webkit-mask-image:none; mask-image:none; }
          .na-hero--split .na-hero-wrap { position:relative; align-self:auto; padding:12px 20px 26px; max-width:100%; }
          .na-hero--split .na-hero-inner { max-width:100%; }
          .na-hero--split .na-hero-scrim { background:linear-gradient(to bottom, transparent 28%, var(--bg-body) 100%); }
          /* Split mobile: antraštė+meta yra PO nuotrauka ant body fono — todėl
             baltas tekstas (skirtas tamsiam hero) light mode'e dingsta. Naudojam
             temos tokenus (veikia ir light, ir dark). */
          .na-hero--split .na-h1 { color:var(--text-primary); text-shadow:none; }
          .na-hero--split .na-date { color:var(--text-muted); }
          .na-hero--split .na-meta-sep { background:var(--text-muted); }
          .na-hero--split .na-artpill { background:var(--bg-elevated); border-color:var(--border-default); }
          .na-hero--split .na-artpill span { color:var(--text-primary); }
          .na-hero--split .na-artpill-av { color:#fff; }
          .na-hero--split .na-act { background:var(--bg-elevated); border-color:var(--border-default); color:var(--text-primary); }
          .na-hero--split .na-act-liked { color:var(--accent-orange); background:rgba(249,115,22,0.14); border-color:rgba(249,115,22,0.4); }
          /* split mobile: foto viršuje → © į viršų-dešinę, popover atsidaro žemyn */
          .na-hero--split .na-credit { top:30px; right:26px; bottom:auto; }
          .na-hero--split .na-credit-pop { top:38px; bottom:auto; }
        }
        @media(max-width:640px){
          .na-h1 { font-size:1.5rem; }
          .na-page { padding:0 16px; }
          .na-grid { padding:24px 0 60px; gap:30px; }
          .na-hero--split .na-hero-img { max-height:52vh; }
        }
      `}</style>

      <div className="na-root">

        {/* ══════════ HERO ══════════ */}
        <div className={`na-hero na-hero--${heroImg ? heroOrient : 'noimg'}`}>
          {heroImg ? (
            <>
              {/* Ambient blur fonas (rodomas TIK split režime — plačiam cover jo
                  nereikia). Aštri nuotrauka adaptuojasi pagal orientaciją: plati →
                  cover per visą band; vertikali/kvadratinė → rodoma visa dešinėje. */}
              <div className="na-hero-bg" style={{ backgroundImage: `url(${heroImg})` }} />
              <div className="na-hero-scrim" />
              <div className="na-hero-photo">
                <div className="na-hero-frame">
                  <img
                    src={heroImg}
                    alt=""
                    className="na-hero-img"
                    referrerPolicy="no-referrer"
                    onLoad={(e) => {
                      const im = e.currentTarget
                      if (im.naturalWidth && im.naturalHeight) {
                        // Plati (landscape) → cover; kitaip (portretas/kvadratas) → contain ant blur.
                        setHeroOrient(im.naturalWidth >= im.naturalHeight * 1.25 ? 'cine' : 'split')
                      }
                    }}
                  />
                </div>
              </div>
              {/* © kreditas — TIESIOGINIS .na-hero vaikas (ne frame'e), kad cine
                  režime nebūtų po antraštės sluoksniu (buvo nespaudžiamas + popover
                  atsidarydavo už scrim). z-index virš .na-hero-wrap. */}
              <PhotoCredit url={heroImg} source={news.source_url || news.source_name} credit={news.heroCredit} />
            </>
          ) : (
            <div className="na-hero-noimg" />
          )}

          <div className="na-hero-wrap">
            <div className="na-hero-inner">
              {/* Viskas prasideda nuo pavadinimo: title → meta (data + atlikėjai) →
                  veiksmai (patinka/dalintis) apačioje. */}
              <h1 className="na-h1">{news.title}</h1>
              <div className="na-meta">
                <span className="na-date">{formatDate(news.published_at)}</span>
                {artists.length > 0 && (
                  <>
                  <span className="na-meta-sep" />
                  <div className="na-artbar">
                    {artists.map((a, i) => (
                      <Link key={`${a.id}-${i}`} href={`/atlikejai/${a.id}`} className="na-artpill">
                        {a.cover_image_url
                          ? <img src={a.cover_image_url} alt={a.name} referrerPolicy="no-referrer" />
                          : <span className="na-artpill-av">{(a.name || '?')[0]}</span>}
                        <span>{a.name}</span>
                      </Link>
                    ))}
                  </div>
                  </>
                )}
              </div>
              <div className="na-actbar">
                <NewsLikeButton newsId={news.id} />
                <ShareButton />
              </div>
            </div>
          </div>
        </div>

        {/* ══════════ ARTICLE + SIDEBAR ══════════ */}
        <div className="na-page" id="na-article">
          <div className={`na-grid ${hasSidebar ? 'has-sb' : 'no-sb'}`}>
            <main className="na-main">
              <div className="na-prose" dangerouslySetInnerHTML={{ __html: news.body }} />
              {news.embeds && news.embeds.length > 0 && <NewsEmbeds embeds={news.embeds} />}
              {gallery.length > 0 && <PhotoGallery photos={gallery} />}
            </main>

            {hasSidebar && (
              <aside className="na-sidebar">
                <MusicPlayer songs={validSongs} />
              </aside>
            )}

            {/* Komentarai — atskiras grid item, kad mobile'e „Susijusi muzika"
                (sidebar) atsidurtų VIRŠ komentarų (grid-template-areas tvarka). */}
            <div className="na-comments">
              <EntityCommentsBlock entityType="news" entityId={news.id} title="Komentarai" skipLegacy />
            </div>
          </div>
        </div>

      </div>
    </>
  )
}


// redeploy: 20260625T120702Z
