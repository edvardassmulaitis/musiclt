import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { findConfidentMatch, findOrCreateArtist, createTrackForArtist } from '@/lib/chart-resolve'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST /api/admin/charts/[id]/resolve — bulk operacijos neapdorotiems
 *  (pending|ambiguous) įrašams. Body: { mode }.
 *   - mode='auto' (default): griežtas auto-match, tik vienareikšmiai → 'matched'.
 *   - mode='create': VISIEMS likusiems find-or-create atlikėjas + create daina
 *     → 'created'. Ghost atlikėjas be metadata (vėliau supildomas /admin/artists).
 *  Time-budget loop'as (≈50s) — jei nesutelpa, grąžina remaining>0; frontend kartoja.
 *  Žr. lib/chart-resolve. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const chartId = parseInt(id, 10)
  if (!chartId) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const mode = body?.mode === 'create' ? 'create' : 'auto'

  const sb = createAdminClient()
  const { data: pend } = await sb
    .from('external_chart_entries')
    .select('id, artist_name, title')
    .eq('chart_id', chartId)
    .in('resolve_state', ['pending', 'ambiguous'])
  const entries = pend || []
  if (entries.length === 0) {
    return mode === 'create'
      ? NextResponse.json({ created: 0, remaining: 0, processed: 0 })
      : NextResponse.json({ matched: 0, processed: 0 })
  }

  /* ── mode=create: sukurti ghost atlikėją+dainą visiems likusiems ── */
  if (mode === 'create') {
    const { data: chart } = await sb.from('external_charts')
      .select('scope, country').eq('id', chartId).maybeSingle()
    const country = chart?.country || (chart?.scope === 'lt' ? 'LT' : null)

    const start = Date.now()
    let created = 0
    let i = 0
    // Sekvenciškai (ne lygiagrečiai), kad findOrCreateArtist nesukurtų to paties
    // atlikėjo dublio per race. Time-budget ~50s, likusius grąžinam frontend'ui.
    for (; i < entries.length; i++) {
      if (Date.now() - start > 50_000) break
      const e: any = entries[i]
      try {
        const artistId = await findOrCreateArtist(sb, e.artist_name, country)
        const trackId = await createTrackForArtist(sb, artistId, e.title)
        await sb.from('external_chart_entries').update({
          track_id: trackId, artist_id: artistId, resolve_state: 'created',
        }).eq('id', e.id)
        created++
      } catch { /* praleidžiam — lieka pending, kitas run'as pakartos */ }
    }
    return NextResponse.json({ created, remaining: entries.length - i, processed: entries.length })
  }

  /* ── mode=auto: griežtas match ── */
  let matched = 0
  // Apdorojam batch'ais po 8 (lygiagrečiai), kad telpa į 60s ir neperkrauna DB.
  for (let i = 0; i < entries.length; i += 8) {
    const batch = entries.slice(i, i + 8)
    await Promise.all(batch.map(async (e: any) => {
      try {
        const m = await findConfidentMatch(sb, e.artist_name, e.title)
        if (m) {
          await sb.from('external_chart_entries').update({
            track_id: m.trackId, artist_id: m.artistId, resolve_state: 'matched',
          }).eq('id', e.id)
          matched++
        }
      } catch { /* praleidžiam — lieka review eilėje */ }
    }))
  }

  return NextResponse.json({ matched, processed: entries.length })
}
