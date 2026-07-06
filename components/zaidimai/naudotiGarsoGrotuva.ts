'use client'

// components/zaidimai/naudotiGarsoGrotuva.ts
//
// HTML5 <audio> grotuvas kvizams — VEIKIA iOS Safari.
//
// iOS neleidžia YouTube iframe garso jokiu būdu (gestas tėviniame puslapyje
// neautorizuoja medijos iframe'e — nei autoplay, nei IFrame API). Todėl
// kvizai groja iTunes 30 s ištraukas per vieną <audio> elementą:
//   * pirmas play() kviečiamas mygtuko gesto kontekste → elementas atrakintas
//   * toliau src keitimas + play() veikia programiškai visuose įrenginiuose.

import { useCallback, useEffect, useRef, useState } from 'react'

export function yraIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
}

export function naudotiGarsoGrotuva() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [failed, setFailed] = useState(false)
  const [grojama, setGrojama] = useState(false)

  useEffect(() => {
    const a = new Audio()
    a.preload = 'auto'
    a.addEventListener('playing', () => { setGrojama(true); setFailed(false) })
    a.addEventListener('pause', () => setGrojama(false))
    a.addEventListener('error', () => { setGrojama(false); setFailed(true) })
    audioRef.current = a
    return () => {
      try { a.pause(); a.src = '' } catch { /* ok */ }
      audioRef.current = null
    }
  }, [])

  /** Kviesti SINCHRONIŠKAI mygtuko onClick metu (iOS atrakinimas) arba
   *  programiškai po pirmo gesto. url=null → tik sustabdo. */
  const play = useCallback((url: string | null) => {
    const a = audioRef.current
    if (!a) return
    setFailed(false)
    try {
      a.pause()
      if (!url) return
      a.src = url
      a.currentTime = 0
      const p = a.play()
      if (p?.catch) p.catch(() => setFailed(true))
    } catch { setFailed(true) }
  }, [])

  const stop = useCallback(() => {
    try { audioRef.current?.pause() } catch { /* ok */ }
  }, [])

  return { play, stop, failed, grojama }
}
