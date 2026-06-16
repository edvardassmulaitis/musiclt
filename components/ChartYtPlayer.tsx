'use client'

/* ──────────────────────────────────────────────────────────────────
 * ChartYtPlayer — bendras topų player'is. Logika paimta iš atlikėjo
 * puslapio (artist-profile-client PlayerCard), kuri veikia sklandžiai:
 *
 *   • Desktop: YouTube IFrame API (YT.Player) su autoplay=1 + onReady→
 *     playVideo(). Track switch'ai per loadVideoById (player kuriamas
 *     vieną kartą, gesture context perduodamas).
 *   • Mobile (≤1023px): iOS/Android griežtai blokuoja autoplay su garsu,
 *     todėl startuojam su mute=1 (muted autoplay VISADA leidžiamas), po to
 *     bandom unMute() per 800/1600/3000ms + rodom „Garsui" badge.
 *   • youtube-nocookie.com host — apeina Safari ITP klaidą 153.
 *   • onError 101/150/153 → embed išjungtas → fallback „Žiūrėti YouTube'e".
 *
 * Niuansas (kaip ir atlikėjo psl.): pirmą kartą paspaudus desktop'e autoplay
 * gali nesuveikti (player kuriamas useEffect'e po render'io, gesture prarastas),
 * bet toliau perjungiant veikia sklandžiai per loadVideoById.
 * ────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react'

export function ChartYtPlayer({
  videoId, query, playing, posterUrl, accentHex = '#f97316', title,
  onActivate, onEnded,
}: {
  videoId: string | null
  /** Jei nėra videoId — naudojam YT paiešką (plain iframe fallback). */
  query?: string | null
  playing: boolean
  posterUrl?: string | null
  accentHex?: string
  title?: string
  onActivate: () => void
  onEnded?: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<any>(null)
  const [apiReady, setApiReady] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [needsUnmute, setNeedsUnmute] = useState(false)
  const [embedDisabled, setEmbedDisabled] = useState(false)
  const onEndedRef = useRef(onEnded)
  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  // Mobile detection
  useEffect(() => {
    const m = window.matchMedia('(max-width: 1023px)')
    setIsMobile(m.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])

  // Load IFrame API once per session
  useEffect(() => {
    const W = window as any
    if (W.YT && W.YT.Player) { setApiReady(true); return }
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script')
      s.id = 'yt-iframe-api'
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    }
    const prev = W.onYouTubeIframeAPIReady
    W.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); setApiReady(true) }
    const iv = window.setInterval(() => {
      if (W.YT && W.YT.Player) { setApiReady(true); window.clearInterval(iv) }
    }, 120)
    return () => window.clearInterval(iv)
  }, [])

  useEffect(() => { setNeedsUnmute(isMobile && playing && !embedDisabled && !!videoId) }, [isMobile, playing, videoId, embedDisabled])

  // CREATE player (videoId kelias). Vieną kartą — track switch per loadVideoById.
  useEffect(() => {
    if (!apiReady || !playing || !videoId || embedDisabled || !containerRef.current) return
    if (playerRef.current) return
    const W = window as any
    const inner = document.createElement('div')
    inner.style.width = '100%'; inner.style.height = '100%'
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(inner)
    const player = new W.YT.Player(inner, {
      host: 'https://www.youtube-nocookie.com',
      videoId, width: '100%', height: '100%',
      playerVars: {
        autoplay: 1, mute: isMobile ? 1 : 0, controls: 1, modestbranding: 1,
        rel: 0, playsinline: 1, iv_load_policy: 3, enablejsapi: 1,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
      events: {
        onReady: (e: any) => {
          try { e.target.playVideo() } catch {}
          if (isMobile) {
            const u = () => { try { e.target.unMute() } catch {} }
            setTimeout(u, 800); setTimeout(u, 1600); setTimeout(u, 3000)
          }
        },
        onStateChange: (e: any) => { if (e.data === 0) onEndedRef.current?.() },
        onError: (e: any) => {
          const code = e?.data
          if (code === 101 || code === 150 || code === 153) {
            setEmbedDisabled(true)
            try { playerRef.current?.destroy() } catch {}
            playerRef.current = null
            try { if (containerRef.current) containerRef.current.innerHTML = '' } catch {}
          }
        },
      },
    })
    ;(player as any)._vid = videoId
    playerRef.current = player
  }, [apiReady, playing, videoId, embedDisabled, isMobile])

  // SWITCH video — loadVideoById (be destroy/recreate)
  useEffect(() => {
    if (!playerRef.current || !videoId) return
    if ((playerRef.current as any)._vid === videoId) return
    try {
      playerRef.current.loadVideoById?.(videoId)
      ;(playerRef.current as any)._vid = videoId
      setEmbedDisabled(false)
    } catch {}
  }, [videoId])

  // UNMOUNT cleanup
  useEffect(() => () => { try { playerRef.current?.destroy() } catch {}; playerRef.current = null }, [])

  // No-videoId fallback: plain YT search iframe (best-effort autoplay).
  const showSearchIframe = playing && !videoId && !!query && !embedDisabled
  const searchSrc = query
    ? `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}&autoplay=1&playsinline=1&rel=0&modestbranding=1`
    : ''

  return (
    <div className="cyt-video">
      <style>{cytStyles}</style>
      {/* YT.Player target — stabilus React-owned div'as (YT įdeda iframe JS'u) */}
      <div ref={containerRef} className={`cyt-slot${playing && videoId && !embedDisabled ? '' : ' cyt-hidden'}`} />

      {showSearchIframe && (
        <iframe className="cyt-search" src={searchSrc} title={title || ''} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      )}

      {!playing && (
        <button className="cyt-poster" onClick={onActivate} type="button" aria-label="Groti">
          {posterUrl ? <img src={posterUrl} alt="" referrerPolicy="no-referrer" /> : <span className="cyt-ph">♪</span>}
          <span className="cyt-playbtn" style={{ background: accentHex }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4" /></svg>
          </span>
        </button>
      )}

      {playing && isMobile && needsUnmute && !embedDisabled && videoId && (
        <button className="cyt-unmute" type="button" title="Įjungti garsą"
          onClick={() => { try { playerRef.current?.unMute?.() } catch {}; setNeedsUnmute(false) }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          Garsui
        </button>
      )}

      {embedDisabled && videoId && (
        <a className="cyt-fallback" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">
          <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" referrerPolicy="no-referrer" />
          <span className="cyt-fallback-cta">Žiūrėti „YouTube" →</span>
        </a>
      )}
    </div>
  )
}

const cytStyles = `
  .cyt-video { position: relative; aspect-ratio: 16/9; width: 100%; background: #000; overflow: hidden; }
  .cyt-slot { position: absolute; inset: 0; width: 100%; height: 100%; }
  .cyt-slot.cyt-hidden { display: none; }
  .cyt-slot iframe { width: 100%; height: 100%; border: 0; display: block; }
  .cyt-search { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
  .cyt-poster { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; padding: 0; cursor: pointer; background: #000; display: block; }
  .cyt-poster img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0.9; }
  .cyt-ph { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: #555; font-size: 30px; }
  .cyt-playbtn { position: absolute; right: 12px; bottom: 12px; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding-left: 3px; box-shadow: 0 8px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.3); }
  .cyt-unmute { position: absolute; right: 8px; top: 8px; z-index: 20; display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 999px; border: 0; cursor: pointer; background: rgba(0,0,0,0.7); color: #fff; font-size: 12px; font-weight: 800; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
  .cyt-fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-decoration: none; }
  .cyt-fallback img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
  .cyt-fallback-cta { position: relative; z-index: 1; padding: 8px 14px; border-radius: 999px; background: rgba(0,0,0,0.7); color: #fff; font-size: 13px; font-weight: 800; }
`
