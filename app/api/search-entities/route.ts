import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

/** Combined search across artists / albums / tracks for the music attach picker.
 *
 *  Two query modes:
 *    1. Single term that matches an artist name — fan out to ALL their tracks
 *       and albums so the user can scroll through their catalog. Useful when
 *       the user types just "Marijonas" and expects the dropdown to give them
 *       a song picker.
 *    2. Compound query — split on whitespace, treat first token(s) as artist,
 *       remaining as title. So "marijo try" should rank
 *       "Mikutavičius — Trys milijonai" at the top by combining artist match +
 *       title match scores.
 *
 *  Up to 30 total results, ranked: exact title > artist+title compound match >
 *  starts-with-title > artist-fanout-track > contains. */

type Hit = {
  type: 'daina' | 'albumas' | 'grupe'
  id: number
  legacy_id: number | null
  slug: string
  title: string
  artist: string | null
  image_url: string | null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const sb = createAdminClient()
  const safe = (s: string) => s.replace(/[%_]/g, '')

  // Tokens for compound matching — keep >=2 chars to avoid noise from
  // single-letter fragments. Compound branch only runs when ≥2 such tokens.
  const tokens = q.split(/\s+/).filter(t => t.length >= 2)
  const compound = tokens.length >= 2

  // Broad single-term pattern. If user typed "vartai m" (one strong token,
  // one stray letter), `q` itself ("vartai m") won't match any title since
  // no song contains that literal substring. Fall back to the LONGEST
  // meaningful token so we still surface tracks that contain "vartai".
  // Otherwise use the full query (handles single-token searches like
  // "vartai" cleanly).
  const allWords = q.split(/\s+/).filter(Boolean)
  const longWords = allWords.filter(t => t.length >= 2)
  const broadTerm =
    allWords.length === longWords.length
      ? q  // every word is meaningful, search by full string
      : longWords.length > 0
        ? longWords.sort((a, b) => b.length - a.length)[0]  // longest word
        : q
  const fullPattern = `%${safe(broadTerm)}%`

  // Always run the broad single-term search — ranks compound queries fairly
  // when the title itself contains everything ("Trys milijonai" doesn't,
  // but Mikutavičius does — handled by the compound branch below).
  const [artistsRes, albumsRes, tracksRes] = await Promise.all([
    sb.from('artists')
      .select('id,slug,name,cover_image_url,legacy_id,score')
      .ilike('name', fullPattern)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(8),
    sb.from('albums')
      .select('id,slug,title,cover_image_url,legacy_id,artist_id,artists:artist_id(name),score')
      .ilike('title', fullPattern)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(10),
    // Track query — JOIN su artists pulling cover_image_url, kad search
    // rezultatai galėtų rodyti mini foto.
    sb.from('tracks')
      .select('id,slug,title,legacy_id,artist_id,artists:artist_id(name,cover_image_url),score')
      .ilike('title', fullPattern)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(12),
  ])

  // Compound query: pull tracks/albums where artist matches one token AND
  // title matches the other. We do two combinations to be order-agnostic.
  // Each combo joins via `artists` relation with ilike on artist name and
  // ilike on title.
  let compoundTrackHits: Array<any> = []
  let compoundAlbumHits: Array<any> = []
  if (compound) {
    // BOTH orderings — first token as artist OR last token as artist. The
    // earlier code computed the same destructure twice, so "vartai marijonas"
    // worked for "marijonas vartai" but not the reverse. Now we explicitly
    // try both interpretations.
    const variants = [
      // First token as artist, rest as title.
      { artistTok: tokens[0], titleTok: tokens.slice(1).join(' ') },
      // Last token as artist, rest as title.
      { artistTok: tokens[tokens.length - 1], titleTok: tokens.slice(0, -1).join(' ') },
    ]
    // Run BOTH variants in parallel — saves a round-trip when both orderings
    // need to be checked.
    const variantResults = await Promise.all(variants.map(async ({ artistTok, titleTok }) => {
      const aPat = `%${safe(artistTok)}%`
      const tPat = `%${safe(titleTok)}%`
      // Limit padidintas 5→30 + sort by score desc, kad populiarūs atlikėjai
      // kaip Mikutavičius būtų pasirenkami pirma — anksčiau "vartai mik"
      // nebūtų rasdavęs Mikutavičius nes alphabet'iškai jis ne top-5 tarp
      // visų "mik" turinčių vardų.
      const { data: matchArtists } = await sb
        .from('artists')
        .select('id,name,score')
        .ilike('name', aPat)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(30)
      if (!matchArtists || matchArtists.length === 0) return { tracks: [], albums: [] }
      const artistIds = matchArtists.map((x: any) => x.id)
      const [tHit, alHit] = await Promise.all([
        sb.from('tracks')
          .select('id,slug,title,legacy_id,artist_id,artists:artist_id(name,cover_image_url),score')
          .in('artist_id', artistIds)
          .ilike('title', tPat)
          .order('score', { ascending: false, nullsFirst: false })
          .limit(12),
        sb.from('albums')
          .select('id,slug,title,cover_image_url,legacy_id,artist_id,artists:artist_id(name)')
          .in('artist_id', artistIds)
          .ilike('title', tPat)
          .order('score', { ascending: false, nullsFirst: false })
          .limit(8),
      ])
      return { tracks: tHit.data || [], albums: alHit.data || [] }
    }))
    for (const v of variantResults) {
      compoundTrackHits.push(...v.tracks)
      compoundAlbumHits.push(...v.albums)
    }
  }

  // Artist fan-out — if the search term matches an artist's name reasonably
  // (top hit), surface their TOP tracks and albums so the user can scroll
  // through the catalog. Bypassed when the query is compound (compound-mode
  // already covers cross-field cases).
  let fanoutTrackHits: Array<any> = []
  let fanoutAlbumHits: Array<any> = []
  if (!compound && artistsRes.data && artistsRes.data.length > 0) {
    const topArtist = (artistsRes.data as any[])[0]
    const [t, al] = await Promise.all([
      sb.from('tracks')
        .select('id,slug,title,legacy_id,artist_id,artists:artist_id(name,cover_image_url),score')
        .eq('artist_id', topArtist.id)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(15),
      sb.from('albums')
        .select('id,slug,title,cover_image_url,legacy_id,artist_id,artists:artist_id(name),score')
        .eq('artist_id', topArtist.id)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(8),
    ])
    fanoutTrackHits.push(...(t.data || []))
    fanoutAlbumHits.push(...(al.data || []))
  }

  const results: Hit[] = []
  const seen = new Set<string>()
  const push = (h: Hit, rank: number) => {
    const key = `${h.type}:${h.id}`
    if (seen.has(key)) return
    seen.add(key)
    results.push(h)
    ;(h as any).__rank = rank
  }

  // Compound matches first — they're very intentional (user typed both
  // artist + song name).
  for (const t of compoundTrackHits) {
    push({
      type: 'daina', id: t.id, legacy_id: t.legacy_id, slug: t.slug,
      title: t.title, artist: t.artists?.name ?? null,
      // Daina image_url = atlikėjo cover (kad picker'yje matytųsi mini foto).
      image_url: t.artists?.cover_image_url ?? null,
    }, 0)
  }
  for (const al of compoundAlbumHits) {
    push({
      type: 'albumas', id: al.id, legacy_id: al.legacy_id, slug: al.slug,
      title: al.title, artist: al.artists?.name ?? null, image_url: al.cover_image_url,
    }, 0)
  }

  // Direct title matches.
  for (const t of (tracksRes.data as any[] | null) ?? []) {
    push({
      type: 'daina', id: t.id, legacy_id: t.legacy_id, slug: t.slug,
      title: t.title, artist: t.artists?.name ?? null,
      // Daina image_url = atlikėjo cover (kad picker'yje matytųsi mini foto).
      image_url: t.artists?.cover_image_url ?? null,
    }, 1)
  }
  for (const al of (albumsRes.data as any[] | null) ?? []) {
    push({
      type: 'albumas', id: al.id, legacy_id: al.legacy_id, slug: al.slug,
      title: al.title, artist: al.artists?.name ?? null, image_url: al.cover_image_url,
    }, 1)
  }

  // Artist hits.
  for (const a of (artistsRes.data as any[] | null) ?? []) {
    push({
      type: 'grupe', id: a.id, legacy_id: a.legacy_id, slug: a.slug,
      title: a.name, artist: null, image_url: a.cover_image_url,
    }, 2)
  }

  // Artist fan-out — push deeper down so direct matches win, but available
  // when user types just "Marijonas" and expects scroll-through.
  for (const t of fanoutTrackHits) {
    push({
      type: 'daina', id: t.id, legacy_id: t.legacy_id, slug: t.slug,
      title: t.title, artist: t.artists?.name ?? null,
      // Daina image_url = atlikėjo cover (kad picker'yje matytųsi mini foto).
      image_url: t.artists?.cover_image_url ?? null,
    }, 3)
  }
  for (const al of fanoutAlbumHits) {
    push({
      type: 'albumas', id: al.id, legacy_id: al.legacy_id, slug: al.slug,
      title: al.title, artist: al.artists?.name ?? null, image_url: al.cover_image_url,
    }, 3)
  }

  // Within each rank tier, prefer exact-title or starts-with matches.
  const qLow = q.toLowerCase()
  const titleScore = (h: Hit) => {
    const tl = h.title.toLowerCase()
    if (tl === qLow) return 0
    if (tl.startsWith(qLow)) return 1
    return 2
  }
  results.sort((a, b) => {
    const ra = (a as any).__rank
    const rb = (b as any).__rank
    if (ra !== rb) return ra - rb
    return titleScore(a) - titleScore(b)
  })
  // Strip the temp rank field
  for (const r of results) delete (r as any).__rank

  return NextResponse.json({ results: results.slice(0, 30) })
}
