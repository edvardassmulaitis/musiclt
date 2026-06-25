import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { findConfidentMatch, findConfidentAlbumMatch } from '@/lib/chart-resolve'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/internal/charts-resolve-all — token-auth'inta „Auto-match per VISUS
 * topus" versija (be admin sesijos). Skirta automatiniam paleidimui PO chart
 * ingest'o (scraper/charts/ingest.py kviečia kai topai pasikeičia), kad naujai
 * atsiradę įrašai iškart susisietų su katalogu — kaip rankinis „Auto-match"
 * mygtukas /admin/charts.
 *
 * Auth: Authorization: Bearer <CRON_SECRET | INTERNAL_CRON_TOKEN>.
 * Logika identiška /api/admin/charts/resolve-all: liečia TIK pending/ambiguous/
 * text_only įrašus → rankiniai (matched/created) sujungimai NEpaliečiami.
 * Time-budget ~50s; grąžina { matched, processed }. Caller'is kartoja kol matched=0.
 * ?dry=1 — tik grąžina likusių pending skaičių (be rašymų), patogu verifikacijai.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const cronSecret = process.env.CRON_SECRET
  const internal = process.env.INTERNAL_CRON_TOKEN
  const ok = (cronSecret && token === cronSecret) || (internal && token === internal)
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = createAdminClient()

  const { data: charts } = await sb
    .from('external_charts')
    .select('id, chart_key')
    .eq('is_current', true)
  const isAlbumById = new Map<number, boolean>()
  for (const c of (charts || []) as any[]) isAlbumById.set(c.id, c.chart_key === 'albums')
  const ids = Array.from(isAlbumById.keys())
  if (ids.length === 0) return NextResponse.json({ matched: 0, processed: 0, pending: 0 })

  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'

  const { data: pend } = await sb
    .from('external_chart_entries')
    .select('id, chart_id, artist_name, title')
    .in('chart_id', ids)
    .in('resolve_state', ['pending', 'ambiguous', 'text_only'])
    .limit(1500)
  const entries = pend || []
  if (dry) return NextResponse.json({ matched: 0, processed: 0, pending: entries.length, dry: true })
  if (entries.length === 0) return NextResponse.json({ matched: 0, processed: 0, pending: 0 })

  const start = Date.now()
  let matched = 0
  let processed = 0
  for (let i = 0; i < entries.length; i += 6) {
    if (Date.now() - start > 50_000) break
    const batch = entries.slice(i, i + 6)
    processed += batch.length
    await Promise.all(batch.map(async (e: any) => {
      try {
        if (isAlbumById.get(e.chart_id) === true) {
          const m = await findConfidentAlbumMatch(sb, e.artist_name, e.title)
          if (m) {
            await sb.from('external_chart_entries').update({
              album_id: m.albumId, track_id: null, artist_id: m.artistId, resolve_state: 'matched',
            }).eq('id', e.id)
            matched++
          }
        } else {
          const m = await findConfidentMatch(sb, e.artist_name, e.title)
          if (m) {
            await sb.from('external_chart_entries').update({
              track_id: m.trackId, album_id: null, artist_id: m.artistId, resolve_state: 'matched',
            }).eq('id', e.id)
            matched++
          }
        }
      } catch { /* praleidžiam — lieka review eilėje */ }
    }))
  }

  return NextResponse.json({ matched, processed, pending: entries.length })
}

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest) { return handle(req) }
