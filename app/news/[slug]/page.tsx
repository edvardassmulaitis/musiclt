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
  const { data } = await supabase
    .from('news_songs')
    .select(`
      id, sort_order, song_id, title, artist_name, youtube_url,
      song:song_id ( id, title, artist_name, youtube_url, cover_url )
    `)
    .eq('news_id', newsId)
    .order('sort_order')
  if (!data) return []
  return data.map((s: any) => ({
    id: s.id,
    song_id: s.song_id,
    title: s.song?.title || s.title || '',
    artist_name: s.song?.artist_name || s.artist_name || '',
    youtube_url: s.song?.youtube_url || s.youtube_url || '',
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
  const heroImg = news.image_small_url || artist?.cover_image_url
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
  const news = await getNews(slug)
  if (!news) notFound()

  const artist = Array.isArray(news.artist) ? news.artist[0] : news.artist
  const artist2 = Array.isArray(news.artist2) ? news.artist2[0] : news.artist2

  const [related, songs] = await Promise.all([
    getRelatedNews(news.id, artist?.id),
    getSongs(news.id),
  ])

  // Build gallery: prefer new gallery jsonb, fallback to image1-5 columns
  let gallery: { url: string; caption?: string }[] = []
  if (news.gallery && Array.isArray(news.gallery) && news.gallery.length > 0) {
    gallery = news.gallery
  } else {
    for (let i = 1; i <= 5; i++) {
      const url = (news as any)[`image${i}_url`]
      const caption = (news as any)[`image${i}_caption`]
      if (url) gallery.push({ url, caption: caption || '' })
    }
  }

  const newsData = { ...news, artist, artist2, gallery }
  return <NewsArticleClient news={newsData as any} related={related} songs={songs} />
}
