// app/news-sitemap.xml/route.ts
//
// Google News sitemap — TIK paskutinių 48 val. naujienos (Google News
// reikalavimas). Atskiras nuo pagrindinio sitemap.xml. Referuojamas robots.ts.
// Formatas: <url> su <news:news> bloku (publication, title, publication_date).

import { createAdminClient } from '@/lib/supabase'
import { SITE_URL } from '@/lib/artist-browse'

export const revalidate = 900 // 15 min

function xmlEscape(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

type Row = { slug: string; title: string; date: string }

async function recentNews(): Promise<Row[]> {
  const sinceIso = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const out: Row[] = []
  try {
    const sb = createAdminClient()
    // Naujienos data = coalesce(first_post_at, created_at) — kaip news_feed
    // RPC'e. Šviežiai nuscrape'inti legacy įrašai turi first_post_at=NULL ir
    // created_at=insert laiką, todėl filtruojam abu (dvi atskiros užklausos
    // PostgREST .or() parser problemos su ISO timestamp'ais išvengimui).
    const [modern, legacyDated, legacyNullDate] = await Promise.all([
      sb.from('news')
        .select('slug, title, published_at')
        .gte('published_at', sinceIso)
        .order('published_at', { ascending: false })
        .limit(500),
      sb.from('discussions')
        .select('slug, title, first_post_at')
        .eq('legacy_kind', 'news').eq('is_legacy', true).eq('is_deleted', false)
        .gte('first_post_at', sinceIso)
        .order('first_post_at', { ascending: false })
        .limit(500),
      sb.from('discussions')
        .select('slug, title, created_at')
        .eq('legacy_kind', 'news').eq('is_legacy', true).eq('is_deleted', false)
        .is('first_post_at', null)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(500),
    ])
    for (const n of (modern.data || []) as any[]) {
      if (n.slug && n.published_at) out.push({ slug: n.slug, title: n.title, date: n.published_at })
    }
    for (const d of (legacyDated.data || []) as any[]) {
      if (d.slug && d.first_post_at) out.push({ slug: d.slug, title: d.title, date: d.first_post_at })
    }
    for (const d of (legacyNullDate.data || []) as any[]) {
      if (d.slug && d.created_at) out.push({ slug: d.slug, title: d.title, date: d.created_at })
    }
  } catch {
    /* degrade gracefully */
  }
  // Newest first, dedupe by slug
  const seen = new Set<string>()
  return out
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((r) => (seen.has(r.slug) ? false : (seen.add(r.slug), true)))
    .slice(0, 1000)
}

export async function GET() {
  const rows = await recentNews()
  const urls = rows
    .map(
      (r) => `  <url>
    <loc>${SITE_URL}/news/${xmlEscape(r.slug)}</loc>
    <news:news>
      <news:publication>
        <news:name>music.lt</news:name>
        <news:language>lt</news:language>
      </news:publication>
      <news:publication_date>${new Date(r.date).toISOString()}</news:publication_date>
      <news:title>${xmlEscape(r.title)}</news:title>
    </news:news>
  </url>`
    )
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=900',
    },
  })
}
