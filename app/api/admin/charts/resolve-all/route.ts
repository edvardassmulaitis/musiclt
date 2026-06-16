import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { findConfidentMatch, findConfidentAlbumMatch } from '@/lib/chart-resolve'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/admin/charts/resolve-all — griežtas Auto-match per VISUS current
 * (ne-consensus) topus vienu paspaudimu. Naudojama po chart-resolve
 * normalizacijos pakeitimų, kad nereiktų eiti per kiekvieną topą atskirai.
 *
 * Time-budget ~50s; grąžina { matched, processed }. Susieti įrašai (resolve_state
 * 'matched') iškrenta iš kito fetch'o, tad frontend kartoja kol pasas grąžina
 * matched=0 (liko tik tikrai nesutampantys). Cross-chart propagacija vyksta
 * natūraliai — kiekvienas topas matchinamas atskirai prieš tą patį katalogą.
 */
export async function POST() {
  const sb = createAdminClient()

  const { data: charts } = await sb
    .from('external_charts')
    .select('id, chart_key')
    .eq('is_current', true)   // ĮSKAITANT consensus topus (jie irgi turi pending entries; anksčiau buvo praleisti)
  const isAlbumById = new Map<number, boolean>()
  for (const c of (charts || []) as any[]) isAlbumById.set(c.id, c.chart_key === 'albums')
  const ids = Array.from(isAlbumById.keys())
  if (ids.length === 0) return NextResponse.json({ matched: 0, processed: 0 })

  // Vienas pasas: paimam pending įrašus per visus topus (limit telpa į budget).
  const { data: pend } = await sb
    .from('external_chart_entries')
    .select('id, chart_id, artist_name, title')
    .in('chart_id', ids)
    .in('resolve_state', ['pending', 'ambiguous', 'text_only'])
    .limit(1500)
  const entries = pend || []
  if (entries.length === 0) return NextResponse.json({ matched: 0, processed: 0 })

  const start = Date.now()
  let matched = 0
  let processed = 0
  // Batch po 6 lygiagrečiai (kaip per-chart resolve), kad telpa į 60s.
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

  return NextResponse.json({ matched, processed })
}
