/**
 * Score recalc endpoint — perskaičiuoja artist score'us.
 *
 * Trys režimai:
 *
 * 1. **GET /api/admin/internal/score-recalc** (Vercel cron arba ranka)
 *    - Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel cron) ARBA
 *      `X-Internal-Secret: ${INTERNAL_API_SECRET}` (rankinis admin)
 *    - Body: žiūri visus artists su NULL score_updated_at ARBA senesni nei
 *      ?older_than=24h
 *    - Limit: 50 per call (Vercel free 10s limit; Pro 60s)
 *
 * 2. **POST /api/admin/internal/score-recalc** body: `{artist_id}` arba `{artist_ids: []}`
 *    - Vienam ar batch'iniam artist'ui (admin UI mygtukas)
 *    - Auth: session admin/super_admin ARBA secret header
 *
 * 3. **POST /api/admin/internal/score-recalc** body: `{all: true}`
 *    - VISIEMS artists (super_admin only — gali užtrukti)
 *
 * Score saugomas į `artists.score`, `score_breakdown`, `score_updated_at`.
 * Lazy strategija: po wiki/scrape importų ar manual edit'ų — score_updated_at
 * sąvarsėmis nustatomas į NULL, ir cron periodiškai perskaičiuoja.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { calculateArtistScore } from '@/lib/scoring'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function authorize(req: NextRequest, requireSuperAdmin = false): Promise<boolean> {
  // Vercel cron header (Bearer)
  const authHeader = req.headers.get('authorization') || ''
  const cronSecret = process.env.CRON_SECRET || ''
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true

  // Internal API secret (Python worker / admin curl)
  const intSec = req.headers.get('x-internal-secret')
  if (intSec && process.env.INTERNAL_API_SECRET && intSec === process.env.INTERNAL_API_SECRET) {
    return true
  }

  // Session admin
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  if (!role) return false
  if (requireSuperAdmin) return role === 'super_admin'
  return ['admin', 'super_admin'].includes(role)
}

async function recalcOne(artistId: number): Promise<{ id: number; score: number }> {
  const breakdown = await calculateArtistScore(supabase, artistId)
  await supabase
    .from('artists')
    .update({
      score: breakdown.final_score,
      score_breakdown: breakdown,
      score_updated_at: new Date().toISOString(),
    })
    .eq('id', artistId)
  return { id: artistId, score: breakdown.final_score }
}

export async function GET(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 25)))
  const olderThanHours = Number(url.searchParams.get('older_than') || 24)

  // Find candidates: NULL OR older than X hours
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString()
  const { data: candidates, error } = await supabase
    .from('artists')
    .select('id')
    .or(`score_updated_at.is.null,score_updated_at.lt.${cutoff}`)
    .order('score_updated_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { id: number; score: number }[] = []
  const errors: { id: number; err: string }[] = []
  for (const row of candidates || []) {
    try {
      const r = await recalcOne(row.id)
      results.push(r)
    } catch (e: any) {
      errors.push({ id: row.id, err: String(e?.message || e) })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    failed: errors.length,
    results,
    errors,
  })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // For "all" mode require super_admin
  const isAllMode = body.all === true
  if (!(await authorize(req, isAllMode))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isAllMode) {
    // Mark all stale + return count to recalc via cron
    const { error } = await supabase
      .from('artists')
      .update({ score_updated_at: null })
      .not('score_updated_at', 'is', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { count } = await supabase
      .from('artists')
      .select('id', { count: 'exact', head: true })
      .is('score_updated_at', null)
    return NextResponse.json({
      ok: true,
      mode: 'all',
      message: `Marked all artists stale. Cron will recalc ${count || 0} artistus per kelis run'us.`,
      stale_count: count || 0,
    })
  }

  // Specific artist(s)
  const ids: number[] = []
  if (Number.isFinite(body.artist_id)) ids.push(Number(body.artist_id))
  if (Array.isArray(body.artist_ids)) {
    for (const x of body.artist_ids) if (Number.isFinite(Number(x))) ids.push(Number(x))
  }
  if (!ids.length) {
    return NextResponse.json({ error: 'artist_id arba artist_ids required' }, { status: 400 })
  }

  const results: { id: number; score: number }[] = []
  const errors: { id: number; err: string }[] = []
  for (const id of ids) {
    try {
      const r = await recalcOne(id)
      results.push(r)
    } catch (e: any) {
      errors.push({ id, err: String(e?.message || e) })
    }
  }
  return NextResponse.json({ ok: true, processed: results.length, results, errors })
}
