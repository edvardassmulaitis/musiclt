// app/api/zaidimai/gaudykle/route.ts
//
// „Atlikėjų gaudyklė" — parenkamas STILIUS (žanras); reikia gaudyti tik to
// stiliaus atlikėjus, kitus praleisti. Grąžinam atlikėjus su nuotraukomis
// (target = ar tinka) + foninės muzikos ištrauką.
//
//   GET → { genre, artists: [{ name, image, target }], musicUrl }

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { ensurePreviews } from '@/lib/itunes'
import { shuffleArr } from '@/lib/zaidimai'

export const dynamic = 'force-dynamic'

// Žanrai su gera aprėptimi (daug žinomų atlikėjų su nuotraukomis)
const TARGET_GENRES = [
  'Roko muzika', 'Pop, R&B muzika', 'Elektroninė, šokių muzika',
  'Sunkioji muzika', "Hip-hop'o muzika", 'Alternatyvioji muzika',
]

type ArtRow = { name: string; cover_image_url: string | null; score: number | null }

export async function GET() {
  const sb = createAdminClient()
  const genre = shuffleArr([...TARGET_GENRES])[0]

  const { data: gr } = await sb.from('genres').select('id').eq('name', genre).maybeSingle()
  if (!gr) return NextResponse.json({ error: 'Stilius nerastas' }, { status: 503 })
  const gid = (gr as any).id

  // Tikslinio stiliaus atlikėjai (su nuotrauka, žinomi)
  const { data: tRows } = await sb
    .from('artist_genres')
    .select('artist_id, artists:artist_id!inner(name, cover_image_url, score)')
    .eq('genre_id', gid)
    .gt('artists.score', 34)
    .not('artists.cover_image_url', 'is', null)
    .limit(160)

  const targetSet = new Set<number>()
  const targetArtists: { name: string; image: string; target: boolean }[] = []
  for (const r of (tRows as any[]) || []) {
    const a = r.artists as ArtRow
    if (!a?.name || !a.cover_image_url) continue
    targetSet.add(r.artist_id)
    targetArtists.push({ name: a.name, image: a.cover_image_url, target: true })
  }

  // Klaidintojai — populiarūs atlikėjai su nuotrauka, NE iš tikslinio stiliaus
  const { data: dRows } = await sb
    .from('artists')
    .select('id, name, cover_image_url, score')
    .gt('score', 40)
    .not('cover_image_url', 'is', null)
    .order('score', { ascending: false })
    .limit(400)
  const distractors: { name: string; image: string; target: boolean }[] = []
  for (const a of (dRows as any[]) || []) {
    if (targetSet.has(a.id) || !a.name || !a.cover_image_url) continue
    distractors.push({ name: a.name, image: a.cover_image_url, target: false })
  }

  const target = shuffleArr(targetArtists).slice(0, 30)
  const distr = shuffleArr(distractors).slice(0, 30)
  if (target.length < 8 || distr.length < 8) return NextResponse.json({ error: 'Per mažai atlikėjų' }, { status: 503 })

  // Foninė muzika — TO PATIES STILIAUS (tikslinio žanro atlikėjų dainos)
  let musicUrl: string | null = null
  try {
    const ids = Array.from(targetSet)
    if (ids.length) {
      const { data: trk } = await sb
        .from('tracks')
        .select('id, title, artist_id, video_views, artists:artist_id!inner(name)')
        .in('artist_id', ids)
        .order('video_views', { ascending: false, nullsFirst: false })
        .limit(50)
      const cand = shuffleArr((trk as any[]) || [])
        .slice(0, 14)
        .map(r => ({ id: r.id as number, title: r.title as string, artist: (Array.isArray(r.artists) ? r.artists[0]?.name : r.artists?.name) as string }))
        .filter(t => t.artist)
      const previews = await ensurePreviews(cand.map(t => ({ id: t.id, title: t.title, artist: t.artist })))
      for (const t of cand) { const u = previews.get(t.id); if (u) { musicUrl = u; break } }
    }
  } catch { /* nebūtina */ }

  return NextResponse.json({ genre, artists: shuffleArr([...target, ...distr]), musicUrl })
}
