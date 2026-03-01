// app/atlikejai/page.tsx
import { createAdminClient } from '@/lib/supabase'
import ArtistsListClient from './artists-list-client'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Atlikėjai — music.lt',
  description: 'Lietuviškos ir pasaulinės muzikos atlikėjai music.lt platformoje',
}

async function getArtists() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('artists')
    .select('id, slug, name, country, type, active_from, active_until, cover_image_url, is_verified')
    .order('name')
    .limit(200)
  return data || []
}

async function getGenres() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('genres')
    .select('id, name')
    .order('name')
  return data || []
}

async function getArtistGenreMap() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('artist_genres')
    .select('artist_id, genre_id, genres(name)')
  const map: Record<number, string[]> = {}
  for (const row of (data || []) as any[]) {
    if (!map[row.artist_id]) map[row.artist_id] = []
    if (row.genres?.name) map[row.artist_id].push(row.genres.name)
  }
  return map
}

export default async function ArtistsPage() {
  const [artists, genres, genreMap] = await Promise.all([
    getArtists(),
    getGenres(),
    getArtistGenreMap(),
  ])

  // Attach genres to artists
  const enriched = artists.map((a: any) => ({
    ...a,
    genres: genreMap[a.id] || [],
  }))

  return <ArtistsListClient artists={enriched} genres={genres} />
}
