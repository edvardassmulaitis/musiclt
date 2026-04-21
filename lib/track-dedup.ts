/**
 * Track deduplication helpers.
 *
 * Used in two places:
 *   1. Admin merge flow — /admin/tracks/merge UI calls /api/admin/tracks/duplicates
 *      to suggest merge candidates for a given track.
 *   2. Import-time warnings — /api/admin/import/check-duplicates (TODO) will use
 *      findDuplicatesByTitleAndArtists() to flag potential collisions before
 *      creating a new track during a wiki/discography import.
 *
 * Matching rule (per user's pick in the merge flow design Q&A):
 *   normalizeTitle(A.title) === normalizeTitle(B.title)
 *   AND (artists(A) ∩ artists(B) != ∅)
 *
 * "artists" = main artist + every featuring artist. So "03 Bonnie & Clyde" by
 * Jay-Z (feat. Beyoncé) will match the same song imported under Beyoncé (feat.
 * Jay-Z) — they share both artists.
 */

import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Normalize a track title for duplicate detection.
 *
 *   "03 Bonnie & Clyde (feat. Beyoncé)"  →  "03 bonnie & clyde"
 *   "03 Bonnie and Clyde [Remix]"        →  "03 bonnie and clyde"
 *   "  Naktis  —  Jurga  "               →  "naktis jurga"
 *
 * We strip parenthesized/bracketed suffixes because those are usually variant
 * markers (feat., remix, live, etc.) that we don't want to partition by.
 * A remix of the same song SHOULD be flagged as a possible duplicate; human
 * admin decides whether to actually merge.
 */
export function normalizeTitle(title: string): string {
  if (!title) return ''
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip diacritics (ė → e, ą → a, é → e)
    .replace(/\(.*?\)/g, ' ')          // strip (feat. ...), (Remix), etc.
    .replace(/\[.*?\]/g, ' ')          // strip [Explicit], [Live], etc.
    .replace(/[^a-z0-9& ]+/g, ' ')     // keep only letters, digits, &, spaces
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extract likely featuring artist NAMES from a title string.
 * Used when importing to guess who's featured without relying on explicit metadata.
 *
 *   "03 Bonnie & Clyde (feat. Beyoncé)"  →  ["Beyoncé"]
 *   "Song (ft. A & B)"                   →  ["A", "B"]
 *   "Title feat. X, Y and Z"             →  ["X", "Y", "Z"]
 *
 * Mirror of extractFeatFromTitle regex in admin/tracks/[id]/page.tsx — kept in
 * sync so client-side inference and server-side dedup agree.
 */
export function extractFeaturingNames(title: string): string[] {
  if (!title) return []
  const parenPatterns = [
    /\(\s*feat\.?\s+([^)]+)\)/i,
    /\(\s*ft\.?\s+([^)]+)\)/i,
    /\(\s*featuring\s+([^)]+)\)/i,
    /\(\s*with\s+([^)]+)\)/i,
  ]
  const tailPatterns = [
    /\s+feat\.?\s+(.+?)$/i,
    /\s+ft\.?\s+(.+?)$/i,
    /\s+featuring\s+(.+?)$/i,
  ]
  const names: string[] = []
  for (const re of [...parenPatterns, ...tailPatterns]) {
    const m = title.match(re)
    if (m?.[1]) {
      m[1]
        .split(/\s*(?:,|&|\s+and\s+|\s+\&\s+|\s+ir\s+)\s*/i)
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(n => names.push(n))
    }
  }
  return names
}

/**
 * Union of main artist + all featuring artist ids for a track.
 * Returns sorted unique numeric ids.
 */
export function trackArtistIds(
  mainArtistId: number,
  featuringArtistIds: number[] = []
): number[] {
  const s = new Set<number>([mainArtistId, ...featuringArtistIds])
  return [...s].filter(x => Number.isFinite(x)).sort((a, b) => a - b)
}

