// app/lt/daina/[slug]/[id]/page.tsx
import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import TrackPageClient from './track-page-client'

export const revalidate = 3600

type Params = { slug: string; id: string }

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data: track } = await supabase
    .from('tracks')
    .select('title, description')
    .eq('id', id)
    .single()

  if (!track) return { title: 'Daina – music.lt' }
  return {
    title: `${track.title} – music.lt`,
    description: track.description ?? undefined,
  }
}

export default async function TrackPage({ params }: { params: Promise<Params> }) {
  const { slug, id } = await params
  const supabase = createAdminClient()

  // ── Fetch track ────────────────────────────────────────────────────────────
  const { data: track } = await supabase
    .from('tracks')
    .select(`
      id, slug, title, type, video_url, spotify_id, release_date,
      lyrics, chords, description, show_player, is_new, show_ai_interpretation,
      artist_id
    `)
    .eq('id', id)
    .single()

  if (!track || track.slug !== slug) notFound()

  // ── Fetch primary artist ───────────────────────────────────────────────────
  const { data: artistRow } = await supabase
    .from('artists')
    .select('id, slug, name, cover_image_url')
    .eq('id', track.artist_id)
    .single()

  if (!artistRow) notFound()

  // ── Fetch featuring artists ────────────────────────────────────────────────
  const { data: featuringRows } = await supabase
    .from('track_artists')
    .select('artists(id, slug, name, cover_image_url)')
    .eq('track_id', id)
    .neq('artist_id', track.artist_id)

  const featuring = (featuringRows ?? [])
    .map((r: any) => r.artists)
    .filter(Boolean)

  // ── Fetch albums this track appears in ────────────────────────────────────
  const { data: albumTrackRows } = await supabase
    .from('album_tracks')
    .select('albums!album_tracks_album_id_fkey(id, slug, title, year, cover_image_url, type_studio, type)')
    .eq('track_id', id)

  const albums = (albumTrackRows ?? [])
    .map((r: any) => r.albums)
    .filter(Boolean)
    .map((a: any) => ({
      ...a,
      type: a.type_studio ? 'Studijinis albumas' : (a.type ?? 'Albumas'),
    }))

  // ── Fetch likes ────────────────────────────────────────────────────────────
  const { count: likes } = await supabase
    .from('track_likes')
    .select('*', { count: 'exact', head: true })
    .eq('track_id', id)

  // ── Fetch lyric comments ───────────────────────────────────────────────────
  // table: track_lyric_comments (id, track_id, selection_start, selection_end, selected_text, author, avatar_letter, text, likes, created_at)
  const { data: lyricComments } = await supabase
    .from('track_lyric_comments')
    .select('id, selection_start, selection_end, selected_text, author, avatar_letter, text, likes, created_at')
    .eq('track_id', id)
    .order('created_at', { ascending: true })

  // ── Fetch other versions / remixes ─────────────────────────────────────────
  // Same title base or related by artist, different id
  const { data: versionRows } = await supabase
    .from('tracks')
    .select('id, slug, title, type, video_url')
    .eq('artist_id', track.artist_id)
    .ilike('title', `%${track.title.split('(')[0].split('-')[0].trim().slice(0, 20)}%`)
    .neq('id', id)
    .limit(10)

  // ── Wikipedia trivia ───────────────────────────────────────────────────────
  // Placeholder — will be fetched from /api/tracks/[id]/wiki-fact in future
  const trivia: string | null = null

  // ── Related tracks by same artist ─────────────────────────────────────────
  const { data: relatedRows } = await supabase
    .from('tracks')
    .select('id, slug, title, type, video_url, is_new, release_date')
    .eq('artist_id', track.artist_id)
    .neq('id', id)
    .order('release_date', { ascending: false })
    .limit(8)

  const relatedTracks = (relatedRows ?? []).map((t: any) => ({
    ...t,
    spotify_id: null,
    lyrics: null,
    chords: null,
    description: null,
    show_player: false,
    show_ai_interpretation: false,
    featuring: [],
  }))

  return (
    <TrackPageClient
      track={{ ...track, featuring }}
      artist={artistRow}
      albums={albums}
      versions={versionRows ?? []}
      likes={likes ?? 0}
      lyricComments={lyricComments ?? []}
      trivia={trivia}
      relatedTracks={relatedTracks}
    />
  )
}
