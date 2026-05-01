// app/api/blog/feed/route.ts
//
// Bendras feed visų autorių publikuotų įrašų. Naudojam /blogas index'ui ir
// galimam embed'ui kituose pages (homepage strip, profile page).
// Filtruojam pagal post_type (article|quick|review|...) ir tag'us.

import { NextRequest, NextResponse } from 'next/server'
import { getBlogFeed, getPopularTags } from '@/lib/supabase-blog'

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')
  const postType = req.nextUrl.searchParams.get('type')   // null = visi
  const tag = req.nextUrl.searchParams.get('tag')         // null = visi
  const includeTags = req.nextUrl.searchParams.get('includeTags') === '1'

  try {
    const feed = await getBlogFeed({ limit, offset, postType, tag })
    if (includeTags) {
      const popularTags = await getPopularTags(20)
      return NextResponse.json({ ...feed, popularTags })
    }
    return NextResponse.json(feed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
