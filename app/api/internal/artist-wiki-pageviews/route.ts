/**
 * Artist Wikipedia pageviews backfill/refresh — vidinis populiarumo rodiklis
 * VISIEMS katalogo atlikėjams (artists.wiki_pageviews). Wikipedia mėnesinės
 * peržiūros = bendro žinomumo proxy (balansui greta YouTube score).
 *
 * Eiliškumas: pirma NEUŽPILDYTI (wiki_pageviews_at IS NULL) pagal score desc
 * (aktualiausi + testavimui), tada seniausiai atnaujinti (maintenance).
 *
 * Kviečiamas GitHub Actions cron'o (Bearer INTERNAL_CRON_TOKEN). Backfill'as
 * ~16k atlikėjų vyksta per kelias dienas (bounded/run); paskui laiko šviežius.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { fetchArtistPageviews } from '@/lib/wiki-artist-signal'

export const runtime = 'nodejs'
export const maxDuration = 300

const RUN_BUDGET_MS = 240000
const CONCURRENCY = 3 // mandagumas Wikimedia API (per greitai → 429, klaidingi 0)

/** LT atlikėjams — lt.wikipedia (EN peržiūros LT atlikėjams beveik nulinės). */
function langForCountry(country: string | null | undefined): string {
  return /lietuv/i.test(country || '') ? 'lt' : 'en'
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const expected = process.env.INTERNAL_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: 'INTERNAL_CRON_TOKEN not configured' }, { status: 503 })
  if (!token || token !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = Math.min(300, parseInt(req.nextUrl.searchParams.get('limit') || '150', 10) || 150)
  const supabase = createAdminClient()
  const startedAt = Date.now()

  const { data: rows, error } = await supabase
    .from('artists')
    .select('id, name, country')
    .order('wiki_pageviews_at', { ascending: true, nullsFirst: true })
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const artists = (rows || []) as any[]
  let updated = 0, found = 0, noArticle = 0, retryLater = 0
  const nowIso = new Date().toISOString()

  let idx = 0
  async function worker() {
    while (idx < artists.length) {
      if (Date.now() - startedAt > RUN_BUDGET_MS) return
      const a = artists[idx++]
      await new Promise((r) => setTimeout(r, 120)) // stagger — mandagumas API
      const r = await fetchArtistPageviews(a.name || '', { lang: langForCountry(a.country) }).catch(() => ({ article: null, pageviews_monthly: null }))
      if (typeof r.pageviews_monthly === 'number') {
        // Gavom peržiūras → įrašom.
        await supabase.from('artists').update({ wiki_pageviews: r.pageviews_monthly, wiki_pageviews_at: nowIso }).eq('id', a.id)
        updated++; if (r.pageviews_monthly > 0) found++
      } else if (r.article === null) {
        // Nėra straipsnio → tikra „nėra wiki": 0 + timestamp (neretry'inam).
        await supabase.from('artists').update({ wiki_pageviews: 0, wiki_pageviews_at: nowIso }).eq('id', a.id)
        updated++; noArticle++
      } else {
        // Straipsnis yra, bet peržiūrų negavom (throttle/klaida) → NEsaugom, bandom vėliau.
        retryLater++
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, artists.length) }, () => worker()))

  return NextResponse.json({ ok: true, processed: updated, with_pageviews: found, no_article: noArticle, retry_later: retryLater, batch: artists.length })
}
