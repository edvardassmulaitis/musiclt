'use client'

/* ──────────────────────────────────────────────────────────────────
 * ChartYtPlayer — bendras topų player'is (top40/30 + consensus topai).
 *
 * VIENO PASPAUDIMO grojimas (su garsu, ir iOS):
 *   • IFrame API įkraunamas iškart; YT.Player sukuriamas IŠ ANKSTO (cued,
 *     autoplay=0) kai tik turim videoId — todėl iki vartotojo paspaudimo
 *     player'is jau READY.
 *   • Paspaudus dainą, tėvas kviečia `playNow(videoId)` SINKRONIŠKAI tame
 *     pačiame click handler'yje → `playVideo()` / `loadVideoById()`. Tiesioginis
 *     user-gesture play ant READY player'io leidžiamas SU GARSU visur (įsk. iOS),
 *     todėl autoplay suveikia jau pirmu paspaudimu (nebereikia mute / „Garsui").
 *   • Track switch'ai per loadVideoById (player vienas, gesture perduodamas).
 *   • youtube-nocookie.com (Safari ITP). onError 101/150/153 → fallback.
 * ────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'

export type ChartYtPlayerHandle = { playNow: (videoId: string) => void }

export const ChartYtPlayer = forwardRef<ChartYtPlayerHandle, {
  videoId: string | null
  query?: string | null
  playing: boolean
  posterUrl?: string | null
  accentHex?: string
  title?: string
  onActivate: () => void
  onEnded?: () => void
}>(function ChartYtPlayer({ videoId, query, playing, posterUrl, accentHex = '#f97316', title, onActivate, onEnded }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<any>(null)
  const readyRef = useRef(false)
  const pendingRef = useRef<string | null>(null)
  const curVidRef = useRef<string | null>(null)
  const [apiReady, setApiReady] = useState(false)
  const [embedDisabled, setEmbedDisabled] = useState(false)
  const onEndedRef = useRef(onEnded)
  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  // Watchdog: kai kurie embed-restricted video (YT Error 153 „player config")
  // parodo YT klaidą BET NEiškviečia onError → app'as nesusigaudo. Todėl po
  // play paleidžiam laikmatį; jei per 5s nepasiekia PLAYING/BUFFERING būsenos,
  // laikom embed nepavykusiu → fallback + auto-skip į kitą.
  const failTimerRef = useRef<any>(null)
  const clearFail = useCallback(() => {
    if (failTimerRef.current) { clearTimeout(failTimerRef.current); failTimerRef.current = null }
  }, [])
  const markFailed = useCallback(() => {
    clearFail()
    setEmbedDisabled(true)
    try { playerRef.current?.destroy() } catch {}
    playerRef.current = null; readyRef.current = false
    // trumpa pauzė kad spėtų matytis „Žiūrėti YouTube", tada kitas trekas
    window.setTimeout(() => onEndedRef.current?.(), 2500)
  }, [clearFail])
  const armWatchdog = useCallback(() => {
    clearFail()
    failTimerRef.current = window.setTimeout(() => markFailed(), 5000)
  }, [clearFail, markFailed])

  // Trekui pasikeitus — reset embedDisabled, kad naujas video gautų šviežią player'į
  // (kitaip po vieno fail'o embedDisabled liktų true ir niekas nebegrotų).
  useEffect(() => { setEmbedDisabled(false); clearFail() }, [videoId, clearFail])

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
    const iv = window.setInterval(() => { if (W.YT && W.YT.Player) { setApiReady(true); window.clearInterval(iv) } }, 120)
    return () => window.clearInterval(iv)
  }, [])

  // PRE-CREATE player CUED (autoplay=0) kai tik turim videoId → READY iki tap'o.
  useEffect(() => {
    if (!apiReady || !videoId || playerRef.current || embedDisabled || !containerRef.current) return
    const W = window as any
    const inner = document.createElement('div')
    inner.style.cssText = 'width:100%;height:100%;'
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(inner)
    curVidRef.current = videoId
    readyRef.current = false
    playerRef.current = new W.YT.Player(inner, {
      host: 'https://www.youtube-nocookie.com',
      videoId, width: '100%', height: '100%',
      playerVars: {
        autoplay: 0, controls: 1, modestbranding: 1, rel: 0, playsinline: 1,
        iv_load_policy: 3, enablejsapi: 1,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
      events: {
        onReady: (e: any) => {
          readyRef.current = true
          // Jei vartotojas spustelėjo dar player'iui nepasiruošus — paleidžiam dabar.
          if (pendingRef.current) {
            const v = pendingRef.current; pendingRef.current = null
            try {
              if (v !== curVidRef.current) { e.target.loadVideoById(v); curVidRef.current = v }
              else e.target.playVideo()
              armWatchdog()
            } catch {}
          }
        },
        onStateChange: (e: any) => { if (e.data === 1 || e.data === 3) clearFail(); if (e.data === 0) onEndedRef.current?.() },
        onError: () => { markFailed() },
      },
    })
  }, [apiReady, videoId, embedDisabled])

  // videoId pasikeitė kol NEGROJAM → cue (laikom ready, be autoplay).
  useEffect(() => {
    if (!playerRef.current || !videoId || !readyRef.current || playing) return
    if (curVidRef.current === videoId) return
    try { playerRef.current.cueVideoById(videoId); curVidRef.current = videoId } catch {}
  }, [videoId, playing])

  // Imperatyvus playNow — kviečiamas tėvo SINKRONIŠKAI click handler'yje (gesture).
  useImperativeHandle(ref, () => ({
    playNow(vid: string) {
      const p = playerRef.current
      if (p && readyRef.current) {
        try {
          if (curVidRef.current !== vid) { p.loadVideoById(vid); curVidRef.current = vid }
          else p.playVideo()
          armWatchdog()
        } catch {}
      } else {
        pendingRef.current = vid  // dar neparuoštas — paleisim per onReady
      }
    },
  }), [armWatchdog])

  // Unmount cleanup
  useEffect(() => () => { try { playerRef.current?.destroy() } catch {}; playerRef.current = null; if (failTimerRef.current) clearTimeout(failTimerRef.current) }, [])

  // No-videoId fallback: YT paieškos iframe (best-effort), kai grojam be videoId.
  const showSearchIframe = playing && !videoId && !!query && !embedDisabled
  const searchSrc = query
    ? `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}&autoplay=1&playsinline=1&rel=0&modestbranding=1`
    : ''

  return (
    <div className="cyt-video">
      <style>{cytStyles}</style>
      {/* YT.Player target — stabilus React-owned div'as (YT įdeda iframe JS'u).
          Cued player'is laikomas paslėptas po poster'iu kol !playing. */}
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

      {embedDisabled && videoId && (
        <a className="cyt-fallback" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">
          <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" referrerPolicy="no-referrer" />
          <span className="cyt-fallback-cta">Žiūrėti „YouTube" →</span>
        </a>
      )}
    </div>
  )
})

const cytStyles = `
  .cyt-video { position: relative; aspect-ratio: 16/9; width: 100%; background: #000; overflow: hidden; }
  .cyt-slot { position: absolute; inset: 0; width: 100%; height: 100%; }
  .cyt-slot.cyt-hidden { opacity: 0; pointer-events: none; }
  .cyt-slot iframe { width: 100%; height: 100%; border: 0; display: block; }
  .cyt-search { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
  .cyt-poster { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; padding: 0; cursor: pointer; background: #000; display: block; z-index: 2; }
  .cyt-poster img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0.9; }
  .cyt-ph { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: #555; font-size: 30px; }
  .cyt-playbtn { position: absolute; right: 12px; bottom: 12px; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding-left: 3px; box-shadow: 0 8px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.3); }
  .cyt-fallback { position: absolute; inset: 0; z-index: 3; display: flex; align-items: center; justify-content: center; text-decoration: none; }
  .cyt-fallback img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
  .cyt-fallback-cta { position: relative; z-index: 1; padding: 8px 14px; border-radius: 999px; background: rgba(0,0,0,0.7); color: #fff; font-size: 13px; font-weight: 800; }
`
