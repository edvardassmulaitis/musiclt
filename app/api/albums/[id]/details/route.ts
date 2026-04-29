// app/api/albums/[id]/details/route.ts
//
// Album details JSON endpoint — atspindi tą patį server fetch'ą kaip
// /lt/albumas/[slug]/[id]/page.tsx, bet grąžina JSON formatu, kad
// AlbumInfoModal'ą būtų galima atidaryti lazy iš artist'o page'o nesinešant
// pilnos discography duomenų aparato.
//
// Response shape atitinka AlbumPageClient props (album / artist / tracks /
// otherAlbums / similarAlbums / likes) — tas pats client komponentas
// teoriškai galėtų vartoti šitą fetch'ą, bet šiuo metu naudojam tik modal'ui.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function albumType(a: any) {
  if (a?.type_ep) return 'EP'
  if (a?.type_single) return 'Singlas'
  if (a?.type_live) return 'Live'
  if (a?.type_compilation) return 'Rinkinys'
  if (a?.type_remix) return 'Remix'
  if (a?.type_soundtrack) return 'OST'
  if (a?.type_demo) return 'Demo'
  return 'Albumas'
}

const LT_MONTHS = [
  'sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio',
]
function formatDate(year?: number, month?: number, day?: number) {
  if (!year) return null
  if (month && day) return `${year} m. ${LT_MONTHS[month - 1]} ${day} d.`
  if (month) return `${year} m. ${LT_MONTHS[month - 1]}`
  return `${year} m.`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params
  const albumId = parseInt(rawId, 10)
  if (isNaN(albumId)) {
    return NextResponse.json({ error: 'Invalid album id' }, { status: 400 })
  }

  const sb = createAdminClient()

  const { data: albumRow, error: albumErr } = await sb
    .from('albums')
    .select('*, artists!albums_artist_id_fkey(id, name, slug, cover_image_url, country)')
    .eq('id', albumId)
    .single()
  if (albumErr || !albumRow) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  }
  const album: any = albumRow
  const artist: any = album.artists

  // Tracks
  const { data: trackRows } = await sb
    .from('album_tracks')
    .select('position, is_primary, tracks(id, slug, title, type, video_url, spotify_id, lyrics, is_new, track_artists(is_primary, artists(id, name, slug)))')
    .eq('album_id', albumId)
    .order('position')
  const tracks = ((trackRows || []) as any[]).map((r: any) => {
    const featuring = (r.tracks?.track_artists || [])
      .filter((ta: any) => !ta.is_primary)
      .map((ta: any) => ta.artists?.name)
      .filter(Boolean)
    return {
      id: r.tracks?.id,
      slug: r.tracks?.slug,
      title: r.tracks?.title || '',
      type: r.tracks?.type || 'normal',
      video_url: r.tracks?.video_url || null,
      is_new: r.tracks?.is_new || false,
      is_single: r.is_primary || false,
      position: r.position || 1,
      featuring,
      like_count: 0 as number,
    }
  }).filter((t: any) => t.id)

  // Track like counts (chunked unified-likes lookup)
  const trackIds = tracks.map((t: any) => t.id) as number[]
  if (trackIds.length > 0) {
    const CHUNK = 80
    for (let i = 0; i < trackIds.length; i += CHUNK) {
      const chunk = trackIds.slice(i, i + CHUNK)
      const { data: likeRows } = await sb
        .from('likes')
        .select('entity_id')
        .eq('entity_type', 'track')
        .in('entity_id', chunk)
      const counts = new Map<number, number>()
      for (const l of (likeRows || []) as any[]) {
        counts.set(l.entity_id, (counts.get(l.entity_id) || 0) + 1)
      }
      for (const t of tracks) {
        if (chunk.includes(t.id)) (t as any).like_count = counts.get(t.id) || 0
      }
    }
  }

  // Album likes
  const { count: likesCount } = await sb
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'album')
    .eq('entity_id', albumId)

  // Other albums by same artist
  const { data: otherRows } = await sb
    .from('albums')
    .select('id, slug, title, year, cover_image_url, type_studio, type_ep, type_single, type_live, type_compilation, type_remix, type_soundtrack, type_demo')
    .eq('artist_id', artist.id)
    .neq('id', albumId)
    .order('year', { ascending: false })
    .limit(8)
  const otherAlbums = ((otherRows || []) as any[]).map((a: any) => ({
    id: a.id, slug: a.slug, title: a.title, year: a.year,
    cover_image_url: a.cover_image_url || null,
    type: albumType(a),
  }))

  // Similar albums (same genre, different artist) — pagal genres
  let similarAlbums: any[] = []
  const { data: genreRows } = await sb
    .from('artist_genres')
    .select('genre_id')
    .eq('artist_id', artist.id)
  const genreIds = ((genreRows || []) as any[]).map((g: any) => g.genre_id)
  if (genreIds.length) {
    const { data: artistRows } = await sb
      .from('artist_genres')
      .select('artist_id')
      .in('genre_id', genreIds)
      .neq('artist_id', artist.id)
      .limit(30)
    const otherArtistIds = [...new Set(((artistRows || []) as any[]).map((r: any) => r.artist_id))]
    if (otherArtistIds.length) {
      const { data: simRows } = await sb
        .from('albums')
        .select('id, slug, title, year, cover_image_url, artists!albums_artist_id_fkey(id, name, slug)')
        .in('artist_id', otherArtistIds)
        .not('cover_image_url', 'is', null)
        .order('year', { ascending: false })
        .limit(10)
      similarAlbums = ((simRows || []) as any[]).filter((a: any) => a.id !== albumId)
    }
  }

  return NextResponse.json({
    album: {
      id: album.id,
      slug: album.slug,
      title: album.title,
      type: albumType(album),
      year: album.year,
      month: album.month,
      day: album.day,
      dateFormatted: formatDate(album.year, album.month, album.day),
      cover_image_url: album.cover_image_url || null,
      video_url: album.video_url || null,
      show_player: album.show_player || false,
      is_upcoming: album.is_upcoming || false,
      type_studio: album.type_studio || false,
      legacy_id: album.legacy_id ?? null,
    },
    artist: {
      id: artist.id,
      slug: artist.slug,
      name: artist.name,
      cover_image_url: artist.cover_image_url || null,
    },
    tracks,
    otherAlbums,
    similarAlbums,
    likes: likesCount || 0,
  })
}
