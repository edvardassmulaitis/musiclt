import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

/**
 * Master search — vienas endpoint visam svetainės paieškos turiniui.
 *
 * Apima:
 *   - artists (atlikėjai)
 *   - albums (albumai)
 *   - tracks (dainos)
 *   - profiles (vartotojai)
 *   - events (renginiai)  — TIK busimi (upcoming/ongoing)
 *   - venues (vietos)
 *   - news (naujienos)
 *   - blog_posts (vartotojų blogų įrašai)
 *   - discussions (diskusijos)
 *
 * Strategija:
 *   1. Round 1: artists query (vienas round-trip) — reikia rezultato fan-out'ui.
 *   2. Round 2: visa kita paraleliai, įskaitant fan-out tracks/albums pagal
 *      round 1 atlikėjus (kad "mamont" rodytų ir Mamontovo dainas, net jei
 *      title nematch'ina).
 *
 * Compound query (≥2 tokenai): split'inam į artist+title kombinaciją —
 * "marijonas vartai" ranks Mikutavičius–Trys vartai aukščiausiai.
 *
 * Per-kategorija rerank: exact-title > starts-with-title > score desc.
 */

type Category =
  | 'artists' | 'albums' | 'tracks'
  | 'profiles' | 'events' | 'venues'
  | 'news' | 'blog_posts' | 'discussions'

type Hit = {
  id: number | string
  type: Category
  title: string
  subtitle?: string | null
  image_url?: string | null
  href: string
  meta?: Record<string, any>
  score?: number
}

const safe = (s: string) => s.replace(/[%_]/g, '')

const slugTrack = (artistSlug: string | null | undefined, trackSlug: string, id: number) =>
  artistSlug ? `/dainos/${artistSlug}-${trackSlug}-${id}` : `/dainos/${trackSlug}-${id}`

const slugAlbum = (slug: string, id: number) => `/albumai/${slug}-${id}`

