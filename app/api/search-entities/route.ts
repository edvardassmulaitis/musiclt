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
  const fullPattern = `%${safe(q)}%`

  // Try splitting compound queries — "marijo try" → "marijo" + "try". We try
  // both ordering interpretations: artist-first (token[0] artist, rest title)
  // and reversed. For ≤2-token queries this is cheap (4 small searches max).
  const tokens = q.split(/\s+/).filter(t => t.length >= 2)
  const compound = tokens.length >= 2

  // Always run the broad single-term search — ranks compound queries fairly
  // when the title itself contains everything ("Trys milijonai" doesn't,
  // but Mikutavičius does — handled by the compound branch below).
  const [artistsRes, albumsRes, tracksRes] = await Promise.all([
    sb.from('artists')
      .select('id,slug,name,cover_image_url,legacy_id')
      .ilike('name', fullPattern)
      .limit(8),
    sb.from('albums')
      .select('id,slug,title,cover_image_url,legacy_id,artist_id,artists:artist_id(name)')
      .ilike('title', fullPattern)
      .limit(10),
    sb.from('tracks')
      .select('id,slug,title,legacy_id,artist_id,artists:artist_id(name)')
      .ilike('title', fullPattern)
      .limit(12),
  ])

  // Compound query: pull tracks/albums where artist matches one token AND
  // title matches the other. We do two combinations to be order-agnostic.
  // Each combo joins via `artists` relation with ilike on artist name and
  // ilike on title.
  let compoundTrackHits: Array<any> = []
  let compoundAlbumHits: Array<any> = []
  if (compound) {
    const [a, b] = [tokens[0], tokens.slice(1).join(' ')]
    const [b2, a2] = [tokens[tokens.length - 1], tokens.slice(0, -1).join(' ')]
    // PostgREST doesn't support OR across embedded joins in one call, so we
    // do two-token interpretations and merge.
    const variants = [
      { artistTok: a, titleTok: b },
      { artistTok: a2, titleTok: b2 },
    ]
    for (const { artistTok, titleTok } of variants) {
      const aPat = `%${safe(artistTok)}%`
      const tPat = `%${safe(titleTok)}%`
      // First find artist IDs matching the artist token
      const { data: matchArtists } = await sb
        .from('artists')
        .select('id,name')
        .ilike('name', aPat)
        .limit(5)
      if (!matchArtists || matchArtists.length === 0) continue
      const artistIds = matchArtists.map((x: any) => x.id)
      const [tHit, alHit] = await Promise.all([
        sb.from('tracks')
          .select('id,slug,title,legacy_id,artist_id,artists:artist_id(name)')
          .in('artist_id', artistIds)
          .ilike('title', tPat)
          .limit(8),
        sb.from('albums')
          .select('id,slug,title,cover_image_url,legacy_id,artist_id,artists:artist_id(name)')
          .in('artist_id', artistIds)
          .ilike('title', tPat)
          .limit(6),
      ])
      compoundTrackHits.push(...(tHit.data || []))
      compoundAlbumHits.push(...(alHit.data || []))
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
    // Pull top 12 tracks + top 6 albums for the matching artist (by score
    // when available, fallback by id desc — newest-ish).
    const [t, al] = await Promise.all([
      sb.from('tracks')
        .select('id,slug,title,legacy_id,artist_id,artists:artist_id(name),score')
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
      title: t.title, artist: t.artists?.name ?? null, image_url: null,
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
      title: t.title, artist: t.artists?.name ?? null, image_url: null,
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
      title: t.title, artist: t.artists?.name ?? null, image_url: null,
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
