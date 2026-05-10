// app/news/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import NewsArticleClient from './news-article-client'
import type { Metadata } from 'next'

// Force-dynamic — kad legacy news fallback'as (discussions table) gauautume
// fresh duomenis iškart po scrape'o, ne 404 dėl SSG cache'o.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

async function getNews(slug: string) {
  const supabase = createAdminClient()
  // Modern news lentelė pirma — sukurtos per /admin/news editorial
  // (artists.photos column ne'egzistuoja, naudojam tik cover_image_url)
  const modern = await supabase
    .from('news')
    .select(`
      id, title, slug, body, type, source_url, source_name,
      published_at, image_small_url, gallery,
      image1_url, image1_caption, image2_url, image2_caption,
      image3_url, image3_caption, image4_url, image4_caption,
      image5_url, image5_caption,
      artist:artist_id ( id, name, cover_image_url ),
      artist2:artist_id2 ( id, name, cover_image_url )
    `)
    .eq('slug', slug)
    .maybeSingle()
  if (modern.data) return { ...modern.data, _source: 'modern' as const }

  // Fallback'as — scraped legacy news iš discussions table su
  // legacy_kind='news'. Adaptuojam į news shape kad NewsArticleClient'as
  // galetume jį tiesiogiai render'inti — tas pats canonical UI.
  const legacy = await supabase
    .from('discussions')
    .select(`
      id, title, slug, body, legacy_kind, legacy_id, source_url, first_post_at,
      created_at, last_comment_at, comment_count, related_tracks,
      artist:artist_id ( id, name, cover_image_url ),
      artist2:artist_id2 ( id, name, cover_image_url )
    `)
    .eq('slug', slug)
    .eq('legacy_kind', 'news')
    .eq('is_legacy', true)
    .maybeSingle()
  if (legacy.data) {
    const a = legacy.data as any
    return {
      id: a.id,
      title: a.title,
      slug: a.slug,
      body: a.body || '',
      type: 'news',
      source_url: a.source_url,
      source_name: null,
      published_at: a.first_post_at || a.created_at,
      image_small_url: null,
      gallery: [],
      image1_url: null, image1_caption: null,
      image2_url: null, image2_caption: null,
      image3_url: null, image3_caption: null,
      image4_url: null, image4_caption: null,
      image5_url: null, image5_caption: null,
      artist: a.artist,
      artist2: a.artist2,
      _source: 'legacy' as const,
      _discussion_id: a.id,
      _comment_count: a.comment_count,
      _related_tracks: a.related_tracks,  // canonical news_songs adapter
    }
  }
  return null
}

async function getRelatedNews(newsId: number, artistId?: number) {
  const supabase = createAdminClient()
  // Sujungiam modern news + legacy migrated news (discussions su legacy_kind='news').
  const modernPromise = (async () => {
    let q = supabase
      .from('news')
      .select('id, title, slug, image_small_url, published_at, type')
      .neq('id', newsId)
      .order('published_at', { ascending: false })
      .limit(4)
    if (artistId) q = q.eq('artist_id', artistId)
    const { data } = await q
    return (data || []).map((n: any) => ({ ...n, _source: 'modern' as const }))
  })()
  const legacyPromise = (async () => {
    let q = supabase
      .from('discussions')
      .select('id, title, slug, first_post_at, created_at')
      .eq('legacy_kind', 'news')
      .eq('is_legacy', true)
      .order('first_post_at', { ascending: false })
      .limit(4)
    if (artistId) q = q.eq('artist_id', artistId)
    const { data } = await q
    return (data || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      slug: d.slug,
      image_small_url: null,
      published_at: d.first_post_at || d.created_at,
      type: 'news',
      _source: 'legacy' as const,
    }))
  })()
  const [modern, legacy] = await Promise.all([modernPromise, legacyPromise])
  // Combine + sort by date desc, top 4
  return [...modern, ...legacy]
    .sort((a: any, b: any) => {
      const ta = a.published_at ? new Date(a.published_at).getTime() : 0
      const tb = b.published_at ? new Date(b.published_at).getTime() : 0
      return tb - ta
    })
    .slice(0, 4)
}

