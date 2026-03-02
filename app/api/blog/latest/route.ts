import { NextRequest, NextResponse } from 'next/server'
import { getLatestBlogPosts } from '@/lib/supabase-blog'

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '6')
  try {
    const posts = await getLatestBlogPosts(Math.min(limit, 20))
    return NextResponse.json(posts)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
