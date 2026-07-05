'use client'

// components/zaidimai/naudotiKvizoGrotuva.ts
//
// YouTube IFrame API grotuvas kvizams — iOS Safario garso taisymas.
//
// Problema: <iframe autoplay=1> iOS Safari NEgroja garso (gestas tėviniame
// puslapyje neautorizuoja medijos iframe'e). Sprendimas: VIENAS persistent
// YT.Player visam kvizui — pirmas `play()` kviečiamas naudotojo gesto
// kontekste (mygtuko onClick, sinchroniškai), o toliau `loadVideoById()`
// groja programiškai, nes grotuvas jau aktyvuotas.
//
// Klaidų atveju (kai kurie video per IFrame API meta 150/153) — `failed`
// vėliava: tėvinis komponentas rodo atsarginį variantą.

import { useCallback, useEffect, useRef, useState } from 'react'

let apiPromise: Promise<any> | null = null

function loadYtApi(): Promise<any> {
  const w = window as any
  if (w.YT?.Player) return Promise.resolve(w.YT)
  if (!apiPromise) {
    apiPromise = new Promise(resolve => {
      const prev = w.onYouTubeIframeAPIReady
      w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(w.YT) }
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.async = true
      document.head.appendChild(s)
    })
  }
  return apiPromise
}

export function yraIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
}

export function useKvizoGrotuvas() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<any>(null)
  const readyRef = useRef(false)
  const pendingRef = useRef<{ id: string; start: number } | null>(null)
  const [failedVideo, setFailedVideo] = useState<string | null>(null)
  const currentRef = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    void loadYtApi().then(YT => {
      if (!alive || !containerRef.current || playerRef.current) return
      playerRef.current = new YT.Player(containerRef.current, {
        width: '100%',
        height: '100%',
        playerVars: {
          playsinline: 1,
          controls: 1,
          rel: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            readyRef.current = true
            const p = pendingRef.current
            if (p) { pendingRef.current = null; doPlay(p.id, p.start) }
          },
          onError: () => {
            setFailedVideo(currentRef.current)
          },
        },
      })
    }).catch(() => setFailedVideo('api'))
    return () => {
      alive = false
      try { playerRef.current?.destroy?.() } catch { /* ok */ }
      playerRef.current = null
      readyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function doPlay(videoId: string, startSec: number) {
    const pl = playerRef.current
    if (!pl) return
    try {
      currentRef.current = videoId
      setFailedVideo(null)
      pl.loadVideoById({ videoId, startSeconds: startSec })
      pl.unMute?.()
      pl.setVolume?.(100)
      pl.playVideo?.()
    } catch { setFailedVideo(videoId) }
  }

  /** Kviesti mygtuko onClick metu (SINCHRONIŠKAI) — iOS atrakinimas + grojimas. */
  const play = useCallback((videoId: string, startSec: number) => {
    if (!readyRef.current || !playerRef.current) {
      pendingRef.current = { id: videoId, start: startSec }
      return
    }
    doPlay(videoId, startSec)
  }, [])

  const stop = useCallback(() => {
    try { playerRef.current?.stopVideo?.() } catch { /* ok */ }
  }, [])

  return { containerRef, play, stop, failedVideo }
}
