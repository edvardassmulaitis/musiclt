import { createAdminClient } from '@/lib/supabase'

// ============================================================================
// Tipai
// ============================================================================

export type VotingType = 'single' | 'top_n' | 'rating'
export type ParticipantType = 'artist' | 'artist_song' | 'artist_album'
export type VotingStatus = 'draft' | 'voting_open' | 'voting_closed' | 'archived'
export type ResultsVisibility = 'always' | 'after_close' | 'never'

export type VotingChannel = {
  id: number
  slug: string
  name: string
  description?: string | null
  logo_url?: string | null
  cover_image_url?: string | null
  is_active: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export type VotingEdition = {
  id: number
  channel_id: number
  slug: string
  name: string
  year?: number | null
  description?: string | null
  cover_image_url?: string | null
  status: VotingStatus
  vote_open?: string | null
  vote_close?: string | null
  results_visible: ResultsVisibility
  sort_order: number
  metadata?: Record<string, any> | null
}

export type VotingEvent = {
  id: number
  edition_id: number
  slug: string
  name: string
  description?: string | null
  participant_type: ParticipantType
  voting_type: VotingType
  voting_top_n?: number | null
  rating_max: number
  requires_login: boolean
  anon_vote_limit: number
  user_vote_limit: number
  status: VotingStatus
  vote_open?: string | null
  vote_close?: string | null
  results_visible: ResultsVisibility
  sort_order: number
  metadata?: Record<string, any> | null
}

export type VotingParticipant = {
  id: number
  event_id: number
  artist_id?: number | null
  track_id?: number | null
  album_id?: number | null
  display_name?: string | null
  display_subtitle?: string | null
  country?: string | null
  photo_url?: string | null
  video_url?: string | null
  lyrics?: string | null
  bio?: string | null
  metadata?: Record<string, any> | null
  sort_order: number
  is_disqualified: boolean
}

export type ParticipantEnriched = VotingParticipant & {
  artist?: { id: number; slug: string; name: string; cover_image_url?: string } | null
  track?: { id: number; slug: string; title: string; youtube_url?: string; cover_url?: string } | null
  album?: { id: number; slug: string; title: string; cover_url?: string } | null
  vote_count?: number
  avg_rating?: number
  top_n_score?: number
}

// ============================================================================
// Slugify (LT diakritiniai)
// ============================================================================
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ąčęėįšųūž]/g, c =>
      ({ ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z' }[c] || c)
    )
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

// ============================================================================
// Enrichment: prijungia artist/track/album duomenis prie participant
// ============================================================================
export async function enrichParticipants(
  participants: VotingParticipant[]
): Promise<ParticipantEnriched[]> {
  if (!participants.length) return []

  const supabase = createAdminClient()

  const artistIds = participants.map(p => p.artist_id).filter(Boolean) as number[]
  const trackIds = participants.map(p => p.track_id).filter(Boolean) as number[]
  const albumIds = participants.map(p => p.album_id).filter(Boolean) as number[]

  const [artistsRes, tracksRes, albumsRes, resultsRes] = await Promise.all([
    artistIds.length
      ? supabase.from('artists').select('id, slug, name, cover_image_url').in('id', artistIds)
      : Promise.resolve({ data: [] as any[] }),
    trackIds.length
      ? supabase.from('tracks').select('id, slug, title, youtube_url, artist_id').in('id', trackIds)
      : Promise.resolve({ data: [] as any[] }),
    albumIds.length
      ? supabase.from('albums').select('id, slug, title, cover_url').in('id', albumIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from('voting_event_results')
      .select('participant_id, vote_count, avg_rating, top_n_score')
      .in('participant_id', participants.map(p => p.id)),
  ])

  const artistMap = new Map((artistsRes.data || []).map((a: any) => [a.id, a]))
  const trackMap = new Map((tracksRes.data || []).map((t: any) => [t.id, t]))
  const albumMap = new Map((albumsRes.data || []).map((a: any) => [a.id, a]))
  const resultsMap = new Map(
    (resultsRes.data || []).map((r: any) => [r.participant_id, r])
  )

  return participants.map(p => ({
    ...p,
    artist: p.artist_id ? (artistMap.get(p.artist_id) as any) ?? null : null,
    track: p.track_id ? (trackMap.get(p.track_id) as any) ?? null : null,
    album: p.album_id ? (albumMap.get(p.album_id) as any) ?? null : null,
    vote_count: resultsMap.get(p.id)?.vote_count ?? 0,
    avg_rating: Number(resultsMap.get(p.id)?.avg_rating ?? 0),
    top_n_score: Number(resultsMap.get(p.id)?.top_n_score ?? 0),
  }))
}

// ============================================================================
// Helpers: resolve / create artist pagal vardą (naudojama importe)
// ============================================================================
export async function resolveOrCreateArtist(params: {
  name: string
  country?: string
  description?: string
  type?: 'group' | 'solo'
}): Promise<number> {
  const supabase = createAdminClient()
  const slug = slugify(params.name)

  const { data: existing } = await supabase
    .from('artists')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (existing?.id) return existing.id

  const { data: created, error } = await supabase
    .from('artists')
    .insert({
      slug,
      name: params.name,
      country: params.country || null,
      type: params.type || 'group',
      type_music: true,
      type_film: false,
      type_dance: false,
      type_books: false,
      description: params.description || null,
      is_verified: false,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Artist create failed: ${error.message}`)
  return created!.id
}

export async function resolveOrCreateTrack(params: {
  title: string
  artist_id: number
  youtube_url?: string
  lyrics?: string
}): Promise<number> {
  const supabase = createAdminClient()
  const slug = slugify(params.title)

  const { data: existing } = await supabase
    .from('tracks')
    .select('id')
    .eq('slug', slug)
    .eq('artist_id', params.artist_id)
    .maybeSingle()
  if (existing?.id) {
    // Optional: update YouTube URL / lyrics if missing
    if (params.youtube_url || params.lyrics) {
      const update: Record<string, any> = {}
      if (params.youtube_url) update.youtube_url = params.youtube_url
      if (params.lyrics) update.lyrics = params.lyrics
      if (Object.keys(update).length) {
        await supabase.from('tracks').update(update).eq('id', existing.id)
      }
    }
    return existing.id
  }

  const { data: created, error } = await supabase
    .from('tracks')
    .insert({
      slug,
      title: params.title,
      artist_id: params.artist_id,
      youtube_url: params.youtube_url || null,
      lyrics: params.lyrics || null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Track create failed: ${error.message}`)
  return created!.id
}
