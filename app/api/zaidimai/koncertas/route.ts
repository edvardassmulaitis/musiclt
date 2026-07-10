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

// ne studijinės versijos (metam laukan)
const JUNK = /(\blive\b|unplugged|acoustic|remix|remaster|instrumental|karaoke|\bdemo\b|radio edit|extended|\bmix\b|reprise|session|rehearsal|cover|tribute)/i
function baseTitle(t: string): string {
  return t.toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\s*-\s*.*$/, '')
    .replace(/feat\.?.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

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
      .limit(30)
    const raw = ((trk as any[]) || []).filter(t => t.title)
    if (raw.length < SET_MIN) continue

    // Išmetam ne studijines versijas + dedublikuojam pagal bazinį pavadinimą,
    // kad į setą patektų tikros dainos (ne „live/unplugged/remix" kopijos).
    const seen = new Set<string>()
    const cleaned: any[] = []
    for (const t of raw) {
      if (JUNK.test(t.title)) continue
      const b = baseTitle(t.title)
      if (!b || seen.has(b)) continue
      seen.add(b); cleaned.push(t)
    }
    const rows = (cleaned.length >= SET_MIN ? cleaned : raw).slice(0, 20)

    const previews = await ensurePreviews(rows.map(t => ({ id: t.id, title: t.title, artist: a.name })))
    const withUrl: { title: string; url: string; views: number }[] = []
    for (const t of rows) {
      const u = previews.get(t.id)
      if (u) withUrl.push({ title: t.title, url: u, views: Number(t.video_views) || 0 })
    }
    if (withUrl.length < SET_MIN) continue

    // pop pagal populiarumo rangą (0 = didžiausias hitas)
    const wp = withUrl.map((t, i) => ({ title: t.title, url: t.url, pop: Math.max(0.3, Math.min(1, 1 - i * 0.05)) }))

    // Top 5 — visada įtraukiam; likusias 5 imam atsitiktinai iš top 6–20;
    // top hitus imaišom po vieną su atsitiktinėmis; FINALE = didžiausias hitas.
    const top5 = wp.slice(0, 5)
    const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0)
    const rest = seededShuffle(wp.slice(5), rng).slice(0, Math.max(0, SET_MAX - top5.length))
    const finale = top5[0]
    const midTop = top5.slice(1)
    const inter: typeof wp = []
    const maxLen = Math.max(midTop.length, rest.length)
    for (let i = 0; i < maxLen; i++) {
      if (i < midTop.length) inter.push(midTop[i])
      if (i < rest.length) inter.push(rest[i])
    }
    const setlist = [...inter, finale]

    return NextResponse.json({
      artist: { name: a.name, image: a.cover_image_url },
      setlist,
      date,
    })
  }

  return NextResponse.json({ error: 'Nepavyko sudaryti koncerto — bandyk vėliau' }, { status: 503 })
}
