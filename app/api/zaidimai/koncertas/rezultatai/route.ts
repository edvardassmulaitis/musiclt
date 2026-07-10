// app/api/zaidimai/koncertas/rezultatai/route.ts
//
// „Dienos koncertas" rezultatų lenta.
//   POST { score, hype, missed, songs, artist } → įrašo rezultatą
//   GET  → { scores } — paskutiniai 100 GERIAUSIŲ rezultatų (score DESC).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveViewer } from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = createAdminClient()
  const { data } = await sb
    .from('game_scores')
    .select('score, round_count')
    .eq('game', 'koncertas')
    .order('score', { ascending: false })
    .limit(100)
  const rows = (data as any[]) || []
  const scores = rows.map(r => r.score as number).filter(n => Number.isFinite(n))
  const songsReached = rows.map(r => r.round_count as number).filter(n => Number.isFinite(n))
  return NextResponse.json({ scores, songsReached })
}

export async function POST(req: Request) {
  let body: any = {}
  try { body = await req.json() } catch { /* tuščia */ }
  const score = Math.round(Number(body?.score))
  if (!Number.isFinite(score) || score < 0 || score > 500000) {
    return NextResponse.json({ error: 'Blogas rezultatas' }, { status: 400 })
  }
  const hype = clampInt(body?.hype)
  const missed = clampInt(body?.missed)
  const songs = clampInt(body?.songs)
  const artist = typeof body?.artist === 'string' ? body.artist.slice(0, 80) : null

  const viewer = await resolveViewer()
  const sb = createAdminClient()
  await sb.from('game_scores').insert({
    user_id: viewer.userId,
    anon_id: viewer.userId ? null : viewer.anonId,
    game: 'koncertas',
    category: artist,
    score,
    max_score: null,
    correct_count: hype,
    round_count: songs,
    xp_earned: 0,
    details: { missed, songs },
  })

  const { data } = await sb
    .from('game_scores')
    .select('score')
    .eq('game', 'koncertas')
    .order('score', { ascending: false })
    .limit(100)
  const scores = ((data as any[]) || []).map(r => r.score as number).filter(n => Number.isFinite(n))
  return NextResponse.json({ ok: true, scores })
}

function clampInt(v: any): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : 0
}
