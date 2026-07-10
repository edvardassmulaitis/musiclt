// app/api/zaidimai/gaudykle/rezultatai/route.ts
//
// „Atlikėjų gaudyklė" rezultatų lenta.
//   POST { score, caught, missed, wrong, genre } → įrašo rezultatą
//   GET  → { scores } — paskutiniai 100 GERIAUSIŲ rezultatų (score DESC),
//          kad pabaigoje galėtum pamatyti, kaip pasirodei fone.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewer } from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = createAdminClient()
  const { data } = await sb
    .from('game_scores')
    .select('score')
    .eq('game', 'gaudykle')
    .order('score', { ascending: false })
    .limit(100)
  const scores = ((data as any[]) || []).map(r => r.score as number).filter(n => Number.isFinite(n))
  return NextResponse.json({ scores })
}

export async function POST(req: Request) {
  let body: any = {}
  try { body = await req.json() } catch { /* tuščia */ }
  const score = Math.round(Number(body?.score))
  if (!Number.isFinite(score) || score < 0 || score > 200000) {
    return NextResponse.json({ error: 'Blogas rezultatas' }, { status: 400 })
  }
  const caught = clampInt(body?.caught)
  const missed = clampInt(body?.missed)
  const wrong = clampInt(body?.wrong)
  const genre = typeof body?.genre === 'string' ? body.genre.slice(0, 60) : null

  const viewer = await resolveViewer()
  const sb = createAdminClient()
  await sb.from('game_scores').insert({
    user_id: viewer.userId,
    anon_id: viewer.userId ? null : viewer.anonId,
    game: 'gaudykle',
    category: genre,
    score,
    max_score: null,
    correct_count: caught,
    round_count: caught + missed + wrong,
    xp_earned: 0,
    details: { missed, wrong },
  })

  // grąžinam ir naują top-100, kad klientas iškart parodytų pasiskirstymą
  const { data } = await sb
    .from('game_scores')
    .select('score')
    .eq('game', 'gaudykle')
    .order('score', { ascending: false })
    .limit(100)
  const scores = ((data as any[]) || []).map(r => r.score as number).filter(n => Number.isFinite(n))
  return NextResponse.json({ ok: true, scores })
}

function clampInt(v: any): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : 0
}
