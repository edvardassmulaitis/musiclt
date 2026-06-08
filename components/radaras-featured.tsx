'use client'

// „Dėmesio centre" — švarios didelės kortelės (vizualas + info atskirai).
// Play paleidžia klipą MODALE (overlay su grayout). Išdėstymas prisitaiko prie
// kiekio (1 / 2 / 3+). Kai nėra cover — YT miniatiūrų koliažas su individualiais
// play mygtukais. Širdelė = mėgti atlikėją.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { flagFor } from '@/lib/artist-browse'
import type { RadarArtist } from '@/lib/radaras-shared'
import { getYouTubeId, ytThumb, styleLabel, radarArtistHref } from '@/lib/radaras-shared'
import RadarHeart from '@/components/radaras-heart'

const PLAY = <svg viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg>

type Playing = { ytId: string; artistName: string; title?: string }

function ago(iso: string | null): string {
  if (!iso) return ''
  const d = Date.parse(iso); if (!d) return ''
  const days = Math.floor((Date.now() - d) / 86_400_000)
  if (days < 7) return 'šią savaitę'
  const w = Math.floor(days / 7)
  if (days < 31) return `prieš ${w} ${w === 1 ? 'savaitę' : w < 11 ? 'savaites' : 'savaičių'}`
  const m = Math.floor(days / 30)
  if (days < 365) return `prieš ${m} ${m === 1 ? 'mėnesį' : m < 11 ? 'mėnesius' : 'mėnesių'}`
  const y = Math.floor(days / 365)
  return `prieš ${y} ${y < 11 ? 'metus' : 'metų'}`
}

function blurbOf(a: RadarArtist): string {
  if (a.radar_blurb) return a.radar_blurb
  if (a.latest_title) return `Naujausia daina — „${a.latest_title}".`
  return 'Kylantis kūrėjas, kurį verta sekti.'
}

// Kai nėra cover foto — 2×2 koliažas, kiekviena miniatiūra yra atskiras play mygtukas
function YtCollageCover({ urls, name, onPlay }: { urls: string[]; name: string; onPlay: (ytId: string) => void }) {
  const thumbs = urls
    .map((u) => ({ thumb: ytThumb(u), ytId: getYouTubeId(u) }))
    .filter((x): x is { thumb: string; ytId: string } => !!x.thumb && !!x.ytId)
    .slice(0, 4)
  if (thumbs.length === 0) {
    return (
      <div className="rd-fx-noimg">
        <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 900, fontSize: '60px', color: 'rgba(255,255,255,0.08)' }}>
          {name?.[0] || '?'}
        </span>
      </div>
    )
  }
  return (
    <div className="rd-yt-collage-cover">
      {thumbs.map(({ thumb, ytId }, i) => (
        <button key={i} type="button" className="rd-yt-thumb-btn" onClick={() => onPlay(ytId)}
          aria-label={`Groti ${name} vaizdo klipą ${i + 1}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt="" loading="lazy" />
          <span className="rd-yt-thumb-play">{PLAY}</span>
        </button>
      ))}
    </div>
  )
}

export default function RadarFeatured({ artists }: { artists: RadarArtist[] }) {
  const [playing, setPlaying] = useState<Playing | null>(null)

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
          const mainYtId = getYouTubeId(a.latest_video_url)
          const hasYt = !!mainYtId
          const flag = flagFor(a.country)
          const genre = a.genres[0] ? styleLabel(a.genres[0]) : ''

          // Cover area — trys scenarijai:
          // 1. Yra cover nuotrauka: rodome ją (su play mygtuku jei yra YT)
          // 2. Nėra nuotraukos, yra YT video: koliažas su individualiais play mygtukais
          // 3. Nieko nėra: raidės placeholder
          let coverEl: React.ReactNode
          if (a.cover_image_url) {
            const inner = (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.cover_image_url} alt={a.name} loading="lazy" />
                {hasYt && <span className="rd-fx-play">{PLAY}</span>}
              </>
            )
            coverEl = hasYt ? (
              <button type="button" className="rd-fx-cover"
                onClick={() => setPlaying({ ytId: mainYtId, artistName: a.name, title: a.latest_title ?? undefined })}
                aria-label={`Groti ${a.name}`}>{inner}</button>
            ) : (
              <Link href={radarArtistHref(a)} className="rd-fx-cover" prefetch={false}>{inner}</Link>
            )
          } else if (a.top_video_urls.length > 0) {
            coverEl = (
              <div className="rd-fx-cover">
                <YtCollageCover urls={a.top_video_urls} name={a.name}
                  onPlay={(ytId) => setPlaying({ ytId, artistName: a.name })} />
              </div>
            )
          } else {
            coverEl = (
              <Link href={radarArtistHref(a)} className="rd-fx-cover" prefetch={false}>
                <div className="rd-fx-noimg">
                  <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 900, fontSize: '60px', color: 'rgba(255,255,255,0.08)' }}>
                    {a.name?.[0] || '?'}
                  </span>
                </div>
              </Link>
            )
          }

          return (
            <div className={`rd-fx${wide ? ' rd-fx--wide' : ''}`} key={a.id}>
              {coverEl}
              <div className="rd-fx-body">
                <div className="rd-fx-toprow">
                  <Link href={radarArtistHref(a)} className="rd-fx-name" prefetch={false}>
                    {a.name}{flag && <span className="rd-fx-flag">{flag}</span>}
                  </Link>
                  <RadarHeart artistId={a.id} size={34} />
                </div>
                {(genre || a.first_upload_at) && (
                  <div className="rd-fx-genre">{genre}{genre && a.first_upload_at ? ' · ' : ''}{a.first_upload_at ? `pirmas įrašas ${ago(a.first_upload_at)}` : ''}</div>
                )}
                <p className="rd-fx-blurb">{blurbOf(a)}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modalinis grotuvas (overlay + grayout) */}
      {playing && (
        <div className="rd-modal" onClick={() => setPlaying(null)} role="dialog" aria-modal="true" aria-label={playing.artistName}>
          <div className="rd-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="rd-modal-head">
              <div className="rd-modal-title">
                {playing.artistName}
                {playing.title ? <span> — {playing.title}</span> : null}
              </div>
              <button className="rd-modal-x" onClick={() => setPlaying(null)} aria-label="Uždaryti">✕</button>
            </div>
            <div className="rd-modal-frame">
              <iframe
                src={`https://www.youtube.com/embed/${playing.ytId}?rel=0&autoplay=1`}
                title={playing.artistName}
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
