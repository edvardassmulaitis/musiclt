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
const CONCURRENCY = 5

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
    .select('id, name')
    .order('wiki_pageviews_at', { ascending: true, nullsFirst: true })
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const artists = (rows || []) as any[]
  let updated = 0, found = 0, errors = 0
  const nowIso = new Date().toISOString()

  let idx = 0
  async function worker() {
    while (idx < artists.length) {
      if (Date.now() - startedAt > RUN_BUDGET_MS) return
      const a = artists[idx++]
      try {
        const r = await fetchArtistPageviews(a.name || '')
        const pv = typeof r.pageviews_monthly === 'number' ? r.pageviews_monthly : 0
        if (pv > 0) found++
        await supabase.from('artists').update({ wiki_pageviews: pv, wiki_pageviews_at: nowIso }).eq('id', a.id)
        updated++
      } catch {
        errors++
        // Vis tiek pažymim laiką, kad nekartotume iškart (retry per kitą ciklą po visų).
        await supabase.from('artists').update({ wiki_pageviews_at: nowIso }).eq('id', a.id).then(() => {}, () => {})
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, artists.length) }, () => worker()))

  return NextResponse.json({ ok: true, processed: updated, with_pageviews: found, errors, batch: artists.length })
}
