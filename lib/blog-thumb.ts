// lib/blog-thumb.ts
//
// Bendras blog įrašų miniatiūrų (cover) fallback'as. Kai įrašas NETURI
// `cover_image_url`, vaizdą bandome surasti iš (ta pati logika kaip
// /api/home/community, kad homepage hero IR /bendruomene rodytų vienodai):
//   1) susietų tracks / albums / artists (blog_post_* lentelės),
//   2) target_track_id / target_album_id / target_artist_id entity,
//   3) topas įrašo list_items pirmų 3 įrašų image_url / entity cover.

import { createAdminClient } from '@/lib/supabase'

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

function ytThumb(url?: string | null): string | null {
  const m = url?.match?.(YT_RE)?.[1]
  return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null
}
function first<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export type ThumbResolvablePost = {
  id: number
  cover_image_url?: string | null
  post_type?: string | null
  list_items?: any[] | null
  target_track_id?: number | null
  target_album_id?: number | null
  target_artist_id?: number | null
}

/** Grąžina Map<post_id, thumbUrl> TIK tiems įrašams, kurie neturi
 *  cover_image_url ir kuriems pavyko rasti fallback vaizdą. */
export async function resolveBlogThumbs(rows: ThumbResolvablePost[]): Promise<Map<number, string>> {
  const thumbByPost = new Map<number, string>()
  const needThumb = rows.filter(b => !b.cover_image_url).map(b => b.id)
  if (!needThumb.length) return thumbByPost

  const sb = createAdminClient()
  const tgtTracks = new Set<number>(), tgtAlbums = new Set<number>(), tgtArtists = new Set<number>()
  const topasTracks = new Set<number>(), topasArtists = new Set<number>()
  for (const b of rows) {
    if (b.cover_image_url) continue
    if (b.target_track_id) tgtTracks.add(b.target_track_id)
    if (b.target_album_id) tgtAlbums.add(b.target_album_id)
    if (b.target_artist_id) tgtArtists.add(b.target_artist_id)
    if (b.post_type === 'topas' && Array.isArray(b.list_items)) {
      for (const e of b.list_items.slice(0, 3)) {
        if (e.image_url) break
        if (e.entity_id) {
          if (e.type === 'artist') topasArtists.add(e.entity_id)
          else if (e.type === 'track') topasTracks.add(e.entity_id)
        }
      }
    }
  }

  try {
    const [tj, aj, arj, tgtT, tgtA, tgtAr, tpT, tpAr] = await Promise.all([
      sb.from('blog_post_tracks').select('post_id, tracks:track_id(video_url, cover_url, artist:artist_id(cover_image_url))').in('post_id', needThumb),
      sb.from('blog_post_albums').select('post_id, albums:album_id(cover_image_url)').in('post_id', needThumb),
      sb.from('blog_post_artists').select('post_id, artists:artist_id(cover_image_url)').in('post_id', needThumb),
      tgtTracks.size ? sb.from('tracks').select('id, cover_url, video_url, artist:artist_id(cover_image_url)').in('id', [...tgtTracks]) : Promise.resolve({ data: [] as any[] }),
      tgtAlbums.size ? sb.from('albums').select('id, cover_image_url').in('id', [...tgtAlbums]) : Promise.resolve({ data: [] as any[] }),
      tgtArtists.size ? sb.from('artists').select('id, cover_image_url').in('id', [...tgtArtists]) : Promise.resolve({ data: [] as any[] }),
      topasTracks.size ? sb.from('tracks').select('id, cover_url, video_url, artist:artist_id(cover_image_url)').in('id', [...topasTracks]) : Promise.resolve({ data: [] as any[] }),
      topasArtists.size ? sb.from('artists').select('id, cover_image_url').in('id', [...topasArtists]) : Promise.resolve({ data: [] as any[] }),
    ])

    const trackImgOf = (t: any) => ytThumb(t.video_url) || t.cover_url || first<any>(t.artist)?.cover_image_url || null

    for (const row of (tj.data || []) as any[]) {
      if (thumbByPost.has(row.post_id)) continue
      const t = first<any>(row.tracks); if (!t) continue
      const img = trackImgOf(t); if (img) thumbByPost.set(row.post_id, img)
    }
    for (const row of (aj.data || []) as any[]) {
      if (thumbByPost.has(row.post_id)) continue
      const a = first<any>(row.albums); if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
    }
    for (const row of (arj.data || []) as any[]) {
      if (thumbByPost.has(row.post_id)) continue
      const a = first<any>(row.artists); if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
    }

    const tgtTrackImg = new Map<number, string | null>()
    for (const t of (tgtT.data || []) as any[]) tgtTrackImg.set(t.id, trackImgOf(t))
    const tgtAlbumImg = new Map<number, string>((tgtA.data || []).map((a: any) => [a.id, a.cover_image_url]))
    const tgtArtistImg = new Map<number, string>((tgtAr.data || []).map((a: any) => [a.id, a.cover_image_url]))
    const topTrackImg = new Map<number, string | null>()
    for (const t of (tpT.data || []) as any[]) topTrackImg.set(t.id, trackImgOf(t))
    const topArtistImg = new Map<number, string>((tpAr.data || []).map((a: any) => [a.id, a.cover_image_url]))

    for (const b of rows) {
      if (thumbByPost.has(b.id) || b.cover_image_url) continue
      const img =
        (b.target_track_id && tgtTrackImg.get(b.target_track_id)) ||
        (b.target_album_id && tgtAlbumImg.get(b.target_album_id)) ||
        (b.target_artist_id && tgtArtistImg.get(b.target_artist_id)) || null
      if (img) { thumbByPost.set(b.id, img); continue }
      if (b.post_type === 'topas' && Array.isArray(b.list_items)) {
        for (const e of b.list_items.slice(0, 3)) {
          if (e.image_url) { thumbByPost.set(b.id, e.image_url); break }
          const eImg = (e.entity_id && e.type === 'artist' && topArtistImg.get(e.entity_id)) ||
                       (e.entity_id && e.type === 'track' && topTrackImg.get(e.entity_id)) || null
          if (eImg) { thumbByPost.set(b.id, eImg); break }
        }
      }
    }
  } catch {}

  return thumbByPost
}
