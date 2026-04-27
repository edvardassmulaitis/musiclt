// app/dainos/[slugId]/page.tsx
import React from 'react'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import TrackPageClient from '@/app/lt/daina/[slug]/[id]/track-page-client'

export const revalidate = 0

function parseSlugId(slugId: string): { slug: string; id: number } | null {
  const m = slugId.match(/^(.+)-(\d+)$/)
  if (!m) return null
  const id = parseInt(m[2], 10)
  if (isNaN(id)) return null
  return { slug: m[1], id }
}

export async function generateMetadata({ params }: { params: Promise<{ slugId: string }> }) {
  const { slugId } = await params
  const parsed = parseSlugId(slugId)
  if (!parsed) return { title: 'Daina – music.lt' }

  const supabase = createAdminClient()
  const { data: track } = await supabase
    .from('tracks')
    .select('title, description')
    .eq('id', parsed.id)
    .single()

  if (!track) return { title: 'Daina – music.lt' }
  return {
    title: `${track.title} – music.lt`,
    description: track.description ?? undefined,
  }
}

export default async function DainaPage({ params }: { params: Promise<{ slugId: string }> }): Promise<React.ReactElement> {
  const { slugId } = await params
  const parsed = parseSlugId(slugId)
  if (!parsed) notFound()

  const { slug, id } = parsed
  const supabase = createAdminClient()

  // ── Fetch track ────────────────────────────────────────────────────────────
  const { data: track } = await supabase
    .from('tracks')
    .select(`
      id, slug, title, type, video_url, spotify_id, release_date,
      lyrics, chords, description, show_player, is_new, show_ai_interpretation,
      ai_interpretation, ai_image_url,
      artist_id, legacy_id, source,
      score, score_breakdown, peak_chart_position, certifications
    `)
    .eq('id', id)
    .single()

  if (!track || track.slug !== slug) notFound()

  // Score'ą rodom tik admin'ams (atskira admin form'a redagavimui).
  // Public puslapis NIEKADA nerodo score breakdown'o.
  ;(track as any).score = null
  ;(track as any).score_breakdown = null

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

  // ── Fetch likes from unified likes table ──────────────────────────────────
  const { count: likes } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'track')
    .eq('entity_id', id)

  // ── Fetch legacy likes from unified table (entity_legacy_id tracking) ──────
  const trackLegacyId = (track as any).legacy_id ?? null
  const [legacyCntRes, legacyUsersRes] = trackLegacyId
    ? await Promise.all([
        supabase
          .from('likes')
          .select('*', { count: 'exact', head: true })
          .eq('entity_type', 'track')
          .eq('entity_legacy_id', trackLegacyId),
        supabase
          .from('likes')
          .select('user_username, user_rank, user_avatar_url')
          .eq('entity_type', 'track')
          .eq('entity_legacy_id', trackLegacyId)
          .order('id', { ascending: true })
          .limit(30),
      ])
    : [{ count: 0 } as any, { data: [] } as any]
  const legacyLikes = {
    count: legacyCntRes.count || 0,
    users: (legacyUsersRes.data as any[]) || [],
  }
  const isLegacy = typeof (track as any).source === 'string' && (track as any).source.startsWith('legacy')

  // ── Fetch lyric reactions ──────────────────────────────────────────────────
  const { data: lyricComments } = await supabase
    .from('track_lyric_comments')
    .select('id, selection_start, selection_end, selected_text, type, text, likes, created_at')
    .eq('track_id', id)
    .order('created_at', { ascending: true })

  // ── Fetch entity_comments (music.lt komentarai prie dainos) ───────────────
  // Music.lt'e kiekvienos dainos puslapyje yra "Komentarai (N)" sekcija.
  // Scraper'is parsina jas į entity_comments lentelę su entity_type='track'
  // ir entity_legacy_id = music.lt track legacy_id.
  const trackLegacyIdForComments = (track as any).legacy_id ?? null
  const { data: entityComments } = trackLegacyIdForComments
    ? await supabase
        .from('entity_comments')
        .select('legacy_id, author_username, author_avatar_url, created_at, content_html, content_text, like_count')
        .eq('entity_type', 'track')
        .eq('entity_legacy_id', trackLegacyIdForComments)
        .order('created_at', { ascending: true })
    : { data: [] as any[] }

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
      track={{ ...track, featuring, show_ai_interpretation: track.show_ai_interpretation ?? false } as any}
      artist={artistRow as any}
      albums={albums as any}
      versions={(versionRows ?? []) as any}
      likes={likes ?? 0}
      lyricComments={(lyricComments ?? []) as any}
      entityComments={(entityComments ?? []) as any}
      trivia={trivia}
      relatedTracks={relatedTracks as any}
      aiInterpretation={(track as any).ai_interpretation ?? null}
      isLegacy={isLegacy}
      legacyLikes={legacyLikes}
    />
  )
}
