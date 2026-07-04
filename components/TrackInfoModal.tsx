'use client'

// components/TrackInfoModal.tsx
//
// Bendras dainos modalas — naudojamas IR artist page'e (app/atlikejai/[slug]/
// artist-profile-client.tsx), IR homepage'e (per components/HomeTrackModal.tsx
// wrapper'į). Anksčiau homepage turėjo atskirą lengvą HomeTrackModal kopiją,
// kuri vizualiai ir funkciškai nukrypdavo (pvz. nerodydavo realių like'ų).
// Dabar vienas šaltinis — visi pakeitimai galioja abiejose vietose.
//
// Artist-context props (activeTrackId, playing, onPrevTrack/onNextTrack,
// artistTracks, onSelectTrack) yra optional — homepage'as jų neperduoda.

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { LikePill } from '@/components/LikePill'
import { SharePill } from '@/components/SharePill'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import LyricsWithReactions from '@/components/LyricsWithReactions'
import { proxyImg } from '@/lib/img-proxy'
import { formatArtistList } from '@/lib/format-artists'

/** Modalo track tipas — pakankamas laukų rinkinys. Artist page perduoda savo
 *  pilną Track (struktūriškai assignable), homepage — per /api/tracks/[id]
 *  užpildytą objektą (žr. HomeTrackModal). */
export type ModalTrack = {
  id: number
  title: string
  slug?: string | null
  type?: string
  video_url?: string | null
  cover_url?: string | null
  release_year?: number | null
  release_month?: number | null
  release_date?: string | null
  duration?: number | string | null
  lyrics?: string | null
  like_count?: number | null
  featuring?: Array<{ id: number; slug: string; name: string }>
  albums?: any[]
  spotify_id?: string | null
}

