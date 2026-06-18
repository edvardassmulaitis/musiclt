// lib/blog-player.ts
//
// Blog post player'io grojaraščio sudarymas. Tikslas (2026-06-18 Edvardo
// prašymu): player'is VISADA naudoja MŪSŲ duomenų bazėje suvestas susijusias
// dainas ir groja per YouTube video — NIEKADA Spotify embed'ą. Stilius +
// elementas identiškas atlikėjo puslapio (/atlikejai/[slug]) player'iui.
//
// Šaltinių prioritetas (visi tik su YouTube video):
//   1. Rankiniu būdu prisegtos dainos (blog_post_tracks)
//   2. Target albumo dainos (review/translation su target_album_id)
//   3. Target / prisegto atlikėjo populiariausios dainos (top pagal views)
//   4. Fallback: body'je įdėti YouTube embed'ai (be metrikų)
// Spotify embed'ai atmetami visur.

import { type ExtractedTrack } from '@/lib/blog-content'

export type BlogPlayerTrack = {
  key: string
  title: string
  artist_name?: string | null
  artist_slug?: string | null
  track_id?: number | null
  track_slug?: string | null
  youtube_id: string
  cover_url?: string | null
  // PopBar metrikoms (per-list relative leveler — kaip atlikėjo psl.)
  video_views?: number
  release_year?: number | null
  release_month?: number | null
  release_day?: number | null
  release_date?: string | null
  is_single?: boolean
}

/** Ištraukia YouTube video id iš watch / youtu.be / embed URL'o. */
export function ytIdFromUrl(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube(?:-nocookie)?\.com\/embed\/)([\w-]{6,})/)
  return m ? m[1] : null
}

const TRACK_SELECT =
  'id,slug,title,video_url,cover_url,video_views,release_year,release_month,release_day,release_date,is_single,artist:artist_id(slug,name)'

function rowToPlayerTrack(row: any): BlogPlayerTrack | null {
  const yid = ytIdFromUrl(row?.video_url)
  if (!yid) return null
  const a = Array.isArray(row.artist) ? row.artist[0] : row.artist
  return {
    key: `db:${row.id}`,
    title: row.title,
    artist_name: a?.name ?? null,
    artist_slug: a?.slug ?? null,
    track_id: row.id,
    track_slug: row.slug ?? null,
    youtube_id: yid,
    cover_url: row.cover_url || `https://i.ytimg.com/vi/${yid}/hqdefault.jpg`,
    video_views: Number(row.video_views) || 0,
    release_year: row.release_year ?? null,
    release_month: row.release_month ?? null,
    release_day: row.release_day ?? null,
    release_date: row.release_date ?? null,
    is_single: !!row.is_single,
  }
}

/** ExtractedTrack (body embed) → BlogPlayerTrack. TIK youtube source'ui. */
export function extractedToPlayerTrack(e: ExtractedTrack): BlogPlayerTrack | null {
  if (e.source !== 'youtube') return null
  const yid = ytIdFromUrl(e.embed_url) || ytIdFromUrl(e.source_url)
  if (!yid) return null
  const db = (e as any).db_track
  return {
    key: e.key || `yt:${yid}`,
    title: e.title || 'YouTube vaizdo įrašas',
    artist_name: e.artist_name ?? null,
    artist_slug: db?.artist_slug ?? null,
    track_id: db?.id ?? null,
    track_slug: db?.slug ?? null,
    youtube_id: yid,
    cover_url: e.cover_url || `https://i.ytimg.com/vi/${yid}/hqdefault.jpg`,
    video_views: 0,
  }
}

type BuildOpts = {
  manualTrackIds?: number[]
  albumId?: number | null
  artistId?: number | null
  fallbackEmbeds?: ExtractedTrack[]
  limit?: number
}

/** Sudaro player'io grojaraštį pagal prioritetą. `sb` = admin Supabase client. */
export async function buildBlogPlayerTracks(sb: any, opts: BuildOpts): Promise<BlogPlayerTrack[]> {
  const limit = opts.limit ?? 12

  // 1. Rankinės prisegtos dainos
  if (opts.manualTrackIds && opts.manualTrackIds.length) {
    try {
      const { data } = await sb.from('tracks').select(TRACK_SELECT)
        .in('id', opts.manualTrackIds).not('video_url', 'is', null)
      const list = (data || []).map(rowToPlayerTrack).filter(Boolean) as BlogPlayerTrack[]
      // Išlaikom rankinio prisegimo eilę
      const order = new Map(opts.manualTrackIds.map((id, i) => [id, i]))
      list.sort((a, b) => (order.get(a.track_id!) ?? 0) - (order.get(b.track_id!) ?? 0))
      if (list.length) return list
    } catch { /* fallthrough */ }
  }

  // 2. Target albumo dainos
  if (opts.albumId) {
    try {
      const { data: at } = await sb.from('album_tracks').select('track_id').eq('album_id', opts.albumId)
      const ids = (at || []).map((r: any) => r.track_id).filter(Boolean)
      if (ids.length) {
        const { data } = await sb.from('tracks').select(TRACK_SELECT)
          .in('id', ids).not('video_url', 'is', null)
          .order('video_views', { ascending: false, nullsFirst: false }).limit(limit)
        const list = (data || []).map(rowToPlayerTrack).filter(Boolean) as BlogPlayerTrack[]
        if (list.length) return list
      }
    } catch { /* fallthrough */ }
  }

  // 3. Atlikėjo populiariausios YT dainos
  if (opts.artistId) {
    try {
      const { data } = await sb.from('tracks').select(TRACK_SELECT)
        .eq('artist_id', opts.artistId).not('video_url', 'is', null)
        .order('video_views', { ascending: false, nullsFirst: false }).limit(limit)
      const list = (data || []).map(rowToPlayerTrack).filter(Boolean) as BlogPlayerTrack[]
      if (list.length) return list
    } catch { /* fallthrough */ }
  }

  // 4. Fallback — body YouTube embed'ai
  return (opts.fallbackEmbeds || []).map(extractedToPlayerTrack).filter(Boolean) as BlogPlayerTrack[]
}

// redeploy 192212