async function getSongs(newsId: number, legacyRelated?: any[]) {
  const supabase = createAdminClient()

  // Legacy news naudoja `discussions.related_tracks` JSONB array
  // (canonical news_songs adapter — scraper paima iš article HTML).
  if (legacyRelated && legacyRelated.length > 0) {
    const trackEntries = legacyRelated.filter((r: any) => r.kind === 'track')
    const trackIds = trackEntries.map((r: any) => r.id)
    if (trackIds.length === 0) return []
    const { data: tracks } = await supabase
      .from('tracks')
      .select('id, title, video_url, cover_url, artists!tracks_artist_id_fkey(name)')
      .in('id', trackIds)
    return (tracks || []).map((t: any) => ({
      id: t.id,
      song_id: t.id,
      title: t.title,
      artist_name: t.artists?.name || '',
      youtube_url: t.video_url || '',
      cover_url: t.cover_url || '',
    }))
  }

  const { data: rows } = await supabase
    .from('news_songs')
    .select('id, sort_order, song_id, title, artist_name, youtube_url')
    .eq('news_id', newsId)
    .order('sort_order')

  if (!rows || rows.length === 0) return []

  const trackIds = rows.filter(r => r.song_id).map(r => r.song_id as number)
  let tracksMap: Record<number, { title: string; artist_name: string; video_url: string; cover_url: string }> = {}

  if (trackIds.length > 0) {
    const { data: tracks } = await supabase
      .from('tracks')
      .select('id, title, video_url, cover_url, artists!tracks_artist_id_fkey(name)')
      .in('id', trackIds)

    for (const t of (tracks || []) as any[]) {
      tracksMap[t.id] = {
        title: t.title,
        artist_name: t.artists?.name || '',
        video_url: t.video_url || '',
        cover_url: t.cover_url || '',
      }
    }
  }

  return rows.map((s: any) => {
    const track = s.song_id ? tracksMap[s.song_id] : null
    return {
      id: s.id,
      song_id: s.song_id,
      title: track?.title || s.title || '',
      artist_name: track?.artist_name || s.artist_name || '',
      youtube_url: track?.video_url || s.youtube_url || '',
      cover_url: track?.cover_url || '',
    }
  })
}

async function getArtistTracks(artistId: number, limit = 5) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tracks')
    .select('id, title, video_url, cover_url, release_date, artists!tracks_artist_id_fkey(name)')
    .eq('artist_id', artistId)
    .not('video_url', 'is', null)
    .order('release_date', { ascending: false })
    .limit(limit)

  if (!data || data.length === 0) return []

  return data.map((t: any) => ({
    id: t.id,
    song_id: t.id,
    title: t.title,
    artist_name: t.artists?.name || '',
    youtube_url: t.video_url || '',
    cover_url: t.cover_url || '',
  }))
}

