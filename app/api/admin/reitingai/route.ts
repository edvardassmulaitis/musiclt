// ── GET /api/admin/reitingai ─────────────────────────────────────────────
// Admin reitingų sortinimo rodinys: atlikėjai pagal `score` DESC su pilnu
// score_breakdown'u (kiekvienos kategorijos balais), kad būtų aišku KODĖL
// atlikėjas turi tokį balą. Atskiriama LT vs užsienis (scope).
//
// Query:
//   scope = lt | world         (privalomas; LT = country='Lietuva')
//   q     = paieška pagal vardą (optional)
//   limit = 1..200 (default 60)
//   offset
//
// Rikiavimas DB pusėje: score DESC nulls last, tada name ASC.
// Auth: middleware /api/admin/* → editor; čia defense-in-depth.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const LT_COUNTRY = 'Lietuva'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') === 'world' ? 'world' : 'lt'
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 60)))
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))

  const sb = createAdminClient()
  let query = sb
    .from('artists')
    .select('id, name, slug, country, type, score, score_override, score_breakdown, score_updated_at', { count: 'exact' })
    .order('score', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)

  query = scope === 'lt'
    ? query.eq('country', LT_COUNTRY)
    : query.neq('country', LT_COUNTRY)

  if (q) query = query.ilike('name', `%${q}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Suplokštinam breakdown → kiekvienos kategorijos balas tiesiogiai eilutėje,
  // kad klientui nereiktų vaikščioti per JSONB. Paliekam ir žalią breakdown.
  const rows = (data || []).map((a: any) => {
    const bd = a.score_breakdown || null
    const cats: Record<string, { points: number; max: number; details: string }> =
      (bd && bd.categories) || {}
    const catPoints: Record<string, number> = {}
    for (const [k, v] of Object.entries(cats)) catPoints[k] = (v as any)?.points ?? 0
    return {
      id: a.id,
      name: a.name,
      slug: a.slug,
      country: a.country,
      type: a.type,
      score: a.score,
      score_override: a.score_override || 0,
      base: bd?.total ?? (a.score != null ? a.score - (a.score_override || 0) : null),
      formula: bd?.type || (scope === 'lt' ? 'lt' : 'int'),
      categories: cats,
      cat_points: catPoints,
      updated_at: a.score_updated_at,
    }
  })

  return NextResponse.json({ ok: true, scope, total: count ?? rows.length, offset, limit, rows })
}