export async function GET(request: Request) {
  const started = Date.now()
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  // Default limit "Visi" preview'ui — 10. Max 200 — kai user'is pasirenka
  // konkrečią kategoriją iš UI, fetch'inam pilną katalogą (pvz. visas
  // 220 Mamontovo dainų), kad būtų galima scroll'inti per visą sąrašą.
  // 200 row su artist join'u ≈ 35KB JSON — priimtina.
  const limitPerCat = Math.min(Math.max(parseInt(searchParams.get('limit') || '10'), 1), 200)
  const categoriesFilter = (searchParams.get('categories') || '').split(',').filter(Boolean)

  if (q.length < 1) {
    return NextResponse.json({ results: emptyResults(), total: 0, took_ms: 0 })
  }

  const sb = createAdminClient()
  const tokens = q.split(/\s+/).filter(t => t.length >= 1)
  const meaningful = tokens.filter(t => t.length >= 2)
  const compound = meaningful.length >= 2
  const broadTerm =
    tokens.length === meaningful.length
      ? q
      : meaningful.length > 0
        ? meaningful.sort((a, b) => b.length - a.length)[0]
        : q
  const pat = `%${safe(broadTerm)}%`
  const useCat = (c: Category) =>
    categoriesFilter.length === 0 || categoriesFilter.includes(c)

  // Renginiams reikia "tik busimi" filter'io — naudojam start_date >= dabar.
  // status field'as ne visada teisingai update'inamas, tad pasitikim datomis.
  // Buffer'is -3h: renginiui šiandien vakare nepalikt iš sąrašo.
  const upcomingThreshold = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()

  // ── ROUND 1: artists query (sinchroniškai — reikia fan-out'ui) ──
  const artistsRes = useCat('artists')
    ? await sb.from('artists')
        .select('id,slug,name,cover_image_url,score,legacy_id')
        .ilike('name', pat)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(limitPerCat)
    : { data: [] as any[] }
  const matchedArtists = (artistsRes.data || []) as any[]

  // Fan-out atlikėjai — viršutiniai 2 (kad nesusiturėtų per daug duomenų).
  const fanoutArtistIds = matchedArtists.slice(0, 2).map(a => a.id)
  const fanoutEnabled = fanoutArtistIds.length > 0
  // Fan-out limit follow'ina pagrindinį limit'ą, kad pasirinkus dainas
  // chip'ą, matytume realų katalogą (220 Mamontovo dainų atveju → user'is
  // gauna iki 30 prieš tai išleisdamas naują užklausą su didesniu limit'u).
  const fanoutLimit = limitPerCat

  // ── ROUND 2: visi kiti query'ai paraleliai ──
  // Tarp jų: bazinės title-match'inančios albumai/tracks + fan-out (atlikėjo
  // top tracks/albums net jei title nematch'ina) + count-only užklausos
  // pilnam totals'ui rodyti (kad user'is matytų "10 / 220 dainų").
  type R = { data: any[] | null; count?: number | null }
  const empty = { data: [] as any[] }
  const emptyCount = { count: 0 }
  const [
    albumsRes, tracksRes, profilesRes, eventsRes, venuesRes,
    newsRes, blogRes, discRes,
    fanoutTracksRes, fanoutAlbumsRes,
    fanoutTracksCount, fanoutAlbumsCount,
    titleAlbumsCount, titleTracksCount,
    compoundResults,
  ] = await Promise.all([
    useCat('albums')
      ? sb.from('albums')
          .select('id,slug,title,cover_image_url,score,artist_id,artists:artist_id(id,name,slug)')
          .ilike('title', pat)
          .order('score', { ascending: false, nullsFirst: false })
          .limit(limitPerCat)
      : Promise.resolve(empty as R),

    useCat('tracks')
      ? sb.from('tracks')
          .select('id,slug,title,score,artist_id,artists:artist_id(id,name,slug,cover_image_url)')
          .ilike('title', pat)
          .order('score', { ascending: false, nullsFirst: false })
          .limit(limitPerCat)
      : Promise.resolve(empty as R),

    useCat('profiles')
      ? sb.from('profiles')
          .select('id,username,full_name,avatar_url,bio,is_public')
          .or(`username.ilike.${pat},full_name.ilike.${pat}`)
          .eq('is_public', true)
          .limit(limitPerCat)
      : Promise.resolve(empty as R),

    // Events: TIK busimi. start_date >= now (su -3h buffer'iu).
    // Sortinam ascending: artimiausi viršuje.
    useCat('events')
      ? sb.from('events')
          .select('id,slug,title,start_date,city,venue_name,cover_image_url,status')
          .ilike('title', pat)
          .gte('start_date', upcomingThreshold)
          .order('start_date', { ascending: true })
          .limit(limitPerCat)
      : Promise.resolve(empty as R),

    useCat('venues')
      ? sb.from('venues')
          .select('id,slug,name,city,country,cover_image_url')
          .ilike('name', pat)
          .limit(limitPerCat)
      : Promise.resolve(empty as R),

    useCat('news')
      ? sb.from('news')
          .select('id,slug,title,image_small_url,image_title_url,published_at,type')
          .ilike('title', pat)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(limitPerCat)
      : Promise.resolve(empty as R),

    useCat('blog_posts')
      ? sb.from('blog_posts')
          .select('id,slug,title,summary,cover_image_url,published_at,view_count,like_count,blog_id,blogs:blog_id(slug,profiles:user_id(username,full_name,avatar_url))')
          .ilike('title', pat)
          .eq('status', 'published')
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(limitPerCat)
      : Promise.resolve(empty as R),

    useCat('discussions')
      ? sb.from('discussions')
          .select('id,slug,title,body,author_name,author_avatar,comment_count,like_count,created_at,is_deleted')
          .ilike('title', pat)
          .eq('is_deleted', false)
          .order('last_comment_at', { ascending: false, nullsFirst: false })
          .limit(limitPerCat)
      : Promise.resolve(empty as R),

    // Fan-out tracks: top atlikėjų visi populiariausi track'ai (be title filter'io).
    fanoutEnabled && useCat('tracks')
      ? sb.from('tracks')
          .select('id,slug,title,score,artist_id,artists:artist_id(id,name,slug,cover_image_url)')
          .in('artist_id', fanoutArtistIds)
          .order('score', { ascending: false, nullsFirst: false })
          .limit(fanoutLimit)
      : Promise.resolve(empty as R),

    // Fan-out albums: top atlikėjų albumai.
    fanoutEnabled && useCat('albums')
      ? sb.from('albums')
          .select('id,slug,title,cover_image_url,score,artist_id,artists:artist_id(id,name,slug)')
          .in('artist_id', fanoutArtistIds)
          .order('score', { ascending: false, nullsFirst: false })
          .limit(fanoutLimit)
      : Promise.resolve(empty as R),

    // ── Count-only užklausos totals'ui (head: true neneša data) ──
    // Naudotojui parodysim "rasta N daugiau" link'ą jei totals > rodomi.
    fanoutEnabled && useCat('tracks')
      ? sb.from('tracks').select('id', { count: 'exact', head: true }).in('artist_id', fanoutArtistIds)
      : Promise.resolve(emptyCount as any),
    fanoutEnabled && useCat('albums')
      ? sb.from('albums').select('id', { count: 'exact', head: true }).in('artist_id', fanoutArtistIds)
      : Promise.resolve(emptyCount as any),
    useCat('albums')
      ? sb.from('albums').select('id', { count: 'exact', head: true }).ilike('title', pat)
      : Promise.resolve(emptyCount as any),
    useCat('tracks')
      ? sb.from('tracks').select('id', { count: 'exact', head: true }).ilike('title', pat)
      : Promise.resolve(emptyCount as any),

    // Compound queries (artist + title) — tik kai ≥2 meaningful tokenai.
    compound ? runCompound(sb, tokens, limitPerCat, useCat) : Promise.resolve({ tracks: [] as Hit[], albums: [] as Hit[] }),
  ])

  // ── Surinkti pilnus rezultatus į kategorijas ──
  const out: Record<Category, Hit[]> = emptyResults()

  for (const a of matchedArtists) out.artists.push(toArtist(a))
  for (const al of (albumsRes.data || [])) out.albums.push(toAlbum(al))
  for (const t of (tracksRes.data || [])) out.tracks.push(toTrack(t))
  for (const p of (profilesRes.data || [])) out.profiles.push(toProfile(p))
  for (const e of (eventsRes.data || [])) out.events.push(toEvent(e))
  for (const v of (venuesRes.data || [])) out.venues.push(toVenue(v))
  for (const n of (newsRes.data || [])) out.news.push(toNews(n))
  for (const b of (blogRes.data || [])) out.blog_posts.push(toBlog(b))
  for (const d of (discRes.data || [])) out.discussions.push(toDiscussion(d))

  // Compound matches į pradžią — labai intencionalūs.
  if (compoundResults.tracks.length > 0) {
    out.tracks = dedupe([...compoundResults.tracks, ...out.tracks], 'id')
  }
  if (compoundResults.albums.length > 0) {
    out.albums = dedupe([...compoundResults.albums, ...out.albums], 'id')
  }

  // Fan-out atlikėjų track'ai ir albumai — pridedam po direct/compound match'ų.
  // Score'as pažymėtas su `fanout: true`, bet rikiavimas paliekamas pagal score
  // desc — populiariausi Mamontovo track'ai turėtų pasirodyti viršuje.
  const fanoutTracks = (fanoutTracksRes.data || []).map(toTrack)
  const fanoutAlbums = (fanoutAlbumsRes.data || []).map(toAlbum)
  if (fanoutTracks.length > 0) {
    out.tracks = dedupe([...out.tracks, ...fanoutTracks], 'id')
  }
  if (fanoutAlbums.length > 0) {
    out.albums = dedupe([...out.albums, ...fanoutAlbums], 'id')
  }

  // Per-kategorija rerank: exact-match / starts-with title viršuje, tada score.
  const qLow = q.toLowerCase()
  const titleScore = (h: Hit) => {
    const tl = h.title.toLowerCase()
    if (tl === qLow) return 0
    if (tl.startsWith(qLow)) return 1
    return 2
  }
  for (const k of Object.keys(out) as Category[]) {
    out[k].sort((a, b) => {
      const ta = titleScore(a), tb = titleScore(b)
      if (ta !== tb) return ta - tb
      return (b.score ?? 0) - (a.score ?? 0)
    })
    out[k] = out[k].slice(0, limitPerCat)
  }

  const total = (Object.values(out) as Hit[][]).reduce((s, arr) => s + arr.length, 0)

  // Totals — visi rasti rezultatai DB, ne tik rodomi. Naudoja UI'jus
  // chip'uose ("Dainos 220") ir "Rodyti visus N" link'uose.
  // Tracks/albums totals = MAX(title-match count, fan-out artist count) —
  // kuris yra didesnis, tas ir realus "kiek randa". Mamontovo atveju
  // title='mamont' randa 0, fan-out artist count = 220 → totals.tracks = 220.
  const tracksTotal = Math.max(
    (titleTracksCount as any)?.count ?? 0,
    (fanoutTracksCount as any)?.count ?? 0,
  )
  const albumsTotal = Math.max(
    (titleAlbumsCount as any)?.count ?? 0,
    (fanoutAlbumsCount as any)?.count ?? 0,
  )
  const totals: Record<Category, number> = {
    artists:     out.artists.length,        // artists query nelimit'uotas head'u — naudojam returned count
    albums:      Math.max(albumsTotal, out.albums.length),
    tracks:      Math.max(tracksTotal, out.tracks.length),
    profiles:    out.profiles.length,
    events:      out.events.length,
    venues:      out.venues.length,
    news:        out.news.length,
    blog_posts:  out.blog_posts.length,
    discussions: out.discussions.length,
  }

  return NextResponse.json({
    results: out,
    totals,
    total,
    took_ms: Date.now() - started,
    query: q,
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
      'CDN-Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
    },
  })
}

