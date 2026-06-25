'use client'

/* ──────────────────────────────────────────────────────────────────
 * ReelsYtPlayer — mobile hero „reels" grotuvas.
 *
 * VIENO TAPO grojimas su garsu (įsk. iOS) — TA PATI architektūra kaip
 * atlikėjo psl.: YT IFrame API player'is sukuriamas IŠ ANKSTO (cued,
 * autoplay=0) kai tik turim videoId → READY iki vartotojo tapo. Tap'e tėvas
 * SINKRONIŠKAI kviečia `play(vid)` → playVideo()/loadVideoById() ant READY
 * player'io (user-gesture išlaikytas) → groja iškart, 1 tapu.
 *   • youtube-nocookie.com host — Safari ITP / „Error 153" apsauga.
 *   • Grįžus po braukimo — player'is lieka (arba per-active perkuriamas),
 *     play() ant ready player'io vėl groja patikimai.
 * ────────────────────────────────────────────────────────────────── */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export type ReelsYtHandle = { play: (videoId: string) => void; stop: () => void }

export const ReelsYtPlayer = forwardRef<ReelsYtHandle, { videoId: string | null }>(
  function ReelsYtPlayer({ videoId }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const playerRef = useRef<any>(null)
    const readyRef = useRef(false)
    const curRef = useRef<string | null>(null)
    const pendingRef = useRef<string | null>(null)
    const [apiReady, setApiReady] = useState(false)

    // IFrame API įkraunama vieną kartą per sesiją.
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

    // PRE-CREATE cued (autoplay=0) kai tik turim videoId → READY iki tapo.
    useEffect(() => {
      if (!apiReady || !videoId || playerRef.current || !containerRef.current) return
      const W = window as any
      const inner = document.createElement('div')
      inner.style.width = '100%'
      inner.style.height = '100%'
      containerRef.current.innerHTML = ''
      containerRef.current.appendChild(inner)
      curRef.current = videoId
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
            if (pendingRef.current) {
              const v = pendingRef.current; pendingRef.current = null
              try {
                if (v !== curRef.current) { e.target.loadVideoById(v); curRef.current = v }
                else e.target.playVideo()
              } catch {}
            }
          },
        },
      })
    }, [apiReady, videoId])

    // videoId pasikeitė kol negroja → cue (laikom ready, be garso).
    useEffect(() => {
      if (!playerRef.current || !videoId || !readyRef.current) return
      if (curRef.current === videoId) return
      try { playerRef.current.cueVideoById(videoId); curRef.current = videoId } catch {}
    }, [videoId])

    useEffect(() => () => { try { playerRef.current?.destroy() } catch {}; playerRef.current = null }, [])

    useImperativeHandle(ref, () => ({
      play(vid: string) {
        const p = playerRef.current
        if (p && readyRef.current) {
          try {
            if (curRef.current !== vid) { p.loadVideoById(vid); curRef.current = vid }
            else p.playVideo()
          } catch {}
        } else {
          pendingRef.current = vid  // dar neparuoštas — paleisim per onReady
        }
      },
      stop() { try { playerRef.current?.pauseVideo?.() } catch {} },
    }), [])

    return <div ref={containerRef} className="rdr-ytslot" />
  }
)
