'use client'

// „Dėmesio centre" — didelės featured kortelės su vizualais; paspaudus play,
// atlikėjo naujausias klipas pasileidžia INLINE šiame pat puslapyje (YT).

import { useState } from 'react'
import Link from 'next/link'
import { flagFor } from '@/lib/artist-browse'
import type { RadarArtist } from '@/lib/radaras-shared'
import { getYouTubeId, styleLabel, radarArtistHref } from '@/lib/radaras-shared'

const PLAY = <svg viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg>

function blurbOf(a: RadarArtist): string {
  if (a.radar_blurb) return a.radar_blurb
  if (a.latest_title) return `Naujausia daina — „${a.latest_title}".`
  return 'Kylantis kūrėjas, kurį verta sekti.'
}
function metaOf(a: RadarArtist): string {
  return a.career_start ? `Kuria nuo ${a.career_start}` : ''
}

export default function RadarFeatured({ artists }: { artists: RadarArtist[] }) {
  const [playingId, setPlayingId] = useState<number | null>(null)
  const active = artists.find((a) => a.id === playingId) || null
  const activeYt = active ? getYouTubeId(active.latest_video_url) : null

  return (
    <div>
      {active && activeYt && (
        <div className="rd-fx-player">
          <div className="rd-fx-frame">
            <iframe
              src={`https://www.youtube.com/embed/${activeYt}?rel=0&autoplay=1`}
              title={active.name}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="rd-fx-pmeta">
            <div className="rd-fx-pmeta-l">
              <div className="rd-fx-pname">{active.name}</div>
              <div className="rd-fx-psub">
                {active.latest_title ? `„${active.latest_title}"` : ''}
                {active.genres[0] ? `${active.latest_title ? ' · ' : ''}${styleLabel(active.genres[0])}` : ''}
              </div>
            </div>
            <button className="rd-fx-close" onClick={() => setPlayingId(null)}>Uždaryti ✕</button>
          </div>
        </div>
      )}

      <div className="rd-fx-grid">
        {artists.map((a) => {
          const yt = getYouTubeId(a.latest_video_url)
          const flag = flagFor(a.country)
          const genre = a.genres[0] ? styleLabel(a.genres[0]) : ''
          const cover = (
            <>
              {a.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.cover_image_url} alt={a.name} loading="lazy" />
              ) : <div className="rd-fx-noimg"><span>{a.name?.[0] || '?'}</span></div>}
              <span className="rd-fx-tag">Dėmesio centre</span>
              {yt && <span className="rd-fx-play">{PLAY}</span>}
              <div className="rd-fx-cap">
                <div className="rd-fx-name">{a.name} {flag && <span>{flag}</span>}</div>
                {genre && <div className="rd-fx-genre">{genre}</div>}
              </div>
            </>
          )
          return (
            <div className="rd-fx" key={a.id}>
              {yt ? (
                <button type="button" className="rd-fx-cover" onClick={() => setPlayingId(a.id)} aria-label={`Groti ${a.name}`}>{cover}</button>
              ) : (
                <Link href={radarArtistHref(a)} className="rd-fx-cover" prefetch={false}>{cover}</Link>
              )}
              <div className="rd-fx-body">
                <p className="rd-fx-blurb">{blurbOf(a)}</p>
                <div className="rd-fx-meta">
                  {metaOf(a)}{metaOf(a) ? ' · ' : ''}
                  <Link href={radarArtistHref(a)} prefetch={false} style={{ color: 'var(--accent-link)' }}>Profilis →</Link>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
