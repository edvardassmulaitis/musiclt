// app/api/zaidimai/ritmas/route.ts
//
// „Pataikyk į bitą" — ritmo žaidimas. Grąžina kelias populiarias dainas su
// iTunes 30 s ištraukomis; naršyklė jas atsisiunčia, analizuoja (Web Audio)
// ir groja. Kol kas be scoringo (žaidžiama /testai zonoje).
//
//   GET → { tracks: [{ id, title, artist, previewUrl }] }

import { NextResponse } from 'next/server'
import { ensurePreviews } from '@/lib/itunes'
import { quizCategory, loadQuizPool, shuffleArr, type PoolTrack } from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [ltPool, worldPool] = await Promise.all([
    loadQuizPool(quizCategory('lt-mix')!),
    loadQuizPool(quizCategory('pasaulis')!),
  ])
  // Populiariausi (pool jau pagal YT peržiūras) — imam iš viršaus, kad būtų žinomos
  const famous = [...ltPool.slice(0, 120), ...worldPool.slice(0, 160)]
  const candidates: PoolTrack[] = []
  const seen = new Set<number>()
  for (const t of shuffleArr(famous)) {
    if (seen.has(t.artist_id)) continue
    seen.add(t.artist_id)
    candidates.push(t)
    if (candidates.length >= 24) break
  }

  const previews = await ensurePreviews(candidates.map(t => ({ id: t.id, title: t.title, artist: t.artist })))
  const tracks = candidates
    .filter(t => previews.get(t.id))
    .slice(0, 8)
    .map(t => ({ id: t.id, title: t.title, artist: t.artist, previewUrl: previews.get(t.id)! }))

  if (tracks.length < 1) {
    return NextResponse.json({ error: 'Šiuo metu trūksta dainų su ištraukomis' }, { status: 503 })
  }
  return NextResponse.json({ tracks })
}
