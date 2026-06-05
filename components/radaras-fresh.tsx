'use client'

// Šviežios dainos — VIENAS sąrašas + YT player'is šalia (topų layout idėja).
// Paspaudus dainą su video — groja dešinėje; be video — atsidaro dainos psl.

import { useState } from 'react'
import Link from 'next/link'
import type { RadarTrack } from '@/lib/radaras-shared'
import { getYouTubeId, ytThumb, radarTrackHref, radarArtistHref } from '@/lib/radaras-shared'

function fmtAgo(iso: string | null): string {
  if (!iso) return ''
  const d = Date.parse(iso); if (!d) return ''
  const days = Math.floor((Date.now() - d) / 86_400_000)
  if (days <= 0) return 'šiandien'
  if (days === 1) return 'vakar'
  if (days < 7) return `prieš ${days} d.`
  if (days < 31) return `prieš ${Math.floor(days / 7)} sav.`
  if (days < 365) return `prieš ${Math.floor(days / 30)} mėn.`
  return `prieš ${Math.floor(days / 365)} m.`
}

const PLAY = (
  <svg viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg>
)

export default function RadarFresh({ tracks }: { tracks: RadarTrack[] }) {
  const firstPlayable = tracks.find((t) => getYouTubeId(t.video_url))
  const [activeId, setActiveId] = useState<number | null>(firstPlayable?.id ?? null)
  const active = tracks.find((t) => t.id === activeId) || null
  const activeYt = active ? getYouTubeId(active.video_url) : null

  return (
    <div className="rd-fresh">
      {/* Kairė — sąrašas */}
      <div className="rd-fresh-list">
        {tracks.map((t, i) => {
          const yt = getYouTubeId(t.video_url)
          const cover = ytThumb(t.video_url) || t.cover_url
          // Peržiūrų skaičius kol kas nerodomas (greitai pasensta).
          const meta = fmtAgo(t.uploaded_at)
          const inner = (
            <>
              <span className="rd-frow-rank">{i + 1}</span>
              <span className="rd-frow-cover">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" loading="lazy" />
                ) : <span className="rd-frow-noimg">♪</span>}
                {yt && <span className="rd-frow-play">{PLAY}</span>}
              </span>
              <span className="rd-frow-txt">
                <span className="rd-frow-title">{t.title}</span>
                <span className="rd-frow-artist">{t.artist_name}</span>
              </span>
              <span className="rd-frow-meta">{meta}</span>
            </>
          )
          // Su video → groja vietoje; be video → nuoroda į dainos puslapį.
          return yt ? (
            <button
              key={t.id}
              className={`rd-frow${activeId === t.id ? ' on' : ''}`}
              onClick={() => setActiveId(t.id)}
              aria-pressed={activeId === t.id}
            >{inner}</button>
          ) : (
            <Link key={t.id} href={radarTrackHref(t)} className="rd-frow" prefetch={false}>{inner}</Link>
          )
        })}
      </div>

      {/* Dešinė — player'is (sticky) */}
      <div className="rd-player">
        <div className="rd-player-frame">
          {activeYt ? (
            <iframe
              src={`https://www.youtube.com/embed/${activeYt}?rel=0`}
              title={active?.title || 'Grotuvas'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="rd-player-empty">Pasirink dainą iš sąrašo, kad pradėtum klausyti.</div>
          )}
        </div>
        {active && (
          <div className="rd-player-meta">
            <div className="rd-player-title">{active.title}</div>
            <div className="rd-player-artist">
              <Link href={radarArtistHref({ slug: active.artist_slug })} prefetch={false}>{active.artist_name}</Link>
              {fmtAgo(active.uploaded_at) ? ` · ${fmtAgo(active.uploaded_at)}` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
