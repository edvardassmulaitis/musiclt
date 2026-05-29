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
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { LikePill } from '@/components/LikePill'
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
}

const yt = (u?: string | null) => {
  if (!u) return null
  const m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
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
  // Local "self liked" toggle for the LikePill — track page'as pats turi pilną
  // optimistic-update logiką. Drawer'is paprastesnis: vizualus toggle, kad
  // user'is matytų reakciją; pilnas like persist'inimas vyksta track puslapyje.
  const [selfLiked, setSelfLiked] = useState(false)
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
  // Click → postMessage play + hide overlay. Iframe always-mounted (background).
  const [videoStarted, setVideoStarted] = useState(false)

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
    setMobileTab('lyrics')
    setVideoStarted(false)
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

  const handleClose = () => {
    onClose()
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
  const dateLabel = fullDate || (year ? `${year} m.` : null)
  const baseLikes = typeof track.like_count === 'number' ? track.like_count : 0
  const likes = baseLikes + (selfLiked ? 1 : 0)
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
          <div className="font-['Outfit',sans-serif] text-[13px] font-extrabold">
            Patiko dainą
            {likersUsers && <span className="ml-2 text-[11px] text-[var(--text-muted)]">({likersUsers.length})</span>}
          </div>
          <button
            onClick={() => setLikersOpen(false)}
            aria-label="Uždaryti"
            className="text-[18px] text-[var(--text-muted)]"
          >✕</button>
        </div>
        <div className="px-4 py-3">
          {likersUsers === null ? (
            <div className="py-7 text-center text-[12px] text-[var(--text-faint)]">Kraunama…</div>
          ) : likersUsers.length === 0 ? (
            <div className="py-7 text-center text-[12px] text-[var(--text-faint)]">Nėra žinomų užliejusių (likers nebuvo importuoti)</div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
              {likersUsers.map(u => (
                <div key={u.user_username} className="flex items-center gap-2 rounded-lg bg-[var(--card-hover)] p-1.5">
                  {u.user_avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(u.user_avatar_url)} alt="" className="h-[26px] w-[26px] flex-shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-[rgba(99,102,241,0.18)] font-['Outfit',sans-serif] text-[10px] font-bold text-[#818cf8]">
                      {u.user_username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-[var(--text-primary)]">{u.user_username}</div>
                    {u.user_rank && <div className="truncate text-[10px] text-[var(--text-faint)]">{u.user_rank}</div>}
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
        // Wide desktop (≥lg) — modal'as align'inamas kairiau nei center, bet
        // ne į kraštą — kad hero player'is dešinėj liktų aiškiai matomas.
        'lg:justify-start lg:pl-[10%]',
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
          'sm:h-[85vh] sm:rounded-2xl sm:mx-4 sm:max-w-[720px]',
        ].join(' ')}
      >
        {/* Mobile handle bar */}
        <div className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--border-default)]" />
        </div>

        {/* Header — thumb + title + artist + external link + close. */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-2">
          {artistThumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(artistThumbUrl)}
              alt={artistName}
              referrerPolicy="no-referrer"
              style={{ objectPosition: 'center top' }}
              className="h-9 w-9 shrink-0 rounded-lg border border-[var(--border-subtle)] object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-['Outfit',sans-serif] text-[15px] font-extrabold leading-tight text-[var(--text-primary)]">
              {track.title}
            </div>
            <div className="truncate text-[11.5px] leading-tight">
              {formatArtistList(
                { id: -1, slug: artistSlug, name: artistName },
                track.featuring || [],
              )}
            </div>
          </div>
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

        {/* Row 2: 2-col split — video LEFT (60%), meta stack RIGHT (40%).
            Video visada matomas (mažas), useris gali click'inti native play
            arba YouTube fullscreen'inti. Meta — popbar (reactions) +
            likes + data + albums vertikaliai dešinėj. */}
        {/* Mobile: video per visą plotį viršuje, meta juosta apačioje. Desktop
            (sm+): 2-stulpelių split (video 60% / meta 40%). 2026-05-29. */}
        <div className="grid shrink-0 grid-cols-1 border-b border-[var(--border-subtle)] sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Left: video.
              ARCHITEKTURA: iframe always-mounted (background) su enablejsapi=1.
              Overlay (thumbnail + orange play button) covers iframe kol
              user'is nepaspaudė. Click → postMessage('playVideo') → iframe
              start'uoja groti + overlay fade out. User gesture preserved.
              max-h apsaugo nuo per-tall video kai grid leidžia per-wide. */}
          <div className="relative aspect-video max-h-[300px] w-full overflow-hidden bg-black sm:max-h-[340px]">
            {trackVid ? (
              <>
                {/* Background iframe — always loaded so postMessage veiks be delay. */}
                <iframe
                  ref={videoIframeRef}
                  key={`modal-video-${trackVid}`}
                  src={`https://www.youtube.com/embed/${trackVid}?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}`}
                  title={`${track.title} — ${artistName}`}
                  className="absolute inset-0 h-full w-full"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
                {/* Overlay — thumbnail + orange play button. Click → postMessage play. */}
                {!videoStarted && (
                  <button
                    type="button"
                    onClick={() => {
                      setVideoStarted(true)
                      // postMessage YouTube IFrame API: trigger play. Source/target
                      // origin '*' yra OK čia, nes komandą siunčiam į mūsų pačių
                      // embed'intą iframe'ą (saugumas iframe leidžia/blokuoja).
                      videoIframeRef.current?.contentWindow?.postMessage(
                        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                        '*',
                      )
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
                    {/* Site orange play button — matchina artist page hero stilių. */}
                    <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_8px_24px_rgba(249,115,22,0.5)] ring-[3px] ring-white/15 transition-transform group-hover:scale-110 sm:h-14 sm:w-14">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </button>
                )}
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
                Vaizdo įrašo nėra
              </div>
            )}
          </div>

          {/* Right: meta stack — likes (fixed width), tarpas, data + albumai.
              items-start kad LikePill nesistretchintų per visą col plotį. */}
          <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border-subtle)] px-3 py-2.5 text-[11px] sm:flex-col sm:items-start sm:gap-1 sm:border-l sm:border-t-0 sm:px-2.5 sm:py-2">
            {/* DropBar (emoji reactions) paslėpta — re-enable kai user'iui jis taps relevant. */}
            <LikePill
              likes={likes}
              selfLiked={selfLiked}
              onToggle={() => setSelfLiked(v => !v)}
              onOpenModal={() => setLikersOpen(true)}
              variant="surface"
            />
            {dateLabel && (
              <span className="font-['Outfit',sans-serif] text-[11px] font-extrabold leading-tight text-[var(--text-primary)] sm:mt-2">
                {dateLabel}
              </span>
            )}
            {dur && (
              <span className="truncate font-['Outfit',sans-serif] text-[11px] font-bold tabular-nums text-[var(--text-muted)]">
                {dur}
              </span>
            )}
            {(track.albums || []).slice(0, 2).map((al) => (
              <Link
                key={al.id}
                href={`/lt/albumas/${al.slug}/${al.id}`}
                target="_blank"
                rel="noopener"
                title={al.title}
                className="flex min-w-0 items-center gap-1.5 no-underline"
              >
                <span className="h-5 w-5 shrink-0 overflow-hidden rounded bg-[var(--cover-placeholder)]">
                  {al.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(al.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="line-clamp-2 font-['Outfit',sans-serif] text-[10.5px] font-extrabold leading-tight text-[var(--text-secondary)]">
                  {al.title}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Tabs — tik kai lyrics yra. Visiems viewport'ams. */}
        {lyricsText && (
          <div className="flex shrink-0 items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-1.5">
            <button
              type="button"
              onClick={() => setMobileTab('lyrics')}
              className={[
                "relative flex items-center gap-1.5 px-1 py-1 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
                mobileTab === 'lyrics'
                  ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[8px] after:h-[2px] after:bg-[var(--accent-orange)]'
                  : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              Tekstas
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('comments')}
              className={[
                "relative flex items-center gap-1.5 px-1 py-1 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors",
                mobileTab === 'comments'
                  ? 'text-[var(--accent-orange)] after:absolute after:inset-x-0 after:-bottom-[8px] after:h-[2px] after:bg-[var(--accent-orange)]'
                  : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              <span>Komentarai</span>
              {commentTotal > 0 && (
                <span className="rounded-full bg-[var(--accent-orange)] px-1.5 py-px text-[10px] font-extrabold leading-none text-white">
                  {commentTotal}
                </span>
              )}
            </button>
          </div>
        )}

        {/* ── BODY — VIENA scroll kolona ─────────────────────────────────
            flex-1 min-h-0 (užima likusią vietą), overflow-y-auto (scroll'as
            čia ir tik čia), overscroll-contain (iOS Safari fix — scroll'as
            neprasprūsta į pagrindinį page'ą). Vidus — jokio kito overflow,
            jokios flex tricks, tik content stack'as.

            Kas matoma:
            • Jei lyrics yra IR mobileTab='lyrics' → lyrics
            • Jei lyrics yra IR mobileTab='comments' → komentarai
            • Jei lyrics nėra → komentarai (visada).
            Vienoda taisyklė visiems viewport'ams = bulletproof. */}
        <div ref={bodyScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
          {/* Lyrics — always mounted (rodom/slepiam pagal tab), kad
              reactions counts būtų laiku užkrauti. */}
          {lyricsText && (
            <div className={mobileTab === 'lyrics' ? 'block' : 'hidden'}>
              <div className="mb-4 flex items-baseline gap-2">
                <div className="font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Dainos tekstas
                </div>
                <span className="font-['Outfit',sans-serif] text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-orange)]">
                  pažymėk → reaguok
                </span>
              </div>
              <LyricsWithReactions trackId={track.id} lyrics={lyricsText} compact />
            </div>
          )}
          {/* Komentarai — taip pat always mounted, kad count badge'as
              būtų populated iškart kai modal'as atsidaro (anksčiau load'inosi
              tik kai user'is paspaudžia tab'ą → 0 rodydavo iki click'o). */}
          <div className={!lyricsText || mobileTab === 'comments' ? 'block' : 'hidden'}>
            <EntityCommentsBlock
              entityType="track"
              entityId={track.id}
              compact
              title="Komentarai"
              onCountChange={setCommentTotal}
            />
          </div>
        </div>
      </aside>

      {LikersOverlay}
    </div>,
    document.body,
  )
  // artistSlug is kept for future deep-links (e.g. "More from artist")
  void artistSlug
}
