// app/api/naujienos/route.ts
//
// Paginacijos / "load more" endpoint'as /naujienos grid'ui. Tas pats data
// sluoksnis (getNewsFeed) kaip server page'as. CDN edge cache 60s.

import { NextRequest, NextResponse } from 'next/server'
import { getNewsFeed, type NewsFilters } from '@/lib/news-feed'
import { NEWS_BROWSE_CATEGORIES } from '@/lib/news-taxonomy'

const CATEGORY_KEYS = new Set(NEWS_BROWSE_CATEGORIES.map((c) => c.key))

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const styleRaw = searchParams.get('style')
  const style = styleRaw ? parseInt(styleRaw, 10) : null
  const category = searchParams.get('category')
  const scopeRaw = searchParams.get('scope')
  const scope = scopeRaw === 'lt' || scopeRaw === 'world' ? scopeRaw : null
  const search = (searchParams.get('search') || '').trim().slice(0, 80) || null
  const sort = searchParams.get('sort') === 'popular' ? 'popular' : 'newest'
  const limit = Math.max(1, Math.min(48, parseInt(searchParams.get('limit') || '24', 10) || 24))
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)

  const filters: NewsFilters = {
    style: style && !Number.isNaN(style) ? style : null,
    category: category && CATEGORY_KEYS.has(category as any) ? category : null,
    scope,
    search,
    sort,
    limit,
    offset,
  }

  const { items, total } = await getNewsFeed(filters)

  return NextResponse.json(
    { items, total, nextOffset: offset + items.length, hasMore: offset + items.length < total },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    }
  )
}
