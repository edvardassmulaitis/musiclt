// app/api/zaidimai/gaudykle/route.ts
//
// „Atlikėjų gaudyklė" — krenta atlikėjai; kuo populiaresnis, tuo daugiau taškų.
// Grąžina atlikėjų sąrašą su populiarumo pakopa (tier) + foninės muzikos ištrauką.
//
//   GET → { artists: [{ name, tier }], musicUrl }
//   tier: 3 = žvaigždė (30 tšk.), 2 = žinomas (20), 1 = (10)

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { ensurePreviews } from '@/lib/itunes'
import { quizCategory, loadQuizPool, shuffleArr } from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

function tierOf(score: number): number {
  if (score >= 62) return 3
  if (score >= 42) return 2
  return 1
}

export async function GET() {
  const sb = createAdminClient()

  // Atlikėjai su populiarumu (mišrus LT + pasaulio, kad būtų atpažįstamų)
  const { data } = await sb
    .from('artists')
    .select('name, score, country')
    .gt('score', 20)
    .order('score', { ascending: false })
    .limit(600)

  const rows = (data as { name: string; score: number; country: string | null }[]) || []
  // Paimam po dalį iš kiekvienos pakopos, kad kristų ir žvaigždės, ir mažiau žinomi
  const byTier: Record<number, { name: string; tier: number }[]> = { 1: [], 2: [], 3: [] }
  for (const r of rows) {
    if (!r.name) continue
    const t = tierOf(r.score || 0)
    byTier[t].push({ name: r.name, tier: t })
  }
  const artists = [
    ...shuffleArr(byTier[3]).slice(0, 24),
    ...shuffleArr(byTier[2]).slice(0, 22),
    ...shuffleArr(byTier[1]).slice(0, 18),
  ]
  if (artists.length < 12) return NextResponse.json({ error: 'Per mažai atlikėjų' }, { status: 503 })

  // Foninė muzika — vienos populiarios dainos ištrauka
  let musicUrl: string | null = null
  try {
    const pool = [...(await loadQuizPool(quizCategory('pasaulis')!)).slice(0, 40), ...(await loadQuizPool(quizCategory('lt-mix')!)).slice(0, 20)]
    const pick = shuffleArr(pool).slice(0, 6)
    const previews = await ensurePreviews(pick.map(t => ({ id: t.id, title: t.title, artist: t.artist })))
    for (const t of pick) { const u = previews.get(t.id); if (u) { musicUrl = u; break } }
  } catch { /* fono muzika neprivaloma */ }

  return NextResponse.json({ artists: shuffleArr(artists), musicUrl })
}