/* ── Compound search (artist + title) ──
 *
 * Bandom abu order'ius: pirmas tokenas kaip artist + likę kaip title, ir
 * paskutinis tokenas kaip artist + likę kaip title.
 */
async function runCompound(
  sb: any, tokens: string[], limit: number, useCat: (c: Category) => boolean,
): Promise<{ tracks: Hit[]; albums: Hit[] }> {
  const variants = [
    { aTok: tokens[0], tTok: tokens.slice(1).join(' ') },
    { aTok: tokens[tokens.length - 1], tTok: tokens.slice(0, -1).join(' ') },
  ]
  const results = await Promise.all(variants.map(async ({ aTok, tTok }) => {
    const aPat = `%${safe(aTok)}%`
    const tPat = `%${safe(tTok)}%`
    const { data: matchArtists } = await sb
      .from('artists')
      .select('id,name,slug,cover_image_url,score')
      .ilike('name', aPat)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(20)
    if (!matchArtists || matchArtists.length === 0) return { tracks: [], albums: [] }
    const aIds = matchArtists.map((x: any) => x.id)
    const [tHit, alHit] = await Promise.all([
      useCat('tracks')
        ? sb.from('tracks')
            .select('id,slug,title,score,artist_id,artists:artist_id(id,name,slug,cover_image_url)')
            .in('artist_id', aIds)
            .ilike('title', tPat)
            .order('score', { ascending: false, nullsFirst: false })
            .limit(limit)
        : Promise.resolve({ data: [] }),
      useCat('albums')
        ? sb.from('albums')
            .select('id,slug,title,cover_image_url,score,artist_id,artists:artist_id(id,name,slug)')
            .in('artist_id', aIds)
            .ilike('title', tPat)
            .order('score', { ascending: false, nullsFirst: false })
            .limit(limit)
        : Promise.resolve({ data: [] }),
    ])
    return {
      tracks: (((tHit as any).data || []) as any[]).map(toTrack),
      albums: (((alHit as any).data || []) as any[]).map(toAlbum),
    }
  }))
  return {
    tracks: results.flatMap(r => r.tracks),
    albums: results.flatMap(r => r.albums),
  }
}

