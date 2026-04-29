// app/dainos/[slugId]/page.tsx
//
// URL pattern: /dainos/{artist-slug}-{track-slug}-{id}
//   pvz. /dainos/atlanta-kregzdutes-kregzdutes-29293
//
// SEO: artist name URL'e — Genius/SoundCloud style. ID gale dėl unikalumo.
// Slug verifikuojamas po DB lookup'o; jei neatitinka → 301 redirect į
// canonical. Tai apsaugo nuo:
//   - Senų URL'ų be artist prefix'o (/dainos/kregzdutes-29293)
//   - Spelling renames (po artist/track slug pakeitimo)
import React from 'react'
import { notFound, redirect } from 'next/navigation'
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
  // Track'ą reikia paimti pirmiausia, nes iš jo gauname artist_id, legacy_id
  // ir title — visi kiti queries jais remiasi. Po to viską likusią paleidžiam
  // vienu Promise.all batch'u (waterfall'as iš 10 sekvencinių queries → 2
  // batch'ai). TTFB drop'as nuo ~2s iki ~0.5s ant prod.
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

  if (!track) notFound()

  // Score'ą rodom tik admin'ams (atskira admin form'a redagavimui).
  // Public puslapis NIEKADA nerodo score breakdown'o.
  ;(track as any).score = null
  ;(track as any).score_breakdown = null

  const trackLegacyId = (track as any).legacy_id ?? null
  const titleFragment = track.title.split('(')[0].split('-')[0].trim().slice(0, 20)

  // ── ALL remaining queries in PARALLEL ────────────────────────────────────
  // Anksčiau buvo 10 sekvencinių await'ų (artist → featuring → albums →
  // likes → legacy likes → lyric → entity → versions → related). Dabar
  // viskas vienu Promise.all → max query time, ne sum.
  const [
    artistRes,
    featuringRes,
    albumTrackRes,
    likesRes,
    legacyCntRes,
    legacyUsersRes,
    lyricCommentsRes,
    entityCommentsRes,
    versionsRes,
    relatedRes,
  ] = await Promise.all([
    supabase
      .from('artists')
      .select('id, slug, name, cover_image_url')
      .eq('id', track.artist_id)
      .single(),
    supabase
      .from('track_artists')
      .select('artists(id, slug, name, cover_image_url)')
      .eq('track_id', id)
      .neq('artist_id', track.artist_id),
    supabase
      .from('album_tracks')
      .select('albums!album_tracks_album_id_fkey(id, slug, title, year, cover_image_url, type_studio, type)')
      .eq('track_id', id),
    supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('entity_type', 'track')
      .eq('entity_id', id),
    trackLegacyId
      ? supabase
          .from('likes')
          .select('*', { count: 'exact', head: true })
          .eq('entity_type', 'track')
          .eq('entity_legacy_id', trackLegacyId)
      : Promise.resolve({ count: 0 } as any),
    trackLegacyId
      ? supabase
          .from('likes')
          .select('user_username, user_rank, user_avatar_url')
          .eq('entity_type', 'track')
          .eq('entity_legacy_id', trackLegacyId)
          .order('id', { ascending: true })
          .limit(30)
      : Promise.resolve({ data: [] } as any),
    supabase
      .from('track_lyric_comments')
      .select('id, selection_start, selection_end, selected_text, type, text, likes, created_at')
      .eq('track_id', id)
      .order('created_at', { ascending: true }),
    trackLegacyId
      ? supabase
          .from('entity_comments')
          .select('legacy_id, author_username, author_avatar_url, created_at, content_html, content_text, like_count')
          .eq('entity_type', 'track')
          .eq('entity_legacy_id', trackLegacyId)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as any[] } as any),
    supabase
      .from('tracks')
      .select('id, slug, title, type, video_url')
      .eq('artist_id', track.artist_id)
      .ilike('title', `%${titleFragment}%`)
      .neq('id', id)
      .limit(10),
    supabase
      .from('tracks')
      .select('id, slug, title, type, video_url, is_new, release_date')
      .eq('artist_id', track.artist_id)
      .neq('id', id)
      .order('release_date', { ascending: false })
      .limit(8),
  ])

  const artistRow = (artistRes as any).data
  if (!artistRow) notFound()

  // ── Canonical slug check ─────────────────────────────────────────────────
  // Canonical URL: /dainos/{artist-slug}-{track-slug}-{id}
  // Jei vartotojas atėjo URL'u be artist prefix'o (legacy) arba su pasenusiu
  // slug'u, redirect'inam 301 į canonical.
  const canonicalSlug = `${artistRow.slug}-${track.slug}`
  if (slug !== canonicalSlug) {
    redirect(`/dainos/${canonicalSlug}-${id}`)
  }

  const featuring = ((featuringRes as any).data ?? [])
    .map((r: any) => r.artists)
    .filter(Boolean)

  const albums = ((albumTrackRes as any).data ?? [])
    .map((r: any) => r.albums)
    .filter(Boolean)
    .map((a: any) => ({
      ...a,
      type: a.type_studio ? 'Studijinis albumas' : (a.type ?? 'Albumas'),
    }))

  const likes = (likesRes as any).count ?? 0

  const legacyLikes = {
    count: (legacyCntRes as any).count || 0,
    users: ((legacyUsersRes as any).data as any[]) || [],
  }
  const isLegacy = typeof (track as any).source === 'string' && (track as any).source.startsWith('legacy')

  const lyricComments = (lyricCommentsRes as any).data ?? []
  const entityComments = (entityCommentsRes as any).data ?? []
  const versionRows = (versionsRes as any).data ?? []

  // ── Wikipedia trivia ───────────────────────────────────────────────────────
  // Placeholder — will be fetched from /api/tracks/[id]/wiki-fact in future
  const trivia: string | null = null

  const relatedTracks = (((relatedRes as any).data) ?? []).map((t: any) => ({
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
