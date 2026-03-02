import { NextRequest, NextResponse } from 'next/server'
import { getBlogBySlug, getBlogPosts } from '@/lib/supabase-blog'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const blog = await getBlogBySlug(username)
  if (!blog) return new NextResponse('Blog not found', { status: 404 })

  const { posts } = await getBlogPosts(blog.id, 20, 0)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'

  const items = posts.map((p: any) => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${siteUrl}/blogas/${username}/${p.slug}</link>
      <guid>${siteUrl}/blogas/${username}/${p.slug}</guid>
      <pubDate>${new Date(p.published_at || p.created_at).toUTCString()}</pubDate>
      <description><![CDATA[${p.summary || ''}]]></description>
    </item>`).join('\n')

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${blog.title || username + ' blogas'}</title>
    <link>${siteUrl}/blogas/${username}</link>
    <description>${blog.description || 'Muzikos blogas Music.lt platformoje'}</description>
    <language>lt</language>
    <atom:link href="${siteUrl}/blogas/${username}/rss" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`

  return new NextResponse(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
