// app/naujienos/rss.xml/route.ts
//
// RSS 2.0 feed'as naujausioms naujienoms (/naujienos/rss.xml). Skaitytuvams,
// agregatoriams ir SEO discovery'ui.

import { getNewsFeed } from '@/lib/news-feed'
import { SITE_URL } from '@/lib/artist-browse'

export const revalidate = 600

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export async function GET() {
  const { items } = await getNewsFeed({ sort: 'newest', limit: 40 })

  const entries = items
    .map((it) => {
      const link = `${SITE_URL}${it.href}`
      const pub = it.date ? new Date(it.date).toUTCString() : new Date().toUTCString()
      const desc = it.excerpt || it.artistName || ''
      return `    <item>
      <title>${esc(it.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pub}</pubDate>
      ${it.artistName ? `<category>${esc(it.artistName)}</category>` : ''}
      <description>${esc(desc)}</description>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>music.lt — Muzikos naujienos</title>
    <link>${SITE_URL}/naujienos</link>
    <atom:link href="${SITE_URL}/naujienos/rss.xml" rel="self" type="application/rss+xml" />
    <description>Naujausios Lietuvos ir pasaulio muzikos naujienos</description>
    <language>lt</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${entries}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600',
    },
  })
}