/* ── Helpers ───────────────────────────────────────────────────── */

function emptyResults(): Record<Category, Hit[]> {
  return {
    artists: [], albums: [], tracks: [],
    profiles: [], events: [], venues: [],
    news: [], blog_posts: [], discussions: [],
  }
}

function dedupe(arr: Hit[], key: keyof Hit) {
  const seen = new Set<string>()
  const out: Hit[] = []
  for (const h of arr) {
    const k = String(h[key])
    if (seen.has(k)) continue
    seen.add(k)
    out.push(h)
  }
  return out
}

function toArtist(row: any): Hit {
  return {
    id: row.id, type: 'artists',
    title: row.name,
    subtitle: null,
    image_url: row.cover_image_url,
    href: `/atlikejai/${row.slug}`,
    meta: { score: row.score, legacy_id: row.legacy_id },
    score: row.score ?? 0,
  }
}

function toAlbum(row: any): Hit {
  return {
    id: row.id, type: 'albums',
    title: row.title,
    subtitle: row.artists?.name ?? null,
    image_url: row.cover_image_url,
    href: slugAlbum(row.slug, row.id),
    meta: { score: row.score, artist_id: row.artist_id, artist_slug: row.artists?.slug },
    score: row.score ?? 0,
  }
}

function toTrack(row: any): Hit {
  return {
    id: row.id, type: 'tracks',
    title: row.title,
    subtitle: row.artists?.name ?? null,
    image_url: row.artists?.cover_image_url ?? null,
    href: slugTrack(row.artists?.slug, row.slug, row.id),
    meta: { score: row.score, artist_id: row.artist_id, artist_slug: row.artists?.slug },
    score: row.score ?? 0,
  }
}

