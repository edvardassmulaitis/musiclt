// lib/radaras-shared.ts
//
// KLIENTUI SAUGUS radaro modulis — tik tipai, href helper'iai ir grynos
// utils. JOKIO server importo (createAdminClient, react cache), kad client
// komponentai (filtras, player'is) NEįsitrauktų server kodo / service key'aus.
// Server data sluoksnis gyvena lib/radaras.ts (jis re-export'ina šituos tipus).

import { ltSlugify } from '@/lib/artist-browse'

export type RadarArtist = {
  id: number
  slug: string
  name: string
  country: string | null
  cover_image_url: string | null
  cover_image_position: string | null
  is_verified: boolean | null
  legacy_likes: number | null
  score: number | null
  radar_blurb: string | null
  genres: string[]
  latest_title: string | null
  latest_at: string | null
  is_fresh: boolean
}

export type RadarTrack = {
  id: number
  slug: string | null
  title: string
  cover_url: string | null
  video_url: string | null
  video_views: number | null
  uploaded_at: string | null
  artist_id: number
  artist_name: string
  artist_slug: string
}

export type RadarStats = {
  emerging: number
  freshTracks: number
  featured: number
}

/** Stilius su kiekiu (radaro filtro chip'ams — atspindi kas REALIAI radare). */
export type RadarStyle = { name: string; n: number }

/* ─────────────────────────── Hrefs ─────────────────────────── */
export function radarArtistHref(a: { slug: string }): string {
  return `/atlikejai/${a.slug}`
}
export function radarTrackHref(t: RadarTrack): string {
  // dainos/[slugId] parser tikisi `…-{id}` suffikso.
  if (t.artist_slug && t.slug) return `/dainos/${t.artist_slug}-${t.slug}-${t.id}`
  return `/dainos/${t.slug ? `${t.slug}-` : ''}${t.id}`
}
export function styleHref(name: string): string {
  return `/zanrai/${ltSlugify(name)}`
}

/* ─────────────────────────── Utils ─────────────────────────── */
export function styleLabel(name: string): string {
  return name.replace(/\s*muzika\s*$/i, '').trim() || name
}
export function getYouTubeId(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}
export function ytThumb(url: string | null): string | null {
  const id = getYouTubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null
}
