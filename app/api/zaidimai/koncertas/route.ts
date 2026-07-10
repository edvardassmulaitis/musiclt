// app/api/zaidimai/koncertas/route.ts
//
// „Dienos koncertas" — kiekvieną dieną vienas atlikėjas (visiems tas pats),
// jo dainų SETAS (~10). Setas: didžiausias hitas FINALE, likusios sumaišytos,
// kad intensyvumas svyruotų. Kiekviena daina turi `pop` (0..1 populiarumas),
// kuris kliente valdo hype gausą/greitį (hitai — karščiau, retesnės — ramiau).
//
//   GET            → dienos atlikėjas (deterministinis, visiems tas pats)
//   GET ?kitas=1   → atsitiktinis kitas atlikėjas (testavimui / VIP)
//   → { artist: { name, image }, setlist: [{ title, url, pop }], date }

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { ensurePreviews } from '@/lib/itunes'
import { dailySeed, mulberry32, seededShuffle } from '@/lib/zaidimai'
import { todayLT } from '@/lib/boombox'

export const dynamic = 'force-dynamic'

const SET_MAX = 10
const SET_MIN = 6

export async function GET(req: Request) {
  const sb = createAdminClient()
  const date = todayLT()
  const kitas = new URL(req.url).searchParams.has('kitas')
  const seed = kitas ? (Math.floor(Math.random() * 1e9) >>> 0) : dailySeed('koncertas')

  const { data: cands } = await sb
    .from('artists')
    .select('id, name, cover_image_url, score')
    .not('cover_image_url', 'is', null)
    .gt('score', 45)
    .order('score', { ascending: false })
    .limit(300)

  const pool = ((cands as any[]) || []).filter(a => a.name && a.cover_image_url)
  if (!pool.length) return NextResponse.json({ error: 'Nėra atlikėjų' }, { status: 503 })

  const ordered = seededShuffle(pool, mulberry32(seed))

  for (let attempt = 0; attempt < 6 && attempt < ordered.length; attempt++) {
    const a = ordered[attempt]
    const { data: trk } = await sb
      .from('tracks')
      .select('id, title, video_views')
      .eq('artist_id', a.id)
      .order('video_views', { ascending: false, nullsFirst: false })
      .limit(16)
    const rows = ((trk as any[]) || []).filter(t => t.title)
    if (rows.length < SET_MIN) continue

    const previews = await ensurePreviews(rows.map(t => ({ id: t.id, title: t.title, artist: a.name })))
    const withUrl: { title: string; url: string; views: number }[] = []
    for (const t of rows) {
      const u = previews.get(t.id)
      if (u) withUrl.push({ title: t.title, url: u, views: Number(t.video_views) || 0 })
    }
    if (withUrl.length < SET_MIN) continue

    const top = withUrl.slice(0, SET_MAX)            // populiarumo tvarka (didžiausi pirmi)
    // pop pagal RANGĄ (ne žalius views — jų dažnai nėra), kad setas visada svyruotų
    const n = top.length
    const withPop = top.map((t, i) => ({ title: t.title, url: t.url, pop: n > 1 ? 0.35 + (1 - i / (n - 1)) * 0.65 : 1 }))

    // FINALE = didžiausias hitas; likusios sumaišytos, kad intensyvumas svyruotų
    const finale = withPop[0]
    const rest = seededShuffle(withPop.slice(1), mulberry32((seed ^ 0x9e3779b9) >>> 0))
    const setlist = [...rest, finale]

    return NextResponse.json({
      artist: { name: a.name, image: a.cover_image_url },
      setlist,
      date,
    })
  }

  return NextResponse.json({ error: 'Nepavyko sudaryti koncerto — bandyk vėliau' }, { status: 503 })
}
