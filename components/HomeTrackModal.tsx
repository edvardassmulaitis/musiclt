'use client'

// components/HomeTrackModal.tsx
//
// Plonas wrapper'is homepage'ui. Paima lengvą track objektą (iš
// /api/home/latest „Naujos dainos" payload'o), dofetchina pilną info per
// /api/tracks/[id] ir renderina BENDRĄ TrackInfoModal komponentą — tą patį,
// kurį naudoja artist page (app/atlikejai/[slug]/artist-profile-client.tsx).
//
// 2026-05-29: anksčiau čia gyveno atskira, supaprastinta modalo kopija, kuri
// nukrypdavo nuo artist versijos (pvz. rodydavo 0 like'ų, neturėjo
// interaktyvių komentarų). Dabar — vienas šaltinis, visi pakeitimai galioja
// abiejose vietose.

import { useState, useEffect } from 'react'
import { TrackInfoModal, type ModalTrack } from '@/components/TrackInfoModal'

type HomeTrack = {
  id: number
  title: string
  slug?: string | null
  cover_url?: string | null
  video_url?: string | null
  video_uploaded_at?: string | null
  release_date?: string | null
  release_year?: number | null
  artists?: { id: number; slug: string; name: string; cover_image_url?: string | null } | null
  artist_slug?: string | null
  artist_name?: string | null
}

export function HomeTrackModal({ track, onClose }: { track: HomeTrack | null; onClose: () => void }) {
  // extra — pilni duomenys iš /api/tracks/[id]: lyrics, like_count (skaičiuotas
  // iš `likes` lentelės, ne stale column'o), duration, release detalės, albumai,
  // featuring. null kol kraunasi → modalas rodo lengvus duomenis iš karto.
  const [extra, setExtra] = useState<Partial<ModalTrack> | null>(null)

  useEffect(() => {
    if (!track) { setExtra(null); return }
    let alive = true
    setExtra(null)
    fetch(`/api/tracks/${track.id}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        const albums = Array.isArray(d.albums)
          ? d.albums.map((a: any) => ({
              id: a.album_id ?? a.id,
              slug: a.slug ?? '',
              title: a.album_title ?? a.title ?? '',
              year: a.album_year ?? a.year ?? null,
              cover_image_url: a.cover_image_url ?? null,
            }))
          : []
        setExtra({
          lyrics: d.lyrics ?? null,
          like_count: typeof d.like_count === 'number' ? d.like_count : null,
          duration: d.duration ?? null,
          release_year: d.release_year ?? null,
          release_month: d.release_month ?? null,
          release_date: d.release_date ?? null,
          video_url: d.video_url ?? null,
          featuring: Array.isArray(d.featuring) ? d.featuring : [],
          albums,
        })
      })
      .catch(() => { if (alive) setExtra({}) })
    return () => { alive = false }
  }, [track?.id])

  if (!track) return null

  const artist = track.artists
  const artistName = artist?.name || track.artist_name || ''
  const artistSlug = artist?.slug || track.artist_slug || ''
  const artistThumbUrl = artist?.cover_image_url || null

  // Merge: extra reikšmės turi pirmenybę, bet jei extra dar nėra (kraunasi) ar
  // grąžino null — fallback į lengvus homepage duomenis (kad video/data matytųsi
  // iš karto, be flickerio).
  const merged: ModalTrack = {
    id: track.id,
    title: track.title,
    slug: track.slug ?? null,
    cover_url: track.cover_url ?? null,
    video_url: extra?.video_url ?? track.video_url ?? null,
    release_date: extra?.release_date ?? track.release_date ?? null,
    release_year: extra?.release_year ?? track.release_year ?? null,
    release_month: extra?.release_month ?? null,
    lyrics: extra?.lyrics ?? null,
    like_count: extra?.like_count ?? null,
    duration: extra?.duration ?? null,
    featuring: extra?.featuring ?? [],
    albums: extra?.albums ?? [],
  }

  return (
    <TrackInfoModal
      track={merged}
      artistName={artistName}
      artistSlug={artistSlug}
      artistThumbUrl={artistThumbUrl}
      onClose={onClose}
    />
  )
}
