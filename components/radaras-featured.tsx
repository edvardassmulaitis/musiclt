'use client'

// „Dėmesio centre" — švarios didelės kortelės (vizualas + info atskirai).
// Play paleidžia klipą MODALE (overlay su grayout). Išdėstymas prisitaiko prie
// kiekio (1 / 2 / 3+). Širdelė = mėgti atlikėją.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { flagFor } from '@/lib/artist-browse'
import type { RadarArtist } from '@/lib/radaras-shared'
import { getYouTubeId, styleLabel, radarArtistHref } from '@/lib/radaras-shared'
import RadarHeart from '@/components/radaras-heart'

const PLAY = <svg viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg>

function blurbOf(a: RadarArtist): string {
  if (a.radar_blurb) return a.radar_blurb
  if (a.latest_title) return `Naujausia daina — „${a.latest_title}".`
  return 'Kylantis kūrėjas, kurį verta sekti.'
}

export default function RadarFeatured({ artists }: { artists: RadarArtist[] }) {
  const [playing, setPlaying] = useState<RadarArtist | null>(null)
  const yt = playing ? getYouTubeId(playing.latest_video_url) : null

  // ESC uždaro modalą + užrakina scroll'ą kol atidarytas
  useEffect(() => {
    if (!playing) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlaying(null) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [playing])

  const cols = artists.length === 1 ? '1fr'
    : artists.length === 2 ? 'repeat(2, 1fr)'
    : 'repeat(auto-fill, minmax(240px, 1fr))'
  const wide = artists.length <= 2

  return (
    <div>
      <div className="rd-fx-grid" style={{ gridTemplateColumns: cols }}>
        {artists.map((a) => {
          const hasYt = !!getYouTubeId(a.latest_video_url)
          const flag = flagFor(a.country)
          const genre = a.genres[0] ? styleLabel(a.genres[0]) : ''
          const coverInner = (
            <>
              {a.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.cover_image_url} alt={a.name} loading="lazy" />
              ) : <div className="rd-fx-noimg"><span>{a.name?.[0] || '?'}</span></div>}
              {hasYt && <span className="rd-fx-play">{PLAY}</span>}
            </>
          )
          return (
            <div className={`rd-fx${wide ? ' rd-fx--wide' : ''}`} key={a.id}>
              {hasYt ? (
                <button type="button" className="rd-fx-cover" onClick={() => setPlaying(a)} aria-label={`Groti ${a.name}`}>{coverInner}</button>
              ) : (
                <Link href={radarArtistHref(a)} className="rd-fx-cover" prefetch={false}>{coverInner}</Link>
              )}
              <div className="rd-fx-body">
                <div className="rd-fx-toprow">
                  <Link href={radarArtistHref(a)} className="rd-fx-name" prefetch={false}>
                    {a.name}{flag && <span className="rd-fx-flag">{flag}</span>}
                  </Link>
                  <RadarHeart artistId={a.id} size={34} />
                </div>
                {genre && <div className="rd-fx-genre">{genre}{a.career_start ? ` · nuo ${a.career_start}` : ''}</div>}
                <p className="rd-fx-blurb">{blurbOf(a)}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modalinis grotuvas (overlay + grayout) */}
      {playing && yt && (
        <div className="rd-modal" onClick={() => setPlaying(null)} role="dialog" aria-modal="true" aria-label={playing.name}>
          <div className="rd-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="rd-modal-head">
              <div className="rd-modal-title">
                <Link href={radarArtistHref(playing)} prefetch={false}>{playing.name}</Link>
                {playing.latest_title ? <span> — „{playing.latest_title}"</span> : null}
              </div>
              <button className="rd-modal-x" onClick={() => setPlaying(null)} aria-label="Uždaryti">✕</button>
            </div>
            <div className="rd-modal-frame">
              <iframe
                src={`https://www.youtube.com/embed/${yt}?rel=0&autoplay=1`}
                title={playing.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
