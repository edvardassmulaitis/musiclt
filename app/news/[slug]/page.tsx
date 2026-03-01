// app/news/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import NewsArticleClient from './news-article-client'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

async function getNews(slug: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('news')
    .select(`
      id, title, slug, body, type, source_url, source_name,
      published_at, image_small_url, gallery,
      image1_url, image1_caption, image2_url, image2_caption,
      image3_url, image3_caption, image4_url, image4_caption,
      image5_url, image5_caption,
      artist:artist_id ( id, name, cover_image_url, photos ),
      artist2:artist_id2 ( id, name, cover_image_url )
    `)
    .eq('slug', slug)
    .single()
  return data
}

async function getRelatedNews(newsId: number, artistId?: number) {
  const supabase = createAdminClient()
  let q = supabase
    .from('news')
    .select('id, title, slug, image_small_url, published_at, type')
    .neq('id', newsId)
    .order('published_at', { ascending: false })
    .limit(4)
  if (artistId) q = q.eq('artist_id', artistId)
  const { data } = await q
  return data || []
}

async function getSongs(newsId: number) {
  const supabase = createAdminClient()

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

  const [related, songs] = await Promise.all([
    getRelatedNews(raw.id, artistObj?.id),
    getSongs(raw.id),
  ])

  let finalSongs = songs
  if (finalSongs.length === 0 && artistObj?.id) {
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
  }

  return <NewsArticleClient news={news} related={related as any} songs={finalSongs} />
}
