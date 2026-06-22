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
  const mode = url.searchParams.get('mode') === 'trending' ? 'trending' : 'alltime'
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 60)))
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))

  const orderCol = mode === 'trending' ? 'score_trending' : 'score'

  const sb = createAdminClient()
  let query = sb
    .from('artists')
    .select('id, name, slug, country, type, score, score_override, score_breakdown, score_trending, score_trending_breakdown, score_updated_at', { count: 'exact' })
    .order(orderCol, { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)

  query = scope === 'lt'
    ? query.eq('country', LT_COUNTRY)
    : query.neq('country', LT_COUNTRY)

  if (q) query = query.ilike('name', `%${q}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const flatten = (bd: any) => {
    const cats: Record<string, { points: number; max: number; details: string }> = (bd && bd.categories) || {}
    const pts: Record<string, number> = {}
    for (const [k, v] of Object.entries(cats)) pts[k] = (v as any)?.points ?? 0
    return { cats, pts, base: bd?.total ?? null }
  }

  // Grąžinam ABU reitingus — klientas pasirenka pagal `mode` (All-time / Trending).
  const rows = (data || []).map((a: any) => {
    const at = flatten(a.score_breakdown)
    const tr = flatten(a.score_trending_breakdown)
    return {
      id: a.id, name: a.name, slug: a.slug, country: a.country, type: a.type,
      score_override: a.score_override || 0,
      updated_at: a.score_updated_at,
      alltime: { score: a.score, base: at.base, categories: at.cats, cat_points: at.pts },
      trending: { score: a.score_trending, base: tr.base, categories: tr.cats, cat_points: tr.pts },
    }
  })

  return NextResponse.json({ ok: true, scope, mode, total: count ?? rows.length, offset, limit, rows })
}
