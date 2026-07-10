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

export async function GET() {
  const sb = createAdminClient()

  // Kiekviena populiarumo pakopa — atskira užklausa, kad kristų ir žvaigždės,
  // ir mažiau žinomi (kitaip top-N nusemtų visus žinomus)
  const [{ data: t3 }, { data: t2 }, { data: t1 }] = await Promise.all([
    sb.from('artists').select('name, score').gte('score', 62).order('score', { ascending: false }).limit(120),
    sb.from('artists').select('name, score').gte('score', 42).lt('score', 62).limit(200),
    sb.from('artists').select('name, score').gte('score', 24).lt('score', 42).limit(300),
  ])
  const pick = (rows: any[] | null, tier: number, n: number) =>
    shuffleArr((rows || []).filter(r => r.name)).slice(0, n).map(r => ({ name: r.name as string, tier }))
  const artists = [
    ...pick(t3, 3, 22),
    ...pick(t2, 2, 20),
    ...pick(t1, 1, 20),
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
