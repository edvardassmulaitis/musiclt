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
 *   - events (renginiai)
 *   - venues (vietos)
 *   - news (naujienos)
 *   - blog_posts (vartotojų blogų įrašai)
 *   - discussions (diskusijos)
 *
 * Rikiavimas:
 *   - Per-kategorija paraleliai pagal `score` (artists/albums/tracks)
 *     arba pagal aktualumą (likusiems).
 *   - Compound query: skirsto į tokenus, jei yra >=2 tokenai —
 *     bando "artist + title" kombinaciją.
 *   - Multi-token "vartai mik" → randa Mikutavičiaus dainą.
 *
 * Response shape:
 *   {
 *     results: { artists: [...], albums: [...], tracks: [...],
 *                profiles: [...], events: [...], news: [...],
 *                blog_posts: [...], discussions: [...], venues: [...] },
 *     total: number,
 *     took_ms: number
 *   }
 *
 * Visi item'ai turi `href`, `title`, `subtitle`, `image_url`, `meta`,
 * kad UI komponentas galėtų piešti universaliai.
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
  const limitPerCat = Math.min(Math.max(parseInt(searchParams.get('limit') || '6'), 1), 20)
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
  const exactPat = `${safe(broadTerm)}%` // starts-with — labiau svarus match'ams
  const useCat = (c: Category) =>
    categoriesFilter.length === 0 || categoriesFilter.includes(c)

  // ── Lygiagrečiai vykdom visus query'us ──
  // Supabase filter builder yra Thenable, ne tikras Promise — wrap'inam su
  // Promise.resolve, kad TS tipai sutaptų be kiekvieno query type assertion'o.
  const queries: PromiseLike<any>[] = []
  const order: Category[] = []

  if (useCat('artists')) {
    order.push('artists')
    queries.push(
      sb.from('artists')
        .select('id,slug,name,cover_image_url,score,legacy_id')
        .ilike('name', pat)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(limitPerCat)
    )
  }

  if (useCat('albums')) {
    order.push('albums')
    queries.push(
      sb.from('albums')
        .select('id,slug,title,cover_image_url,score,artist_id,artists:artist_id(id,name,slug)')
        .ilike('title', pat)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(limitPerCat)
    )
  }

  if (useCat('tracks')) {
    order.push('tracks')
    queries.push(
      sb.from('tracks')
        .select('id,slug,title,score,artist_id,artists:artist_id(id,name,slug,cover_image_url)')
        .ilike('title', pat)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(limitPerCat)
    )
  }

  if (useCat('profiles')) {
    order.push('profiles')
    // ieškom ir per username, ir per full_name; profiles paviešintos
    queries.push(
      sb.from('profiles')
        .select('id,username,full_name,avatar_url,bio,is_public')
        .or(`username.ilike.${pat},full_name.ilike.${pat}`)
        .eq('is_public', true)
        .limit(limitPerCat)
    )
  }

  if (useCat('events')) {
    order.push('events')
    queries.push(
      sb.from('events')
        .select('id,slug,title,start_date,city,venue_name,cover_image_url,status')
        .ilike('title', pat)
        .order('start_date', { ascending: false })
        .limit(limitPerCat)
    )
  }

  if (useCat('venues')) {
    order.push('venues')
    queries.push(
      sb.from('venues')
        .select('id,slug,name,city,country,cover_image_url')
        .ilike('name', pat)
        .limit(limitPerCat)
    )
  }

  if (useCat('news')) {
    order.push('news')
    queries.push(
      sb.from('news')
        .select('id,slug,title,image_small_url,image_title_url,published_at,type')
        .ilike('title', pat)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limitPerCat)
    )
  }

  if (useCat('blog_posts')) {
    order.push('blog_posts')
    queries.push(
      sb.from('blog_posts')
        .select('id,slug,title,summary,cover_image_url,published_at,view_count,like_count,blog_id,blogs:blog_id(slug,profiles:user_id(username,full_name,avatar_url))')
        .ilike('title', pat)
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limitPerCat)
    )
  }

  if (useCat('discussions')) {
    order.push('discussions')
    queries.push(
      sb.from('discussions')
        .select('id,slug,title,body,author_name,author_avatar,comment_count,like_count,created_at,is_deleted')
        .ilike('title', pat)
        .eq('is_deleted', false)
        .order('last_comment_at', { ascending: false, nullsFirst: false })
        .limit(limitPerCat)
    )
  }

  const settled = await Promise.allSettled(queries)

  // ── Artist fan-out ──
  // Kai user'is renkasi "Mamontovas" iš autosuggestionų, jis tikisi matyti
  // ir Mamontovo dainas/albumus, ne tik patį atlikėją. Compound paieška
  // dažniausiai randa, bet kai užklausa atitinka tik atlikėją (net ir su
  // dviem tokenais kaip "Andrius Mamontovas"), title match'as fail'ina.
  // Strategija: jei ANY artists match'as randasi, pridedam top atlikėjo
  // tracks + albums. Limit'ai mažesni kad per daug nedominuotų SERP'o.
  const artistsIdx = order.indexOf('artists')
  const topArtists =
    artistsIdx >= 0 && settled[artistsIdx]?.status === 'fulfilled'
      ? ((settled[artistsIdx] as PromiseFulfilledResult<any>).value.data || []) as any[]
      : []
  let fanoutTracks: Hit[] = []
  let fanoutAlbums: Hit[] = []
  if (topArtists.length > 0) {
    // Top 1-2 atlikėjai — pakanka, kad nesusiturėtų per daug duomenų
    const fanoutArtists = topArtists.slice(0, 2)
    const aIds = fanoutArtists.map(a => a.id)
    const aMap = new Map(fanoutArtists.map((a: any) => [a.id, a]))
    const fanoutLimit = Math.min(limitPerCat, 6)
    const [tFan, alFan] = await Promise.all([
      useCat('tracks')
        ? sb.from('tracks')
            .select('id,slug,title,score,artist_id,artists:artist_id(id,name,slug,cover_image_url)')
            .in('artist_id', aIds)
            .order('score', { ascending: false, nullsFirst: false })
            .limit(fanoutLimit)
        : Promise.resolve({ data: [] } as any),
      useCat('albums')
        ? sb.from('albums')
            .select('id,slug,title,cover_image_url,score,artist_id,artists:artist_id(id,name,slug)')
            .in('artist_id', aIds)
            .order('score', { ascending: false, nullsFirst: false })
            .limit(fanoutLimit)
        : Promise.resolve({ data: [] } as any),
    ])
    fanoutTracks = ((tFan as any).data || []).map((t: any): Hit => ({
      id: t.id, type: 'tracks', title: t.title,
      subtitle: t.artists?.name ?? null,
      image_url: t.artists?.cover_image_url ?? null,
      href: slugTrack(t.artists?.slug, t.slug, t.id),
      meta: { score: t.score, artist_id: t.artist_id, artist_slug: t.artists?.slug, fanout: true },
      score: (t.score ?? 0) - 1, // šiek tiek žemesnis nei direct match'ai
    }))
    fanoutAlbums = ((alFan as any).data || []).map((al: any): Hit => ({
      id: al.id, type: 'albums', title: al.title,
      subtitle: al.artists?.name ?? null,
      image_url: al.cover_image_url,
      href: slugAlbum(al.slug, al.id),
      meta: { score: al.score, artist_id: al.artist_id, artist_slug: al.artists?.slug, fanout: true },
      score: (al.score ?? 0) - 1,
    }))
  }

  // ── Compound: artist + title ──
  // Jei ≥2 meaningful tokens: bando "marijonas vartai" → tracks where artist
  // matches "marijonas" AND title matches "vartai". Pridedam į track results.
  let compoundTracks: Hit[] = []
  let compoundAlbums: Hit[] = []
  if (compound && (useCat('tracks') || useCat('albums'))) {
    const variants = [
      { aTok: tokens[0], tTok: tokens.slice(1).join(' ') },
      { aTok: tokens[tokens.length - 1], tTok: tokens.slice(0, -1).join(' ') },
    ]
    const variantHits = await Promise.all(variants.map(async ({ aTok, tTok }) => {
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
      const aMap = new Map(matchArtists.map((x: any) => [x.id, x]))
      const [tHit, alHit] = await Promise.all([
        useCat('tracks')
          ? sb.from('tracks')
              .select('id,slug,title,score,artist_id,artists:artist_id(id,name,slug,cover_image_url)')
              .in('artist_id', aIds)
              .ilike('title', tPat)
              .order('score', { ascending: false, nullsFirst: false })
              .limit(limitPerCat)
          : Promise.resolve({ data: [] }),
        useCat('albums')
          ? sb.from('albums')
              .select('id,slug,title,cover_image_url,score,artist_id,artists:artist_id(id,name,slug)')
              .in('artist_id', aIds)
              .ilike('title', tPat)
              .order('score', { ascending: false, nullsFirst: false })
              .limit(limitPerCat)
          : Promise.resolve({ data: [] }),
      ])
      return {
        tracks: ((tHit as any).data || []).map((t: any): Hit => ({
          id: t.id,
          type: 'tracks',
          title: t.title,
          subtitle: t.artists?.name ?? null,
          image_url: t.artists?.cover_image_url ?? null,
          href: slugTrack(t.artists?.slug, t.slug, t.id),
          meta: { score: t.score, artist_id: t.artist_id, artist_slug: t.artists?.slug },
          score: t.score ?? 0,
        })),
        albums: ((alHit as any).data || []).map((al: any): Hit => ({
          id: al.id,
          type: 'albums',
          title: al.title,
          subtitle: al.artists?.name ?? null,
          image_url: al.cover_image_url,
          href: slugAlbum(al.slug, al.id),
          meta: { score: al.score, artist_id: al.artist_id, artist_slug: al.artists?.slug },
          score: al.score ?? 0,
        })),
      }
    }))
    for (const v of variantHits) {
      compoundTracks.push(...v.tracks)
      compoundAlbums.push(...v.albums)
    }
  }

  // ── Surinkti pilnus rezultatus į kategorijas ──
  const out: Record<Category, Hit[]> = emptyResults()

  settled.forEach((res, idx) => {
    if (res.status !== 'fulfilled') return
    const cat = order[idx]
    const data = (res.value as any).data || []
    for (const row of data) {
      out[cat].push(toHit(cat, row))
    }
  })

  // Pridedam compound matches į pradžią (jie labai intencionalūs)
  if (compoundTracks.length > 0) {
    out.tracks = dedupe([...compoundTracks, ...out.tracks], 'id')
  }
  if (compoundAlbums.length > 0) {
    out.albums = dedupe([...compoundAlbums, ...out.albums], 'id')
  }
  // Fan-out track'us/albumus pridedam į galą — jei direct ar compound jau
  // surado, dedupe juos pašalins. Jei nesurado (pvz. "Mamontovas" — joks
  // track title nematch'ina), fan-out užtikrins kad track'ai vis tiek
  // pasirodys.
  if (fanoutTracks.length > 0) {
    out.tracks = dedupe([...out.tracks, ...fanoutTracks], 'id')
  }
  if (fanoutAlbums.length > 0) {
    out.albums = dedupe([...out.albums, ...fanoutAlbums], 'id')
  }

  // Per-kategorija rerank: exact-match / starts-with title viršuje
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

  return NextResponse.json({
    results: out,
    total,
    took_ms: Date.now() - started,
    query: q,
  }, {
    headers: {
      // Trumpas edge cache — autosuggest'as kviečiamas dažnai, vienodos
      // užklausos labai galimos (≥10 simbolių mažai variacijų per minutę).
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
      'CDN-Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
    },
  })
}

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

