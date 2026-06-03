// lib/news-feed.ts
//
// Server-side data sluoksnis /naujienos hub'ui ir SEO landing'ams. Visi fetch'ai
// apgaubti try/catch (degrade gracefully build-time DB nepasiekiamumui, kaip
// sitemap.ts) ir naudoja news_feed / news_facets / news_style_sections RPC'us
// (žr. 20260603_news_categorization.sql).
//
// Kanoninis naujienos URL — /news/{slug} (legacy news redirect'as iš
// /diskusijos/{slug} eina ten pat). Todėl VISI link'ai feed'e → /news/{slug}.

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import { proxyImg } from '@/lib/img-proxy'
import { NEWS_STYLES, type NewsScope } from '@/lib/news-taxonomy'
import type { NewsFeedItem } from '@/lib/news-shared'

export type NewsFilters = {
  style?: number | null
  category?: string | null
  scope?: NewsScope | null
  search?: string | null
  sort?: 'newest' | 'popular'
  limit?: number
  offset?: number
}

const LT_SET = new Set(['Lietuva', 'LT', 'Lithuania'])

function mapRow(r: any): NewsFeedItem {
  const img = r.image_url || r.artist_cover || null
  return {
    uid: r.uid,
    href: `/news/${r.slug}`,
    slug: r.slug,
    title: r.title,
    date: r.published || null,
    image: img ? proxyImg(img, 640) : null,
    category: r.category || null,
    source: r.source,
    likeCount: r.like_count || 0,
    commentCount: r.comment_count || 0,
    viewCount: r.view_count || 0,
    artistId: r.artist_id || null,
    artistName: r.artist_name || null,
    artistSlug: r.artist_slug || null,
    isLT: !r.country || LT_SET.has(r.country),
    excerpt: (r.excerpt || '').trim(),
  }
}

/** Pagrindinis feed'as. Grąžina puslapį + bendrą total (paginacijai). */
export async function getNewsFeed(
  filters: NewsFilters = {}
): Promise<{ items: NewsFeedItem[]; total: number }> {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb.rpc('news_feed', {
      p_style: filters.style ?? null,
      p_category: filters.category ?? null,
      p_scope: filters.scope ?? null,
      p_search: filters.search ?? null,
      p_sort: filters.sort === 'popular' ? 'popular' : 'newest',
      p_limit: filters.limit ?? 24,
      p_offset: filters.offset ?? 0,
    })
    if (error) throw error
    const rows = (data || []) as any[]
    return {
      items: rows.map(mapRow),
      total: rows.length > 0 ? Number(rows[0].total) : 0,
    }
  } catch {
    return { items: [], total: 0 }
  }
}

/* ─────────────────────────── Facet skaičiai ─────────────────────────── */

export type NewsFacets = {
  total: number
  styles: Record<string, number>
  categories: Record<string, number>
  scope: { lt: number; world: number }
}

const facetsRaw = unstable_cache(
  async (): Promise<NewsFacets> => {
    try {
      const sb = createAdminClient()
      const { data, error } = await sb.rpc('news_facets')
      if (error) throw error
      const d = (data || {}) as any
      return {
        total: d.total || 0,
        styles: d.styles || {},
        categories: d.categories || {},
        scope: d.scope || { lt: 0, world: 0 },
      }
    } catch {
      return { total: 0, styles: {}, categories: {}, scope: { lt: 0, world: 0 } }
    }
  },
  ['naujienos-facets-v1'],
  { tags: ['naujienos:facets'], revalidate: 1800 }
)

export const getNewsFacets = cache(() => facetsRaw())

/* ─────────────────────── Naršymas pagal stilių ──────────────────────── */

export type StyleSection = {
  id: number
  name: string
  slug: string
  icon: string
  accent: string
  items: NewsFeedItem[]
}

const styleSectionsRaw = unstable_cache(
  async (per: number): Promise<StyleSection[]> => {
    try {
      const sb = createAdminClient()
      const { data, error } = await sb.rpc('news_style_sections', { p_per: per })
      if (error) throw error
      const rows = (data || []) as any[]
      const byGenre = new Map<number, NewsFeedItem[]>()
      for (const r of rows) {
        const item = mapRow({
          uid: r.uid,
          slug: r.slug,
          title: r.title,
          published: r.published,
          image_url: null,
          artist_cover: r.artist_cover,
          category: null,
          source: 'legacy',
          like_count: 0,
          comment_count: 0,
          view_count: 0,
          artist_id: r.artist_id,
          artist_name: r.artist_name,
          artist_slug: null,
          country: null,
          excerpt: '',
        })
        const arr = byGenre.get(r.genre_id) || []
        arr.push(item)
        byGenre.set(r.genre_id, arr)
      }
      // NEWS_STYLES tvarka — populiariausi pirmi.
      return NEWS_STYLES.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        icon: s.icon,
        accent: s.accent,
        items: byGenre.get(s.id) || [],
      })).filter((s) => s.items.length > 0)
    } catch {
      return []
    }
  },
  ['naujienos-style-sections-v2-distinct'],
  { tags: ['naujienos:sections'], revalidate: 900 }
)

export const getNewsStyleSections = cache((per = 4) => styleSectionsRaw(per))

/* ─────────────────────────── Featured / trending ────────────────────── */

/** Hero blokui — naujausios naujienos, kurios turi paveikslėlį (atlikėjo cover). */
export async function getFeaturedNews(n = 5): Promise<NewsFeedItem[]> {
  // Paimam daugiau ir atsirenkam su paveikslėliu, kad hero niekada nebūtų be vizualo.
  const { items } = await getNewsFeed({ sort: 'newest', limit: n * 4 })
  const withImg = items.filter((i) => i.image)
  return (withImg.length >= n ? withImg : items).slice(0, n)
}

/** Trending šoninei juostai — populiariausios (like+comment+view). */
export const getTrendingNews = cache(async (n = 6): Promise<NewsFeedItem[]> => {
  const { items } = await getNewsFeed({ sort: 'popular', limit: n })
  return items
})
