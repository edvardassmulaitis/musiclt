// app/news/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NewsArticleClient from './news-article-client'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

async function getNews(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('news')
    .select(`
      id, title, slug, body, type, source_url, source_name,
      published_at, image_small_url,
      artist:artist_id ( id, name, cover_image_url, photos ),
      artist2:artist_id2 ( id, name, cover_image_url )
    `)
    .eq('slug', slug)
    .single()
  return data
}

async function getRelatedNews(newsId: number, artistId?: number) {
  const supabase = await createClient()
  let q = supabase
    .from('news')
    .select('id, title, slug, image_small_url, published_at, type')
    .neq('id', newsId)
    .order('published_at', { ascending: false })
    .limit(3)
  if (artistId) q = q.eq('artist_id', artistId)
  const { data } = await q
  return data || []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const news = await getNews(slug)
  if (!news) return { title: 'Naujiena nerasta' }
  return {
    title: `${news.title} – music.lt`,
    description: extractLede(news.body),
    openGraph: {
      title: news.title,
      description: extractLede(news.body),
      images: news.image_small_url ? [news.image_small_url] : [],
    },
  }
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

export default async function NewsPage({ params }: Props) {
  const { slug } = await params
  const news = await getNews(slug)
  if (!news) notFound()

  const related = await getRelatedNews(news.id, news.artist?.id)

  return <NewsArticleClient news={news} related={related} />
}
