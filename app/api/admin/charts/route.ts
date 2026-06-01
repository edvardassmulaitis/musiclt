import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** GET /api/admin/charts — visi šiuo metu aktyvūs (is_current) išoriniai topai
 *  su entry būsenų suvestine (matched/created/text_only/pending). */
export async function GET() {
  const sb = createAdminClient()
  const { data: charts, error } = await sb
    .from('external_charts')
    .select('id, source, chart_key, title, subtitle, scope, size, accent, period_label, attribution, source_url, fetched_at, featured, featured_order, cover_image_url')
    .eq('is_current', true)
    .neq('source', 'consensus')   // konsensusas auto-derived — ne rankiniam resolve
    .order('scope', { ascending: true })
    .order('source', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!charts || charts.length === 0) return NextResponse.json({ charts: [] })

  const ids = charts.map(c => c.id)

  // Visų entries (chart_id, resolve_state) — paginuojam (PostgREST 1000 cap).
  const states: Array<{ chart_id: number; resolve_state: string }> = []
  let from = 0
  for (;;) {
    const { data, error: eErr } = await sb
      .from('external_chart_entries')
      .select('chart_id, resolve_state')
      .in('chart_id', ids)
      .range(from, from + 999)
    if (eErr) break
    states.push(...(data || []))
    if (!data || data.length < 1000) break
    from += 1000
  }

  const agg = new Map<number, { total: number; matched: number; created: number; text_only: number; pending: number }>()
  for (const id of ids) agg.set(id, { total: 0, matched: 0, created: 0, text_only: 0, pending: 0 })
  for (const s of states) {
    const a = agg.get(s.chart_id)!
    a.total++
    if (s.resolve_state === 'matched') a.matched++
    else if (s.resolve_state === 'created') a.created++
    else if (s.resolve_state === 'text_only') a.text_only++
    else a.pending++
  }

  const result = charts.map(c => ({ ...c, counts: agg.get(c.id) }))
  return NextResponse.json({ charts: result })
}
