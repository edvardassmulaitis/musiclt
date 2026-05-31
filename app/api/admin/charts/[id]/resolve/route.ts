import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { findConfidentMatch } from '@/lib/chart-resolve'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST /api/admin/charts/[id]/resolve — bulk griežtas auto-match neapdorotiems
 *  (pending|ambiguous) įrašams. Tik vienareikšmiai match'ai → 'matched'. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const chartId = parseInt(id, 10)
  if (!chartId) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const sb = createAdminClient()
  const { data: pend } = await sb
    .from('external_chart_entries')
    .select('id, artist_name, title')
    .eq('chart_id', chartId)
    .in('resolve_state', ['pending', 'ambiguous'])
  const entries = pend || []
  if (entries.length === 0) return NextResponse.json({ matched: 0, processed: 0 })

  let matched = 0
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
      } catch { /* lieka review eilėje */ }
    }))
  }

  return NextResponse.json({ matched, processed: entries.length })
}