function extractLede(body: string): string {
  try {
    const parsed = JSON.parse(body)
    const first = parsed.blocks?.find((b: any) => b.type === 'paragraph')
    return first?.data?.text?.replace(/<[^>]+>/g, '').slice(0, 160) || ''
  } catch {
    return body?.replace(/<[^>]+>/g, '').slice(0, 160) || ''
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const news = await getNews(slug)
  if (!news) return { title: 'Naujiena nerasta' }
  const artist = Array.isArray(news.artist) ? news.artist[0] : news.artist
  const heroImg = news.image_small_url || (artist as any)?.cover_image_url
  return {
    title: `${news.title} – music.lt`,
    description: extractLede(news.body),
    openGraph: {
      title: news.title,
      description: extractLede(news.body),
      images: heroImg ? [heroImg] : [],
    },
  }
}

export default async function NewsPage({ params }: Props) {
  const { slug } = await params
  const raw = await getNews(slug)
  if (!raw) notFound()

  const artist = Array.isArray(raw.artist) ? raw.artist[0] : raw.artist
  const artist2 = Array.isArray(raw.artist2) ? raw.artist2[0] : raw.artist2

  const artistObj = artist ? { id: (artist as any).id, name: (artist as any).name, cover_image_url: (artist as any).cover_image_url || undefined, photos: (artist as any).photos || undefined } : undefined
  const artist2Obj = artist2 ? { id: (artist2 as any).id, name: (artist2 as any).name, cover_image_url: (artist2 as any).cover_image_url || undefined } : undefined

  // Related artists — iš `related_tracks` JSONB (kind='artist' įrašai)
  // Tas pats column'as visiems related entity tipams (track/album/artist),
  // filtruojam pagal kind front'e.
  const relatedTracksRaw = (raw as any)._related_tracks || (raw as any).related_tracks || []
  const relatedArtistsRaw = Array.isArray(relatedTracksRaw)
    ? relatedTracksRaw.filter((e: any) => e?.kind === 'artist')
    : []
  // Sukurti pilną artist'ų sąrašą: primary (jei yra) + susiję iš article'o.
  // Dedupe pagal id, primary pirmas.
  const allArtists: { id: number; name: string; cover_image_url?: string }[] = []
  const seenArtistIds = new Set<number>()
  if (artistObj?.id) {
    allArtists.push(artistObj)
    seenArtistIds.add(artistObj.id)
  }
  for (const a of relatedArtistsRaw) {
    if (!a?.id || seenArtistIds.has(a.id)) continue
    seenArtistIds.add(a.id)
    allArtists.push({ id: a.id, name: a.name || '', cover_image_url: a.cover_image_url || undefined })
  }
  // Cover image fallback — jei JSONB neturėjo cover_image_url (senstam
  // backfill'ui), pa-paimam iš artists table'o.
  const missingCovers = allArtists.filter(a => !a.cover_image_url).map(a => a.id)
  if (missingCovers.length > 0) {
    const supabase = createAdminClient()
    const { data: coverRows } = await supabase
      .from('artists')
      .select('id, cover_image_url, name')
      .in('id', missingCovers)
    const covMap = new Map<number, { name: string; cover: string | null }>()
    for (const r of coverRows || []) covMap.set(r.id as number, { name: r.name as string, cover: r.cover_image_url as any })
    for (const a of allArtists) {
      if (!a.cover_image_url && covMap.has(a.id)) {
        const m = covMap.get(a.id)!
        a.cover_image_url = m.cover || undefined
        if (!a.name) a.name = m.name
      }
    }
  }

  const [related, songs] = await Promise.all([
    getRelatedNews(raw.id, artistObj?.id),
    getSongs(raw.id, (raw as any)._related_tracks || undefined),
  ])

  // ARTIST tracks fallback'as TIK kai modern news (legacy news jau turi
  // related_tracks iš article HTML — jei tuščias, tai reiškia article
  // tikrai nemini muzikos, ir random fallback'as butų klaidinantis).
  let finalSongs = songs
  const isLegacy = (raw as any)._source === 'legacy'
  if (finalSongs.length === 0 && artistObj?.id && !isLegacy) {
    finalSongs = await getArtistTracks(artistObj.id)
  }

  let gallery: { url: string; caption?: string }[] = []
  if (raw.gallery && Array.isArray(raw.gallery) && raw.gallery.length > 0) {
    gallery = raw.gallery as any
  } else {
    for (let i = 1; i <= 5; i++) {
      const url = (raw as any)[`image${i}_url`]
      const caption = (raw as any)[`image${i}_caption`]
      if (url) gallery.push({ url, caption: caption || '' })
    }
  }

  // Explicit object to match NewsArticleClient props exactly
  const news: any = {
    id: raw.id,
    title: raw.title,
    slug: raw.slug,
    body: raw.body,
    type: raw.type,
    source_url: raw.source_url,
    source_name: raw.source_name,
    published_at: raw.published_at,
    image_small_url: raw.image_small_url,
    gallery,
    artist: artistObj,
    artist2: artist2Obj,
    artists: allArtists,  // VISI susiję atlikėjai (primary + Susijusi info section)
  }

  return <NewsArticleClient news={news} related={related as any} songs={finalSongs} />
}
