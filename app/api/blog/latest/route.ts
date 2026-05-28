import { NextRequest, NextResponse } from 'next/server'
import { getLatestBlogPosts } from '@/lib/supabase-blog'

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '6')
  try {
    const posts = await getLatestBlogPosts(Math.min(limit, 20))
    // CDN edge cache — homepage'o "Bendruomenė" sekcijos. 60s saugu (nauji
    // blog'ai retesni, o community feed neturi būti realtime).
    return NextResponse.json(posts, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