function toHit(cat: Category, row: any): Hit {
  switch (cat) {
    case 'artists':
      return {
        id: row.id,
        type: 'artists',
        title: row.name,
        subtitle: null,
        image_url: row.cover_image_url,
        href: `/atlikejai/${row.slug}`,
        meta: { score: row.score, legacy_id: row.legacy_id },
        score: row.score ?? 0,
      }
    case 'albums':
      return {
        id: row.id,
        type: 'albums',
        title: row.title,
        subtitle: row.artists?.name ?? null,
        image_url: row.cover_image_url,
        href: slugAlbum(row.slug, row.id),
        meta: { score: row.score, artist_id: row.artist_id, artist_slug: row.artists?.slug },
        score: row.score ?? 0,
      }
    case 'tracks':
      return {
        id: row.id,
        type: 'tracks',
        title: row.title,
        subtitle: row.artists?.name ?? null,
        image_url: row.artists?.cover_image_url ?? null,
        href: slugTrack(row.artists?.slug, row.slug, row.id),
        meta: { score: row.score, artist_id: row.artist_id, artist_slug: row.artists?.slug },
        score: row.score ?? 0,
      }
    case 'profiles':
      return {
        id: row.id,
        type: 'profiles',
        title: row.full_name || row.username,
        subtitle: row.username ? `@${row.username}` : null,
        image_url: row.avatar_url,
        href: `/vartotojas/${row.username}`,
        meta: { bio: row.bio },
        score: 0,
      }
    case 'events':
      return {
        id: row.id,
        type: 'events',
        title: row.title,
        subtitle: row.start_date
          ? formatDate(row.start_date) + (row.city ? ` · ${row.city}` : '')
          : (row.city || null),
        image_url: row.cover_image_url,
        href: `/renginiai/${row.slug}`,
        meta: { start_date: row.start_date, status: row.status, venue_name: row.venue_name },
        score: row.status === 'upcoming' ? 10 : 0,
      }
    case 'venues':
      return {
        id: row.id,
        type: 'venues',
        title: row.name,
        subtitle: [row.city, row.country].filter(Boolean).join(', ') || null,
        image_url: row.cover_image_url,
        href: `/renginiai?venue=${encodeURIComponent(row.slug || row.name)}`,
        meta: { city: row.city },
        score: 0,
      }
    case 'news':
      return {
        id: row.id,
        type: 'news',
        title: row.title,
        subtitle: row.published_at ? formatDate(row.published_at) : null,
        image_url: row.image_small_url || row.image_title_url,
        href: `/news/${row.slug}`,
        meta: { type: row.type, published_at: row.published_at },
        score: 0,
      }
    case 'blog_posts': {
      const blogSlug = row.blogs?.slug
      const profile = row.blogs?.profiles
      const username = profile?.username
      return {
        id: row.id,
        type: 'blog_posts',
        title: row.title,
        subtitle: profile
          ? `${profile.full_name || username || 'Vartotojas'}`
          : (row.summary ? truncate(row.summary, 60) : null),
        image_url: row.cover_image_url || profile?.avatar_url,
        href: blogSlug ? `/blogas/${blogSlug}/${row.slug}` : `/blogas`,
        meta: { username, view_count: row.view_count, like_count: row.like_count, published_at: row.published_at },
        score: row.like_count ?? 0,
      }
    }
    case 'discussions':
      return {
        id: row.id,
        type: 'discussions',
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
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s
  return s.slice(0, n).trim() + '…'
}