export interface DuplicateCandidate {
  id: number
  title: string
  artist_id: number
  artist_name?: string
  featuring: Array<{ artist_id: number; name?: string }>
  normalized_title: string
  /** Which artist ids this candidate shares with the query */
  shared_artist_ids: number[]
}

/**
 * Find tracks that might be duplicates of the query.
 *
 * Algorithm (Supabase-friendly; no pg extensions required):
 *   1. Fetch all tracks whose title *might* match — we use a Postgres ILIKE
 *      against the un-normalized title with a broad substring derived from
 *      the normalized title's first word. Narrows down candidate set cheaply.
 *   2. Re-filter in JS using normalizeTitle() for exact-normalized-match.
 *   3. For each candidate, check artist overlap (main + featuring).
 *   4. Return candidates whose artist overlap is non-empty.
 *
 * Note: this is O(candidates) in JS. For low-double-digit candidates per
 * query it's fine. If catalog grows, replace step 1 with an indexed computed
 * column (CREATE INDEX ... ON tracks ((normalize_title(title)))).
 */
export async function findDuplicateTracks(
  supabase: SupabaseClient,
  params: {
    title: string
    artistIds: number[]       // main + featuring (see trackArtistIds())
    excludeTrackId?: number
    limit?: number
  }
): Promise<DuplicateCandidate[]> {
  const normQuery = normalizeTitle(params.title)
  if (!normQuery || params.artistIds.length === 0) return []

  // Build a coarse ILIKE probe from the first few chars of the normalized title.
  // We want to avoid loading the entire tracks table but also tolerate minor
  // variations (spacing/punctuation) that normalizeTitle() collapses.
  const firstWord = normQuery.split(' ')[0]
  const probe = firstWord.length >= 3 ? firstWord : normQuery.slice(0, 6)

  // Candidate set: tracks whose main artist OR featuring artist is in the
  // query's artist set, AND title loosely contains the probe.
  // Two queries, then merge; Supabase PostgREST can't express "main OR featuring" in one shot cleanly.
  const [byMain, byFeat] = await Promise.all([
    supabase
      .from('tracks')
      .select('id, title, artist_id, artists!tracks_artist_id_fkey(id, name), track_artists(artist_id, artists(id, name))')
      .in('artist_id', params.artistIds)
      .ilike('title', `%${probe}%`)
      .limit(100),
    supabase
      .from('track_artists')
      .select('track_id, tracks!inner(id, title, artist_id, artists!tracks_artist_id_fkey(id, name), track_artists(artist_id, artists(id, name)))')
      .in('artist_id', params.artistIds)
      .ilike('tracks.title', `%${probe}%`)
      .limit(100),
  ])

  const candidates = new Map<number, any>()
  for (const row of byMain.data || []) {
    candidates.set(row.id, row)
  }
  for (const row of (byFeat.data || []) as any[]) {
    const t = row.tracks
    if (t && !candidates.has(t.id)) candidates.set(t.id, t)
  }

  const querySet = new Set(params.artistIds)
  const out: DuplicateCandidate[] = []
  for (const t of candidates.values()) {
    if (params.excludeTrackId && t.id === params.excludeTrackId) continue
    if (normalizeTitle(t.title) !== normQuery) continue

    const candArtists = new Set<number>([t.artist_id])
    const featuring: Array<{ artist_id: number; name?: string }> = []
    for (const ta of (t.track_artists || []) as any[]) {
      candArtists.add(ta.artist_id)
      featuring.push({ artist_id: ta.artist_id, name: ta.artists?.name })
    }

    const shared = [...candArtists].filter(id => querySet.has(id))
    if (shared.length === 0) continue

    out.push({
      id: t.id,
      title: t.title,
      artist_id: t.artist_id,
      artist_name: t.artists?.name,
      featuring,
      normalized_title: normQuery,
      shared_artist_ids: shared,
    })
  }

  out.sort((a, b) => b.shared_artist_ids.length - a.shared_artist_ids.length)
  return params.limit ? out.slice(0, params.limit) : out
}