function toProfile(row: any): Hit {
  return {
    id: row.id, type: 'profiles',
    title: row.full_name || row.username,
    subtitle: row.username ? `@${row.username}` : null,
    image_url: row.avatar_url,
    href: `/vartotojas/${row.username}`,
    meta: { bio: row.bio },
    score: 0,
  }
}

function toEvent(row: any): Hit {
  return {
    id: row.id, type: 'events',
    title: row.title,
    subtitle: row.start_date
      ? formatDate(row.start_date) + (row.city ? ` · ${row.city}` : '')
      : (row.city || null),
    image_url: row.cover_image_url,
    href: `/renginiai/${row.slug}`,
    meta: { start_date: row.start_date, status: row.status, venue_name: row.venue_name },
    // Score: artimiausi viršuje (mažesnė reikšmė = mažesnis abs delta = aukštesnis prioritetas).
    // Naudojam neigiamas dienas iki renginio kaip score (mažiau dienų = aukštesnis number).
    score: row.start_date ? Math.max(0, 365 - daysFromNow(row.start_date)) : 0,
  }
}

function toVenue(row: any): Hit {
  return {
    id: row.id, type: 'venues',
    title: row.name,
    subtitle: [row.city, row.country].filter(Boolean).join(', ') || null,
    image_url: row.cover_image_url,
    href: `/renginiai?venue=${encodeURIComponent(row.slug || row.name)}`,
    meta: { city: row.city },
    score: 0,
  }
}

function toNews(row: any): Hit {
  return {
    id: row.id, type: 'news',
    title: row.title,
    subtitle: row.published_at ? formatDate(row.published_at) : null,
    image_url: row.image_small_url || row.image_title_url,
    href: `/news/${row.slug}`,
    meta: { type: row.type, published_at: row.published_at },
    score: 0,
  }
}

function toBlog(row: any): Hit {
  const blogSlug = row.blogs?.slug
  const profile = row.blogs?.profiles
  return {
    id: row.id, type: 'blog_posts',
    title: row.title,
    subtitle: profile
      ? (profile.full_name || profile.username || 'Vartotojas')
      : (row.summary ? truncate(row.summary, 60) : null),
    image_url: row.cover_image_url || profile?.avatar_url,
    href: blogSlug ? `/blogas/${blogSlug}/${row.slug}` : `/blogas`,
    meta: { username: profile?.username, view_count: row.view_count, like_count: row.like_count, published_at: row.published_at },
    score: row.like_count ?? 0,
  }
}

function toDiscussion(row: any): Hit {
  return {
    id: row.id, type: 'discussions',
    title: row.title,
    subtitle: row.author_name
      ? `${row.author_name} · ${row.comment_count ?? 0} komentarų`
      : `${row.comment_count ?? 0} komentarų`,
    image_url: row.author_avatar,
    href: `/diskusijos/${row.slug}`,
    meta: { comment_count: row.comment_count, like_count: row.like_count, created_at: row.created_at },
    score: row.comment_count ?? 0,
  }
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function daysFromNow(iso: string): number {
  try {
    const d = new Date(iso).getTime()
    const now = Date.now()
    return Math.floor((d - now) / (24 * 3600 * 1000))
  } catch { return 999 }
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s
  return s.slice(0, n).trim() + '…'
}
