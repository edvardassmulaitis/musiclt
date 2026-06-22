import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/internal/fix-placeholder-titles
 * Auth: Bearer INTERNAL_CRON_TOKEN
 * Body: { limit?: number, dry?: boolean }
 *
 * During the legacy mass scrape some song pages didn't render their <h1>, so
 * the parser fell back to the site name and stored title = "Music.lt". The real
 * title is still available on the legacy page (og:title / <title> / h1) and in
 * the source_url slug. This re-fetches each affected page and repairs the title.
 * title_norm is a generated column so it updates automatically.
 */

const PLACEHOLDER = 'Music.lt'

function deaccentLower(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .trim()
}

function stripTags(s: string): string {
  return s.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function titleFromSlug(url: string): string | null {
  const m = url.match(/\/lt\/daina\/([^/]+)\/\d+/)
  if (!m) return null
  return decodeURIComponent(m[1]).replace(/-/g, ' ').replace(/\s+/g, ' ').trim() || null
}

/** "Artist - Track - Music.lt" → "Track" (using known artist to strip prefix). */
function extractFromHeadTitle(raw: string, artistName: string | null): string | null {
  let t = decodeEntities(raw).trim()
  // drop trailing site suffix
  t = t.replace(/\s*[-–|]\s*Music\.lt\s*$/i, '').trim()
  if (!t) return null
  if (artistName) {
    const an = deaccentLower(artistName)
    const td = deaccentLower(t)
    // "Artist - Track"
    if (td.startsWith(an + ' - ') || td.startsWith(an + ' – ')) {
      return t.slice(artistName.length).replace(/^\s*[-–]\s*/, '').trim() || null
    }
  }
  // generic "Artist - Track" → take everything after the first separator
  const idx = t.indexOf(' - ')
  if (idx > 0) return t.slice(idx + 3).trim() || null
  return t || null
}

function extractTitle(html: string, artistName: string | null, sourceUrl: string): { title: string | null; method: string } {
  // 1) h1 itemprop="name"
  const h1 = html.match(/<h1\b[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/i)
  if (h1) {
    const t = decodeEntities(stripTags(h1[1]))
    if (t && t.toLowerCase() !== PLACEHOLDER.toLowerCase() && t.length <= 200) return { title: t, method: 'h1' }
  }
  // 2) og:title — extract the meta tag first, then read content respecting the
  // actual quote delimiter so apostrophes inside the title aren't truncated.
  const ogTag = html.match(/<meta[^>]*property=["']og:title["'][^>]*>/i)
              || html.match(/<meta[^>]*content=["'][^>]*["'][^>]*property=["']og:title["'][^>]*>/i)
  const ogContent = ogTag && (ogTag[0].match(/content="([^"]*)"/i) || ogTag[0].match(/content='([^']*)'/i))
  if (ogContent) {
    const t = extractFromHeadTitle(ogContent[1], artistName)
    if (t && t.toLowerCase() !== PLACEHOLDER.toLowerCase() && t.length <= 200) return { title: t, method: 'og:title' }
  }
  // 3) <title>
  const tt = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (tt) {
    const t = extractFromHeadTitle(tt[1], artistName)
    if (t && t.toLowerCase() !== PLACEHOLDER.toLowerCase() && t.length <= 200) return { title: t, method: 'title' }
  }
  // 4) slug fallback (lossy: no diacritics / parens)
  const slug = titleFromSlug(sourceUrl)
  if (slug && slug.toLowerCase() !== PLACEHOLDER.toLowerCase()) return { title: slug, method: 'slug' }
  return { title: null, method: 'none' }
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const expected = process.env.INTERNAL_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: 'INTERNAL_CRON_TOKEN not configured' }, { status: 503 })
  if (!token || token !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const limit = Math.min(80, Math.max(1, Number(body.limit) || 30))
  const dry = body.dry === true
  // prefix_guard: only overwrite when the freshly extracted title strictly
  // EXTENDS the current one (or current is the placeholder). Lets us safely
  // re-run over already-repaired rows to fix apostrophe-truncated titles
  // without ever clobbering a correct title.
  const prefixGuard = body.prefix_guard === true
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map((x: any) => Number(x)).filter(Boolean) : []

  const sb = createAdminClient()

  let q = sb
    .from('tracks')
    .select('id, title, source_url, artist_id, artists!tracks_artist_id_fkey(name)')
    .not('source_url', 'is', null)
    .order('id', { ascending: true })
    .limit(limit)
  q = ids.length ? q.in('id', ids) : q.eq('title', PLACEHOLDER)
  const { data: rows, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{ id: number; title: string | null; method: string; ok: boolean; error?: string; skipped?: boolean }> = []
  for (const r of (rows || []) as any[]) {
    const artistName = (Array.isArray(r.artists) ? r.artists[0]?.name : r.artists?.name) ?? null
    try {
      const resp = await fetch(r.source_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MusicLtBot/1.0)' },
        signal: AbortSignal.timeout(12000),
      })
      if (!resp.ok) { results.push({ id: r.id, title: null, method: 'http' + resp.status, ok: false, error: 'HTTP ' + resp.status }); continue }
      const html = await resp.text()
      const { title, method } = extractTitle(html, artistName, r.source_url)
      if (!title) { results.push({ id: r.id, title: null, method, ok: false, error: 'no title found' }); continue }
      const cur = String(r.title || '')
      if (prefixGuard) {
        const isPlaceholder = cur === PLACEHOLDER
        const extends_ = title.length > cur.length && title.startsWith(cur)
        if (!isPlaceholder && !extends_) {
          results.push({ id: r.id, title, method, ok: true, skipped: true })
          continue
        }
      }
      if (!dry) {
        const { error: uErr } = await sb.from('tracks').update({ title }).eq('id', r.id)
        if (uErr) { results.push({ id: r.id, title, method, ok: false, error: uErr.message }); continue }
      }
      results.push({ id: r.id, title, method, ok: true })
    } catch (e: any) {
      results.push({ id: r.id, title: null, method: 'fetch_error', ok: false, error: String(e?.message || e) })
    }
  }

  const { count: remaining } = await sb
    .from('tracks')
    .select('id', { count: 'exact', head: true })
    .eq('title', PLACEHOLDER)

  return NextResponse.json({
    ok: true,
    processed: results.length,
    updated: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    remaining: remaining || 0,
    dry,
    results,
  })
}
