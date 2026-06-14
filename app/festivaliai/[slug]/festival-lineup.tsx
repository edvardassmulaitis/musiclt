'use client'

// Festivalio line-up — vizualus klientinis komponentas. Atlikėjo nuotrauka
// (cover arba top dainos thumbnail), šalies vėliava, „play" mygtukas (atidaro
// TrackInfoModal su atlikėjo populiariausia daina).

import { useState } from 'react'
import Link from 'next/link'
import { TrackInfoModal, type ModalTrack } from '@/components/TrackInfoModal'
import { countryFlag } from '@/lib/country-flags'

type TopTrack = { id: number; title: string; slug: string | null; cover_url: string | null; video_url: string | null }
export type LineupArtist = {
  id: number; name: string; slug: string | null; country: string | null
  cover_image_url: string | null; headliner: boolean
  genres?: string[]; topTrack?: TopTrack | null
}

function ytId(u?: string | null): string | null {
  if (!u) return null
  const m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/)
  return m ? m[1] : null
}
/** Nuotrauka kortelei: atlikėjo cover → top dainos cover → YouTube thumbnail. */
function artistImg(a: LineupArtist): string | null {
  if (a.cover_image_url) return a.cover_image_url
  const t = a.topTrack
  if (t?.cover_url) return t.cover_url
  const yt = ytId(t?.video_url)
  return yt ? `https://img.youtube.com/vi/${yt}/hqdefault.jpg` : null
}

export default function FestivalLineup({ artists }: { artists: LineupArtist[] }) {
  const [track, setTrack] = useState<{ t: ModalTrack; artistName: string; artistSlug: string } | null>(null)
  const headliners = artists.filter(a => a.headliner)
  const others = artists.filter(a => !a.headliner)

  function play(a: LineupArtist) {
    if (!a.topTrack) return
    setTrack({
      t: { id: a.topTrack.id, title: a.topTrack.title, slug: a.topTrack.slug, video_url: a.topTrack.video_url, cover_url: a.topTrack.cover_url },
      artistName: a.name, artistSlug: a.slug || String(a.id),
    })
  }

  return (
    <>
      {headliners.length > 0 && (
        <>
          <p className="fp-sub">Headlineriai</p>
          <div className="fp-head-grid">
            {headliners.map(a => <Card key={a.id} a={a} big onPlay={play} />)}
          </div>
        </>
      )}
      {others.length > 0 && (
        <>
          {headliners.length > 0 && <p className="fp-sub">Kiti atlikėjai</p>}
          <div className="fp-art-grid">
            {others.map(a => <Card key={a.id} a={a} onPlay={play} />)}
          </div>
        </>
      )}

      {track && (
        <TrackInfoModal
          track={track.t}
          artistName={track.artistName}
          artistSlug={track.artistSlug}
          onClose={() => setTrack(null)}
        />
      )}
    </>
  )
}

function Card({ a, big, onPlay }: { a: LineupArtist; big?: boolean; onPlay: (a: LineupArtist) => void }) {
  const img = artistImg(a)
  const flag = countryFlag(a.country)
  const hasPlay = !!a.topTrack?.video_url

  return (
    <div className={`fp-artist${big ? ' big' : ''}`}>
      <Link href={`/atlikejai/${a.slug || a.id}`} className="fp-artist-av" style={{ background: img ? undefined : `hsl(${(a.name.charCodeAt(0) || 65) * 17 % 360},32%,17%)` }}>
        {img
          ? <img src={img} alt={a.name} loading="lazy" referrerPolicy="no-referrer" />
          : <span className="fp-artist-i">{a.name[0]?.toUpperCase()}</span>}
        {hasPlay && (
          <button type="button" className="fp-artist-play" title={`Klausytis: ${a.topTrack!.title}`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPlay(a) }}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        )}
      </Link>
      <Link href={`/atlikejai/${a.slug || a.id}`} className="fp-artist-info">
        <span className="fp-artist-name">{flag && <span className="fp-flag">{flag}</span>}{a.name}</span>
        {big && a.genres && a.genres.length > 0 && <span className="fp-artist-gen">{a.genres.slice(0, 2).join(' · ')}</span>}
      </Link>
    </div>
  )
}