const yt = (u?: string | null) => {
  if (!u) return null
  const m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

// Aprašymai saugomi kaip HTML — paverčiam į švarų tekstą (paragrafai → lūžiai).
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

/** Format track duration as "m:ss". Accepts integer seconds or "mm:ss" strings. */
function fmtDur(d: number | string | null | undefined): string | null {
  if (d == null) return null
  if (typeof d === 'string') {
    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(d.trim())) return d.trim()
    const n = Number(d)
    if (!isFinite(n) || n <= 0) return null
    d = n
  }
  if (typeof d !== 'number' || !isFinite(d) || d <= 0) return null
  const s = Math.round(d)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function TrackInfoModal({
  track, artistName, artistSlug, artistThumbUrl, onClose,
  activeTrackId, playing,
  onMobileInlineChange,
  onPrevTrack, onNextTrack, onDockedPlayerChange,
  artistTracks, onSelectTrack,
}: {
  track: ModalTrack | null; artistName: string; artistSlug: string
  /** Artist'o profilio nuotrauka headeryje šalia title + name. */
  artistThumbUrl?: string | null
  onClose: () => void
  /** Legacy props — play/pause control moved to YouTube iframe native UI.
   *  Accepted but unused to avoid breaking call sites mid-refactor. */
  onPlay?: (t: any) => void
  onPause?: () => void
  activeTrackId?: number | null
  playing?: boolean
  /** Fires when the modal owns an inline mobile player (mobile only). Parent
   *  uses this to suppress the hero player iframe so audio doesn't double up. */
  onMobileInlineChange?: (active: boolean) => void
  /** Navigate to previous/next track with video. Parent computes order from
   *  its full tracks list. Passed null when no neighbor available. */
  onPrevTrack?: (() => void) | null
  onNextTrack?: (() => void) | null
  /** Fires when the modal renders a docked player on desktop (≥1280px) —
   *  parent suppresses the hero player to avoid duplicate audio. */
  onDockedPlayerChange?: (active: boolean) => void
  /** All artist tracks — naudojam dock'e kaip "Daugiau iš {atlikėjo}"
   *  rekomendacijų sąrašą. Modal'as pats filtruoja ir surūšiuoja. */
  artistTracks?: any[]
  /** Direct switch to any track — naudojam kai useris paspaudžia
   *  dock'o "panašios dainos" sąrašo įrašą. */
  onSelectTrack?: (t: any) => void
}) {
  // (removed: `mounted` state + rAF entrance animation — replaced with
  //  always-visible aside. Reason: opacity-0 + translate-y-full initial state
  //  could get stuck on iOS Safari if rAF/setMounted didn't propagate, leaving
  //  user with backdrop-blur but invisible aside.)
  // Like — PERSISTINAMAS per /api/tracks/[id]/like (kaip track puslapyje ir
  // albumo modale). Anksčiau buvo tik vizualus toggle be persist'o.
  const [selfLiked, setSelfLiked] = useState(false)
  const [likePending, setLikePending] = useState(false)
  // Server count — kai GET sync grąžina, naudojam jį vietoj track.like_count.
  const [serverLikeCount, setServerLikeCount] = useState<number | null>(null)
  // Likers modal valdymas — atidarymas iš LikePill onOpenModal callback'o.
  const [likersOpen, setLikersOpen] = useState(false)
  const [likersUsers, setLikersUsers] = useState<Array<{ user_username: string; user_rank: string | null; user_avatar_url: string | null }> | null>(null)
  // Mobile tab — split-column layout netelpa siaurame ekrane (lyrics +
  // komentarai vienu metu uždusina abu, scroll'ai painiojasi). Mobile'e
  // rodom tik VIENĄ skiltį per kartą su tab toggle viršuje.
  const [mobileTab, setMobileTab] = useState<'lyrics' | 'comments'>('lyrics')
  // Comment count emitted from EntityCommentsBlock — pajamas mobile tab chip.
  const [commentTotal, setCommentTotal] = useState(0)
  // Mobile inline player. Mobile'e modal'as fullscreen → hero player'is
  // (desktop dešiniajame stulpelyje) lieka uz nugaros, useris nemato. Vietoj
  // hero, mobile'e renderinam inline iframe modal'o body top'e. Parent
  // pranešam per `onMobileInlineChange`, kad jis suppress'intų hero — kitaip
  // audio dvigubintų.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 1023px)')
    setIsMobile(m.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  // Cross-artist „Susijusi muzika" — fetch'inam iš /api/tracks/[id]/related
  // (co-like + YT populiarumas + substyle peers; ŽR. lib/related-tracks.ts).
  // Suvienodinta su standalone dainos puslapiu — KITŲ atlikėjų panašios dainos.
  const [related, setRelated] = useState<Array<{ id: number; slug: string; title: string; video_url: string | null; artistSlug: string; artistName: string }>>([])
  useEffect(() => {
    const tid = track?.id
    if (!tid) { setRelated([]); return }
    let cancelled = false
    setRelated([])
    fetch(`/api/tracks/${tid}/related`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setRelated(d.related || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [track?.id])
  // Mobile'e modal'o iframe'as visada matomas (kai track turi video) — tai
  // suppress'inam hero player'į kad audio nedvigubėtų. Desktop'e flag false
  // (hero player'is veikia normaliai šalia modal'o).
  const trackVid = yt(track?.video_url || null)
  // (Dock mode pašalintas — visi viewport'ai naudoja standard modal.)
  // onDockedPlayerChange visad fire'inamas false, kad parent suppression
  // logic'as nelaužtųsi. onMobileInlineChange dabar pažymi kai modal'o
  // VIDEO TOGGLE įjungtas (cross-viewport) — declared žemiau, todėl
  // effect yra dar žemiau (po showVideo state'o).
  useEffect(() => {
    onDockedPlayerChange?.(false)
    return () => onDockedPlayerChange?.(false)
  }, [onDockedPlayerChange])
  // userNavigated — true po pirmo prev/next click'o. Naudojam tam, kad
  // pradinio modal'o atidarymo metu iframe nepradėtų groti automatiškai
  // (autoplay=0), o tik kai useris aktyviai pereina į kitą dainą — gestūra
  // → autoplay=1, naršyklė leidžia. Reset'inam kai modal'as užda (track=null).
  const [userNavigated, setUserNavigated] = useState(false)
  useEffect(() => { if (!track) setUserNavigated(false) }, [track])

  // Ref body scroll container'ui — scroll position reset'ui kai tab keičiasi.
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  // Ref iframe'ui — naudojam postMessage'ą trigger'inti playVideo iš user gesture.
  // Anksčiau iframe key=trackVid + autoplay=1 — bet kai kuriose Safari versijose
  // autoplay neveikia despite user gesture. postMessage('playVideo') via
  // YouTube IFrame API yra patikimas būdas — iframe jau load'inta, click → play.
  const videoIframeRef = useRef<HTMLIFrameElement>(null)
  // videoStarted — false default, rodom thumbnail + orange play overlay.
  // Click → įjungiam autoplay (iframe remount su &autoplay=1) + paslepiam overlay.
  const [videoStarted, setVideoStarted] = useState(false)
  // playToken — bump'inamas kiekvienam „leisti"; įeina į iframe key → priverstinis
  // remount su &autoplay=1. Patikima vietoj postMessage (kuriam reikia onReady).
  const [playToken, setPlayToken] = useState(0)

  // Reset scroll position kai user perjungia tab — naujas tab visada start'uoja viršuje.
  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ top: 0 })
  }, [mobileTab])

  // Notify parent SUPPRESS hero player tik kai modal video AKTYVIAI groja.
  // Default modal open + thumbnail showing → hero gali toliau groti (audio +
  // matosi pro lighter desktop backdrop). Tik kai user paspaudžia modal'o
  // orange play → setVideoStarted(true) → onMobileInlineChange(true) →
  // hero pause'inamas (kad audio nedvigubėtų).
  useEffect(() => {
    onMobileInlineChange?.(!!(trackVid && videoStarted))
    return () => onMobileInlineChange?.(false)
  }, [trackVid, videoStarted, onMobileInlineChange])

  useEffect(() => {
    if (!track) return
    // Escape key handler.
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', h)
    // Body scroll lock — position:fixed pattern (iOS-safe). Plain overflow:hidden
    // ant body'o neveikia patikimai iOS Safari'e — kai modal'as portaled į body,
    // jis pats sukuria scrollable area aukščiau body'o limito. position:fixed
    // pin'ina body į dabartinę scrollY poziciją.
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    // Per-track state reset.
    setSelfLiked(false)
    setServerLikeCount(null)
    setMobileTab('lyrics')
    setVideoStarted(false)
    setPlayToken(0)
    return () => {
      window.removeEventListener('keydown', h)
      // Atstatom body į normalų state ir grąžinam į prieš tai buvusią scroll poziciją.
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id])

  // Atidaryti likers modal'ą — fetch'inam list'ą per /api/likes/track/{id}
  useEffect(() => {
    if (!likersOpen || !track) { setLikersUsers(null); return }
    setLikersUsers(null)
    fetch(`/api/likes/track/${track.id}`)
      .then(r => r.json())
      .then(d => setLikersUsers(d.users || []))
      .catch(() => setLikersUsers([]))
  }, [likersOpen, track?.id])

  // Like sync — ar šis vartotojas jau like'inęs + tikras count.
  useEffect(() => {
    if (!track) return
    let cancelled = false
    fetch(`/api/tracks/${track.id}/like`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (typeof d.liked === 'boolean') setSelfLiked(d.liked)
        if (typeof d.count === 'number') setServerLikeCount(d.count)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [track?.id])

  // Sesija — reikia teksto pasiūlymo formai (tik prisijungę gali siūlyti).
  const { data: authSession } = useSession()
  const isLoggedIn = !!authSession?.user

  // (Atlikėjo info kortelė pašalinta iš modalo — po video rodom tik susijusią
  //  muziką + albumą, suvienodinta su dainos puslapiu. Tad artistDesc/genres/
  //  altPhoto fetch'as nebereikalingas.)

  // ── Teksto pasiūlymas (kai dainos teksto nėra) ──────────────────────────────
  const [lyricsDraft, setLyricsDraft] = useState('')
  const [lyricsSubmitting, setLyricsSubmitting] = useState(false)
  const [lyricsSubmitted, setLyricsSubmitted] = useState(false)
  const [lyricsErr, setLyricsErr] = useState('')
  useEffect(() => { setLyricsDraft(''); setLyricsSubmitted(false); setLyricsErr('') }, [track?.id])
  const submitLyrics = async () => {
    if (!track || lyricsSubmitting) return
    const text = lyricsDraft.trim()
    if (!text) { setLyricsErr('Įrašyk tekstą'); return }
    setLyricsSubmitting(true); setLyricsErr('')
    try {
      const res = await fetch(`/api/tracks/${track.id}/suggest-lyrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: text }),
      })
      const d = await res.json()
      if (!res.ok) { setLyricsErr(d.error || 'Nepavyko išsiųsti'); setLyricsSubmitting(false); return }
      setLyricsSubmitted(true)
    } catch { setLyricsErr('Tinklo klaida') }
    setLyricsSubmitting(false)
  }

  const onToggleLike = async () => {
    if (likePending || !track) return
    setLikePending(true)
    const prev = selfLiked
    setSelfLiked(!prev)
    setServerLikeCount(c => (c ?? (typeof track.like_count === 'number' ? track.like_count : 0)) + (prev ? -1 : 1))
    try {
      const res = await fetch(`/api/tracks/${track.id}/like`, { method: 'POST' })
      const d = await res.json()
      if (typeof d.liked === 'boolean') setSelfLiked(d.liked)
      if (typeof d.count === 'number') setServerLikeCount(d.count)
    } catch {
      setSelfLiked(prev)
      setServerLikeCount(c => (c ?? 0) - (prev ? -1 : 1))
    } finally {
      setLikePending(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  // ── ⋯ veiksmų meniu (Pasirinkti Dienos daina / nuotaikos daina) — toks pat
  // kaip standalone dainos puslapyje. ─────────────────────────────────────────
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
  useEffect(() => { if (!menuMsg) return; const t = setTimeout(() => setMenuMsg(null), 3500); return () => clearTimeout(t) }, [menuMsg])
  useEffect(() => { setMenuOpen(false); setMenuMsg(null) }, [track?.id])

  const nominateDienosDaina = async () => {
    if (menuBusy || !track) return
    if (!isLoggedIn) { setMenuOpen(false); setMenuMsg({ ok: false, text: 'Prisijunk, kad pasirinktum dienos dainą.' }); return }
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
  const makeMoodSong = async () => {
    if (menuBusy || !track) return
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

  if (!track) return null
  // createPortal lower down needs document.body — bail on SSR.
  if (typeof document === 'undefined') return null

  const dur = fmtDur(track.duration)
  const year = track.release_year || (track.release_date ? new Date(track.release_date).getFullYear() : null)
  // Tikslesnė LT data, kai turim mėnesį/dieną — singlams ji rodoma
  // orange spalva (pabrėžimas), kitiems — tik metai muted.
  const ltMonths = ['sausio','vasario','kovo','balandžio','gegužės','birželio','liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']
  const fullDate = track.release_date
    ? (() => { const d = new Date(track.release_date!); return isNaN(d.getTime()) ? null : `${d.getFullYear()} m. ${ltMonths[d.getMonth()]} ${d.getDate()} d.` })()
    : (track.release_year && track.release_month ? `${track.release_year} m. ${ltMonths[track.release_month - 1]} mėn.` : null)
  // Fallback į albumo metus — daugumai dainų tikslios datos DB nėra, bet albumas
  // dažnai turi metus (pvz. „ARIRANG 2026 m.").
  const albumYear = (track.albums || [])[0]?.year || null
  const dateLabel = fullDate || (year ? `${year} m.` : (albumYear ? `${albumYear} m.` : null))
  // serverLikeCount (sync'intas iš /api/tracks/[id]/like) jau įskaito visus
  // like'us, įskaitant šio user'io — fallback į track.like_count kol kraunasi.
  const likes = serverLikeCount ?? (typeof track.like_count === 'number' ? track.like_count : 0)
  const lyrics = (track.lyrics || '').trim()
  const lyricsText = lyrics ? lyrics.replace(/<[^>]+>/g, '').trim() : null
  const trackHref = `/dainos/${artistSlug}-${track.slug}-${track.id}`
  // Side-video iframe disabled for now — duplicating the YouTube embed
  // (one in hero, one in modal area) caused two audio streams to play
  // and the second iframe's teardown threw NotFoundError when the user
  // hit pause. Hero player handles playback; modal stays on lyrics +
  // comments. Future: portal hero player into a modal-aware container
  // instead of duplicating.

  // ── Likers Modal (shared between dock + standard) ──────────────────
  const LikersOverlay = likersOpen ? (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={() => setLikersOpen(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-[520px] overflow-auto rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="font-['Outfit',sans-serif] text-[16px] font-extrabold">
            Dainą mėgstantys nariai
            {likersUsers && <span className="ml-2 text-[14px] text-[var(--text-muted)]">({likersUsers.length})</span>}
          </div>
          <button
            onClick={() => setLikersOpen(false)}
            aria-label="Uždaryti"
            className="text-[20px] text-[var(--text-muted)]"
          >✕</button>
        </div>
        <div className="px-4 py-3">
          {likersUsers === null ? (
            <div className="py-7 text-center text-[14px] text-[var(--text-faint)]">Kraunama…</div>
          ) : likersUsers.length === 0 ? (
            <div className="py-7 text-center text-[14px] text-[var(--text-faint)]">Nėra žinomų užliejusių (likers nebuvo importuoti)</div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
              {likersUsers.map(u => (
                <div key={u.user_username} className="flex items-center gap-2 rounded-lg bg-[var(--card-hover)] p-1.5">
                  {u.user_avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(u.user_avatar_url)} alt="" className="h-[26px] w-[26px] flex-shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-[rgba(99,102,241,0.18)] font-['Outfit',sans-serif] text-[12px] font-bold text-[#818cf8]">
                      {u.user_username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold text-[var(--text-primary)]">{u.user_username}</div>
                    {u.user_rank && <div className="truncate text-[12px] text-[var(--text-faint)]">{u.user_rank}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null

  // (Removed: separate dock mode for ≥1280px. Reason: useriai sakė, kad
  //  full-screen dock layout atrodė kaip page'as, ne modalas. Dabar visi
  //  viewport'ai naudoja standard modal — bottom sheet mobile, centered
  //  card desktop. Vienodas elgesys = bulletproof, vienodi mental model.)

  // ════════════════════════════════════════════════════════════════════
  // STANDARD MODAL — mobile bottom sheet + desktop centered card.
  // KEY FIX: aside turi FIXED aukštį (h-[90vh]/h-[85vh]) ir overflow-hidden.
  // Anksčiau max-h be overflow-hidden — content galėjo overflow, aside neturėjo
  // griežto bounding box, body flex-1 min-h-0 neturėjo aiškios space'o.
  // Dabar:
  //   • aside h-[90vh] sm:h-[85vh] = griežtas aukštis
  //   • aside overflow-hidden = vaikai negali iškritti
  //   • visi vaikai išskyrus body — shrink-0 (header, meta, player, tabs)
  //   • body = flex-1 min-h-0 = užima likusią aukštį, leidžia shrink'intis
  //   • body vaikai (lyrics/comments cols) — overflow-y-auto kiekvienas
  // Mobile useris paskrolint gali lyrics text'ą lengvai.
  // ════════════════════════════════════════════════════════════════════
  return createPortal(
    <div
      className={[
        'fixed inset-0 z-[9999] flex items-end justify-center backdrop-blur-sm sm:items-center',
        // Backdrop dimming: stiprus mobile (focus modal), švelnesnis desktop'e
        // (kad user'is matytų artist'o page'ą + hero player'į pro modal'ą).
        'bg-black/60 sm:bg-black/30',
      ].join(' ')}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      {/* ════════════════════════════════════════════════════════════════
          STANDARD MODAL ASIDE — bulletproof scroll-everywhere approach.

          Filosofija:
          • max-h-[90vh] (NE fixed h-[90vh]) — modal'as user-content-sized,
            nesistengia užimti pilnos 90vh kai content trumpas. Tai elgesys,
            kurio user'is tikisi — small content → small modal.
          • overflow-hidden ant aside (kad rounded corner'iai apkirptų vaikus).
          • Header'is + meta + mobile player + tabs — visi shrink-0, sticky'ish
            viršuje. Niekada nedingsta — visada matomi.
          • Body — VIENA scroll kolona (overflow-y-auto). VISKAS body'je
            scroll'inasi kartu — be nested scroll'ų, be flex-row split'ų.
          • Mobile tabs perjungia lyrics ↔ komentarai TAME PAČIAME body'je.
            Desktop ≤lg taip pat — vienodas elgesys, nesusiveda į edge case'us.
          • Wide desktop (≥lg) su lyrics → split UI gyvena tik dock mode'e
            (≥1280px). Ten useris turi pakankamai vietos pilnam takeover'iui.
          • overscroll-contain — iOS Safari'e nepralaužia į body scroll. */}
      <aside
        role="dialog"
        aria-label={`Apie dainą ${track.title}`}
        onClick={(e) => e.stopPropagation()}
        className={[
          'flex w-full flex-col overflow-hidden bg-[var(--bg-surface)] shadow-[0_24px_60px_-10px_rgba(0,0,0,0.5)]',
          // FIXED height (NE max-h) — kad content swap (tab perjungimas)
          // neresize'intų modal'o. User'is mato stabilią modal box dimension'ą.
          'h-[90vh] rounded-t-2xl',
          'sm:h-[85vh] sm:rounded-2xl sm:mx-4 sm:max-w-[960px] lg:max-w-[1040px]',
        ].join(' ')}
      >
        {/* Mobile handle bar */}
        <div className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--border-default)]" />
        </div>

        {/* Header — thumb + title + artist + data. Like/Dalintis perkelti į dešinę
            koloną (prie komentarų). Albumas rodomas žemiau kairėje, tad iš
            header'io pašalintas (nebesikartoja). */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5">
          {artistThumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(artistThumbUrl)}
              alt={artistName}
              referrerPolicy="no-referrer"
              style={{ objectPosition: 'center top' }}
              className="h-[52px] w-[52px] shrink-0 rounded-xl border border-[var(--border-subtle)] object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-['Outfit',sans-serif] text-[16px] font-extrabold leading-tight text-[var(--text-primary)]">
              {track.title}
            </div>
            <div className="truncate text-[14px] leading-tight">
              {formatArtistList(
                { id: -1, slug: artistSlug, name: artistName },
                track.featuring || [],
              )}
            </div>
            {/* Data PO atlikėjo (kaip albumuose) + trukmė. */}
            {(dateLabel || dur) && (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[14px] text-[var(--text-muted)]">
                {dateLabel && (
                  <span className="font-['Outfit',sans-serif] font-semibold text-[var(--text-secondary)]">{dateLabel}</span>
                )}
                {dur && (
                  <>
                    {dateLabel && <span className="text-[var(--text-faint)]">·</span>}
                    <span className="font-['Outfit',sans-serif] font-semibold tabular-nums text-[var(--text-muted)]">{dur}</span>
                  </>
                )}
              </div>
            )}
          </div>
          {track.spotify_id && (
            <a
              href={`https://open.spotify.com/track/${track.spotify_id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Klausyti Spotify"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#1DB954] transition-opacity hover:opacity-80"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
            </a>
          )}
          <Link
            href={trackHref}
            target="_blank"
            rel="noopener"
            title="Atidaryti dainos puslapį naujame lange"
            aria-label="Atidaryti dainos puslapį"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 5v14h14v-6" />
            </svg>
          </Link>
          <button
            onClick={handleClose}
            aria-label="Uždaryti"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* ── Content — side-by-side on md+, stacked on mobile ── */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Left — video + daugiau */}
          <div className="shrink-0 md:w-[55%] md:flex md:flex-col">
            <div className="shrink-0 border-b border-[var(--border-subtle)] md:border-b-0">
              <div className="relative aspect-video w-full overflow-hidden bg-black">
                {trackVid ? (
                  <>
                    <iframe
                      ref={videoIframeRef}
                      key={`modal-video-${trackVid}-${videoStarted ? playToken : 'idle'}`}
                      src={`https://www.youtube.com/embed/${trackVid}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1${videoStarted ? '&autoplay=1' : ''}&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}`}
                      title={`${track.title} — ${artistName}`}
                      className="absolute inset-0 h-full w-full"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                      allowFullScreen
                      onLoad={(e) => {
                        // Naršyklė autoplay leidžia tik MUTE — todėl po įkrovimo per
                        // YouTube IFrame API atsukam garsą (unMute) + užtikrinam play.
                        // Keli bandymai, nes player'is gali būti dar ne „ready".
                        if (!videoStarted) return
                        const w = (e.currentTarget as HTMLIFrameElement).contentWindow
                        if (!w) return
                        const cmd = (func: string) => { try { w.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube.com') } catch {} }
                        ;[0, 250, 700, 1500].forEach(d => setTimeout(() => { cmd('unMute'); cmd('playVideo') }, d))
                      }}
                    />
                    {!videoStarted && (
                      <button
                        type="button"
                        onClick={() => {
                          setVideoStarted(true)
                          setPlayToken(t => t + 1)
                        }}
                        aria-label={`Leisti ${track.title} vaizdo įrašą`}
                        className="group absolute inset-0 block h-full w-full overflow-hidden"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://i.ytimg.com/vi/${trackVid}/hqdefault.jpg`}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/40" />
                        <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-[3px] ring-white/15 transition-transform group-hover:scale-110 sm:h-14 sm:w-14">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[12px] uppercase tracking-wider text-[var(--text-faint)]">
                    Vaizdo įrašo nėra
                  </div>
                )}
              </div>
            </div>
            {/* Left column extras — desktop only: atlikėjo kortelė + albumas
                (vietoj atlikėjo aprašymo) + „Daugiau / atlikėjas" žema juostelė.
                Suvienodinta su albumo modalo struktūra. */}
            {(() => {
              const primaryAlbum = (track.albums || [])[0]
              return (
                <div className="hidden md:flex flex-1 min-h-0 flex-col gap-2.5 overflow-y-auto px-3 py-3">
                  {/* Albumas, iš kurio daina — PIRMA (suvienodinta su standalone
                      dainos puslapiu; anksčiau buvo po pasiūlymais). */}
                  {primaryAlbum && (
                    <Link
                      href={`/albumai/${artistSlug}-${primaryAlbum.slug}-${primaryAlbum.id}`}
                      target="_blank"
                      rel="noopener"
                      title={primaryAlbum.title}
                      className="group flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-2.5 no-underline transition-colors hover:border-[var(--border-strong)]"
                    >
                      <span className="h-[54px] w-[54px] shrink-0 overflow-hidden rounded-lg bg-[var(--cover-placeholder)]">
                        {primaryAlbum.cover_image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proxyImg(primaryAlbum.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-muted)]">Iš albumo</div>
                        <div className="truncate font-['Outfit',sans-serif] text-[16px] font-extrabold leading-tight text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{primaryAlbum.title}</div>
                        {primaryAlbum.year && (
                          <div className="text-[14px] font-semibold text-[var(--text-muted)]">{primaryAlbum.year} m.</div>
                        )}
                      </div>
                      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--text-faint)] transition-colors group-hover:text-[var(--accent-orange)]">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </Link>
                  )}
                  {/* Susijusi muzika — KITŲ atlikėjų panašios dainos (cross-artist).
                      Kortelėje rodom dainos pavadinimą IR atlikėją. */}
                  {related.length > 0 && (
                    <div>
                      <div className="mb-2 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Susijusi muzika
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {related.map((t) => {
                          const tvid = yt(t.video_url)
                          return (
                            <Link
                              key={t.id}
                              href={`/dainos/${t.artistSlug}-${t.slug}-${t.id}`}
                              title={`${t.title} — ${t.artistName}`}
                              className="group flex items-center gap-2 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1 text-left no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                            >
                              <span className="aspect-video h-9 shrink-0 overflow-hidden rounded bg-black">
                                {tvid && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={`https://i.ytimg.com/vi/${tvid}/mqdefault.jpg`} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-['Outfit',sans-serif] text-[16px] font-extrabold leading-tight text-[var(--text-primary)]">{t.title}</span>
                                <span className="block truncate font-['Outfit',sans-serif] text-[12px] font-semibold text-[var(--text-faint)]">{t.artistName}</span>
                              </span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Right — tabs (Tekstas / Komentarai) + Patinka/Dalintis + content */}
          <div className="flex-1 min-h-0 flex flex-col md:border-l md:border-[var(--border-subtle)]">
            {/* Tabs — VISADA rodom (net kai teksto nėra — kad būtų galima pasiūlyti).
                Dešinėje: Patinka + Dalintis (perkelta iš header'io, abu size sm). */}
            <div className="flex shrink-0 items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-1.5">
              <button
                type="button"
                onClick={() => setMobileTab('lyrics')}
                className={[
                  "relative flex items-center gap-1.5 px-1 py-1 font-['Outfit',sans-serif] text-[14px] font-bold transition-colors",
                  mobileTab === 'lyrics'
                    ? 'text-[var(--accent-orange)]'
                    : 'text-[var(--text-muted)]',
                ].join(' ')}
              >
                Tekstas
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('comments')}
                className={[
                  "relative flex items-center gap-1.5 px-1 py-1 font-['Outfit',sans-serif] text-[14px] font-bold transition-colors",
                  mobileTab === 'comments'
                    ? 'text-[var(--accent-orange)]'
                    : 'text-[var(--text-muted)]',
                ].join(' ')}
              >
                <span>Komentarai</span>
                {commentTotal > 0 && (
                  <span className="rounded-full bg-[var(--accent-orange)] px-1.5 py-px text-[12px] font-extrabold leading-none text-white">
                    {commentTotal}
                  </span>
                )}
              </button>
              <div className="ml-auto flex items-center gap-1.5">
                <LikePill
                  likes={likes}
                  selfLiked={selfLiked}
                  onToggle={onToggleLike}
                  pending={likePending}
                  onOpenModal={() => setLikersOpen(true)}
                  variant="surface"
                  size="sm"
                />
                <SharePill title={`${track.title} — ${artistName}`} url={trackHref} size="sm" />
                {/* ⋯ veiksmų meniu — toks pat kaip dainos puslapyje. */}
                <div ref={menuRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setMenuOpen(v => !v)}
                    aria-label="Daugiau veiksmų"
                    title="Daugiau veiksmų"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
                    </svg>
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-9 z-[60] w-60 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] py-1 shadow-[0_18px_40px_-10px_rgba(0,0,0,0.5)]">
                      <button
                        type="button"
                        onClick={nominateDienosDaina}
                        disabled={menuBusy}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--card-hover)] disabled:opacity-50"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--accent-orange)]">
                          <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                        </svg>
                        Pasirinkti Dienos daina
                      </button>
                      <button
                        type="button"
                        onClick={makeMoodSong}
                        disabled={menuBusy}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--card-hover)] disabled:opacity-50"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--text-muted)]">
                          <path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
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
                'shrink-0 px-4 py-2 text-center font-["Outfit",sans-serif] text-[14px] font-bold',
                menuMsg.ok ? 'bg-[rgba(34,197,94,0.12)] text-[#16a34a]' : 'bg-[rgba(239,68,68,0.10)] text-[#dc2626]',
              ].join(' ')}>
                {menuMsg.text}
              </div>
            )}
            {/* Scrollable body */}
            <div ref={bodyScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
              <div className={mobileTab === 'lyrics' ? 'block' : 'hidden'}>
                {lyricsText ? (
                  <>
                    <div className="mb-4 flex items-baseline gap-2">
                      <div className="font-['Outfit',sans-serif] text-[16px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Dainos tekstas
                      </div>
                      <span className="font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-wider text-[var(--accent-orange)]">
                        pažymėk → reaguok
                      </span>
                    </div>
                    <LyricsWithReactions trackId={track.id} lyrics={lyricsText} compact />
                  </>
                ) : lyricsSubmitted ? (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-8 text-center">
                    <div className="text-[16px] font-extrabold text-[var(--text-primary)]">Ačiū! Tekstas išsiųstas peržiūrai.</div>
                    <div className="mt-1 text-[14px] text-[var(--text-muted)]">Administratoriui patvirtinus, jis atsiras čia.</div>
                  </div>
                ) : isLoggedIn ? (
                  <div>
                    <div className="mb-3 font-['Outfit',sans-serif] text-[16px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Dainos tekstas
                    </div>
                    <p className="mb-2 text-[14px] leading-[1.5] text-[var(--text-muted)]">
                      Šios dainos teksto dar nėra. Žinai jį? Pasiūlyk — administratorius peržiūrės ir paskelbs.
                    </p>
                    <textarea
                      value={lyricsDraft}
                      onChange={e => setLyricsDraft(e.target.value)}
                      rows={10}
                      placeholder="Įrašyk dainos tekstą…"
                      className="w-full resize-y rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[14px] leading-[1.6] text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)]"
                    />
                    {lyricsErr && <div className="mt-1 text-[14px] font-semibold text-red-500">{lyricsErr}</div>}
                    <button
                      type="button"
                      onClick={submitLyrics}
                      disabled={lyricsSubmitting}
                      className="mt-2 rounded-xl bg-[var(--accent-orange)] px-4 py-2 font-['Outfit',sans-serif] text-[16px] font-extrabold text-white disabled:opacity-50"
                    >
                      {lyricsSubmitting ? 'Siunčiama…' : 'Pasiūlyti tekstą'}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-8 text-center">
                    <div className="text-[16px] font-extrabold text-[var(--text-primary)]">Šios dainos teksto dar nėra</div>
                    <p className="mt-1 text-[14px] text-[var(--text-muted)]">Prisijunk, kad galėtum pasiūlyti tekstą.</p>
                    <Link href="/auth/signin" className="mt-3 inline-block rounded-xl bg-[var(--accent-orange)] px-4 py-2 font-['Outfit',sans-serif] text-[16px] font-extrabold text-white no-underline">Prisijungti</Link>
                  </div>
                )}
                {/* Susijusi muzika — mobile (cross-artist, kaip desktop'e).
                    Po tekstu/įvedimu, scroll'inasi kartu su turiniu. */}
                {related.length > 0 && (
                  <div className="mt-5 border-t border-[var(--border-subtle)] pt-3 md:hidden">
                    <div className="mb-2 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Susijusi muzika
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                      {related.map((t) => {
                        const tvid = yt(t.video_url)
                        return (
                          <Link
                            key={t.id}
                            href={`/dainos/${t.artistSlug}-${t.slug}-${t.id}`}
                            title={`${t.title} — ${t.artistName}`}
                            className="block w-[124px] shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
                          >
                            <span className="block aspect-video w-full overflow-hidden rounded bg-black">
                              {tvid && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={`https://i.ytimg.com/vi/${tvid}/mqdefault.jpg`} alt=""
                                  referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                              )}
                            </span>
                            <span className="block truncate px-1 pt-1 text-left font-['Outfit',sans-serif] text-[12px] font-extrabold text-[var(--text-primary)]">
                              {t.title}
                            </span>
                            <span className="block truncate px-1 pb-0.5 text-left font-['Outfit',sans-serif] text-[12px] font-semibold text-[var(--text-faint)]">
                              {t.artistName}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className={mobileTab === 'comments' ? 'block' : 'hidden'}>
                <EntityCommentsBlock
                  entityType="track"
                  entityId={track.id}
                  compact
                  title="Komentarai"
                  onCountChange={setCommentTotal}
                />
              </div>
            </div>
          </div>
        </div>

      </aside>

      {LikersOverlay}
    </div>,
    document.body,
  )
}
