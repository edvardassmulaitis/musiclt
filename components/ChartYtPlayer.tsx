'use client'

/* ──────────────────────────────────────────────────────────────────
 * ChartYtPlayer — bendras topų player'is (top40/30 + consensus topai).
 *
 * 2026-06-16: PERRAŠYTA į PAPRASTĄ <iframe> embed'ą (kaip atlikėjo psl.).
 *   Priežastis: YT IFrame API (`new YT.Player`) + cued/loadVideoById kai kuriems
 *   video meta YT „Error 153 — player configuration error" (pvz. Evgenya Redko
 *   „Čempionai"). TAS PATS video per paprastą <iframe ...autoplay=1> atlikėjo
 *   puslapyje groja be problemų. Todėl atsisakom IFrame API ir naudojam plain
 *   iframe — patikima, groja kaip atlikėjo psl.
 *   • Track switch → iframe remount (key=src) → autoplay nauja daina.
 *   • Be konkretaus videoId, bet su query → YT paieškos embed (groja artimiausią).
 *   Kompromisas: prarandam onEnded auto-advance (plain iframe neturi JS API
 *   įvykių) — bet grojimas svarbiau nei auto-next.
 * ────────────────────────────────────────────────────────────────── */

import { useImperativeHandle, forwardRef } from 'react'

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
}>(function ChartYtPlayer({ videoId, query, playing, posterUrl, accentHex = 'var(--accent-orange)', title, onActivate }, ref) {
  // Grojimą valdo `playing` + `videoId` props (tėvas perjungia). playNow paliktas
  // suderinamumui — tikras play vyksta per state-driven iframe render'ą.
  useImperativeHandle(ref, () => ({ playNow() { /* state-driven */ } }), [])

  const origin = typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : ''
  // TIK konkretus videoId. listType=search embed'as YouTube'e DEPRECATED
  // (rodo „Šis vaizdo įrašas nepasiekiamas") — todėl be videoId nieko negrojam,
  // rodom posterį. Neprilinkinti įrašai = posteris, ne lūžęs error.
  const src = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3${origin}`
    : ''

  return (
    <div className="cyt-video">
      <style>{cytStyles}</style>

      {playing && src && (
        <iframe
          key={src}
          className="cyt-slot"
          src={src}
          title={title || ''}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      )}

      {(!playing || !videoId) && (
        <button className="cyt-poster" onClick={onActivate} type="button" aria-label="Groti">
          {posterUrl ? <img src={posterUrl} alt="" referrerPolicy="no-referrer" /> : <span className="cyt-ph">♪</span>}
          <span className="cyt-playbtn" style={{ background: accentHex }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4" /></svg>
          </span>
        </button>
      )}
    </div>
  )
})

const cytStyles = `
  .cyt-video { position: relative; aspect-ratio: 16/9; width: 100%; background: #000; overflow: hidden; }
  .cyt-slot { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
  .cyt-poster { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; padding: 0; cursor: pointer; background: #000; display: block; z-index: 2; }
  .cyt-poster img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0.9; }
  .cyt-ph { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: #555; font-size: 30px; }
  .cyt-playbtn { position: absolute; right: 12px; bottom: 12px; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding-left: 3px; box-shadow: 0 8px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.3); }
`
