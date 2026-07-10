// app/api/zaidimai/koncertas/route.ts
//
// „Dienos koncertas" — kiekvieną dieną vienas atlikėjas (visiems tas pats),
// jo dainų SETAS (~10) sukamas viena po kitos. Setas surikiuotas taip, kad
// FINALE grotų didžiausi hitai (kulminacija).
//
//   GET → { artist: { name, image }, setlist: [{ title, url }], date }

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { ensurePreviews } from '@/lib/itunes'
import { dailySeed, mulberry32, seededShuffle } from '@/lib/zaidimai'
import { todayLT } from '@/lib/boombox'

export const dynamic = 'force-dynamic'

const SET_MAX = 10
const SET_MIN = 6

export async function GET() {
  const sb = createAdminClient()
  const date = todayLT()

  // Kandidatai — žinomi atlikėjai su nuotrauka (turi ką rodyti LED ekrane)
  const { data: cands } = await sb
    .from('artists')
    .select('id, name, cover_image_url, score')
    .not('cover_image_url', 'is', null)
    .gt('score', 45)
    .order('score', { ascending: false })
    .limit(300)

  const pool = ((cands as any[]) || []).filter(a => a.name && a.cover_image_url)
  if (!pool.length) return NextResponse.json({ error: 'Nėra atlikėjų' }, { status: 503 })

  // Deterministinis dienos pasirinkimas
  const ordered = seededShuffle(pool, mulberry32(dailySeed('koncertas')))

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
    // populiarumo tvarka (didžiausi hitai pirmi)
    const withUrl: { title: string; url: string }[] = []
    for (const t of rows) { const u = previews.get(t.id); if (u) withUrl.push({ title: t.title, url: u }) }
    if (withUrl.length < SET_MIN) continue

    const top = withUrl.slice(0, SET_MAX)
    // FINALE = didžiausias hitas → apverčiam (dabar didžiausi gale)
    const setlist = top.reverse()

    return NextResponse.json({
      artist: { name: a.name, image: a.cover_image_url },
      setlist,
      date,
    })
  }

  return NextResponse.json({ error: 'Nepavyko sudaryti koncerto — bandyk vėliau' }, { status: 503 })
}
