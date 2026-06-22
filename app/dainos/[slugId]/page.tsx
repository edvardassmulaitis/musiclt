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
import React, { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import TrackPageClient from '@/app/lt/daina/[slug]/[id]/track-page-client'
import { PageLoader } from '@/components/PageLoader'
// Teminių dainų kolekcijų interception: /dainos/{collection-slug} (be -{id} gale)
// rodo kuruotą kolekciją, o ne dainą. Next.js neleidžia /dainos/[collection]
// sibling'o šalia /dainos/[slugId], todėl branch'inam čia.
import { isSongCollectionSlug } from '@/lib/collections-db'
import SongCollectionView, { songCollectionMetadata } from '@/components/muzika/SongCollectionView'

// Function-level cache (60s TTL) — žr. /atlikejai/[slug]/page.tsx
// komentarą, kodėl naudojam unstable_cache vietoj revalidate config'o
// (Supabase JS klientas vidiniai naudoja cache: no-store).
const TRACK_CACHE_TTL = 60

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
  if (!parsed) {
    if (await isSongCollectionSlug(slugId)) return songCollectionMetadata(slugId)
    return { title: 'Daina – music.lt' }
  }

  // PERF: reuse fetchTrackData (unstable_cache) vietoj atskiros DB query —
  // metadata + page render dalinasi vienu fetch'u (cache warm-up).
  const data = await fetchTrackData(parsed.id)
  if (!data?.track) return { title: 'Daina – music.lt' }
  const artistName = data.artistRow?.name
  return {
    title: `${data.track.title}${artistName ? ` – ${artistName}` : ''} – music.lt`,
    description: data.track.description ?? undefined,
  }
}

// SUSPENSE PATTERN — žr. /atlikejai/[slug]/page.tsx komentarą. parseSlugId
// pati nieko neužklauisa (URL parse), todėl iškart grąžinam Suspense
// wrapper'į ir slow queries vykdom <TrackContent> viduje.
export default async function DainaPage({ params }: { params: Promise<{ slugId: string }> }): Promise<React.ReactElement> {
  const { slugId } = await params
  const parsed = parseSlugId(slugId)
  if (!parsed) {
    if (await isSongCollectionSlug(slugId)) return <SongCollectionView slug={slugId} />
    notFound()
  }

  return (
    <Suspense fallback={<PageLoader variant="track" />}>
      <TrackContent slug={parsed.slug} id={parsed.id} />
    </Suspense>
  )
}

// Cache'inam visus track page queries (60s) — sekantys hit'ai per 60s
// gauna iš function memory cache'o (~50-200ms) vietoj re-running queries.
//
// PERF 2026-06-11: numesti 4 nenaudojami query'iai (legacy likes count +
// users, lyric comments, entity comments) — TrackPageClient jų NENAUDOJO
// (EntityCommentsBlock ir LyricsWithReactions patys fetch'ina client-side).
// 10 queries → 6. Cache key v2 (shape pasikeitė, +duration).
const fetchTrackData = unstable_cache(
  async (id: number) => {
    const supabase = createAdminClient()
    const { data: track } = await supabase
      .from('tracks')
      .select(`
        id, slug, title, type, video_url, spotify_id, release_date, release_year, release_month,
        lyrics, chords, description, show_player, is_new, show_ai_interpretation,
        ai_interpretation, ai_image_url,
        artist_id, legacy_id, source,
        score, score_breakdown, peak_chart_position, certifications
      `)
      .eq('id', id)
      .single()
    if (!track) return null
    ;(track as any).score = null
    ;(track as any).score_breakdown = null

    const titleFragment = track.title.split('(')[0].split('-')[0].trim().slice(0, 20)

    const [artistRes, featuringRes, albumTrackRes, likesRes, versionsRes, relatedRes] = await Promise.all([
      supabase.from('artists').select('id, slug, name, cover_image_url, cover_image_wide_url, description').eq('id', track.artist_id).single(),
      supabase.from('track_artists').select('artists(id, slug, name, cover_image_url)').eq('track_id', id).neq('artist_id', track.artist_id),
      supabase.from('album_tracks').select('albums!album_tracks_album_id_fkey(id, slug, title, year, cover_image_url, type_studio, type)').eq('track_id', id),
      supabase.from('likes').select('*', { count: 'exact', head: true }).eq('entity_type', 'track').eq('entity_id', id),
      supabase.from('tracks').select('id, slug, title, type, video_url').eq('artist_id', track.artist_id).ilike('title', `%${titleFragment}%`).neq('id', id).limit(10),
      supabase.from('tracks').select('id, slug, title, type, video_url, is_new, release_date').eq('artist_id', track.artist_id).neq('id', id).order('release_date', { ascending: false }).limit(8),
    ])
    return {
      track,
      artistRow: (artistRes as any).data,
      featuringRows: (featuringRes as any).data ?? [],
      albumTrackRows: (albumTrackRes as any).data ?? [],
      likes: (likesRes as any).count ?? 0,
      versionRows: (versionsRes as any).data ?? [],
      relatedRows: (relatedRes as any).data ?? [],
    }
  },
  ['track-full-data-v2'],
  { revalidate: TRACK_CACHE_TTL, tags: ['track'] },
)

async function TrackContent({ slug, id }: { slug: string; id: number }): Promise<React.ReactElement> {
  const data = await fetchTrackData(id)
  if (!data) notFound()
  const { track, artistRow, featuringRows, albumTrackRows, likes, versionRows, relatedRows } = data
  if (!artistRow) notFound()

  // ── Canonical slug check ─────────────────────────────────────────────────
  // Canonical URL: /dainos/{artist-slug}-{track-slug}-{id}
  const canonicalSlug = `${artistRow.slug}-${track.slug}`
  if (slug !== canonicalSlug) {
    redirect(`/dainos/${canonicalSlug}-${id}`)
  }

  const featuring = (featuringRows as any[])
    .map((r: any) => r.artists)
    .filter(Boolean)

  const albums = (albumTrackRows as any[])
    .map((r: any) => r.albums)
    .filter(Boolean)
    .map((a: any) => ({ ...a, type: a.type_studio ? 'Studijinis albumas' : (a.type ?? 'Albumas') }))

  // ── Wikipedia trivia placeholder ──
  const trivia: string | null = null

  const relatedTracks = (relatedRows as any[]).map((t: any) => ({
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
      trivia={trivia}
      relatedTracks={relatedTracks as any}
      aiInterpretation={(track as any).ai_interpretation ?? null}
    />
  )
}

