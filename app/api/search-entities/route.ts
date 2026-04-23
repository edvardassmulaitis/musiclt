import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

/** Combined search across artists / albums / tracks for the reply-form entity picker.
 *  Returns up to 24 total results, sorted: exact-name first, then starts-with, then contains. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const sb = createAdminClient()
  const pattern = `%${q.replace(/[%_]/g, '')}%`

  const [artistsRes, albumsRes, tracksRes] = await Promise.all([
    sb
      .from('artists')
      .select('id,slug,name,cover_image_url,legacy_id')
      .ilike('name', pattern)
      .limit(8),
    sb
      .from('albums')
      .select('id,slug,title,cover_image_url,legacy_id,artist_id,artists:artist_id(name)')
      .ilike('title', pattern)
      .limit(8),
    sb
      .from('tracks')
      .select('id,slug,title,legacy_id,artist_id,artists:artist_id(name)')
      .ilike('title', pattern)
      .limit(10),
  ])

  type Hit = {
    type: 'daina' | 'albumas' | 'grupe'
    id: number
    legacy_id: number | null
    slug: string
    title: string
    artist: string | null
    image_url: string | null
  }
  const results: Hit[] = []

  for (const a of (artistsRes.data as Array<{
    id: number; slug: string; name: string; cover_image_url: string | null; legacy_id: number | null
  }> | null) ?? []) {
    results.push({
      type: 'grupe', id: a.id, legacy_id: a.legacy_id, slug: a.slug,
      title: a.name, artist: null, image_url: a.cover_image_url,
    })
  }
  for (const al of (albumsRes.data as Array<{
    id: number; slug: string; title: string; cover_image_url: string | null; legacy_id: number | null; artists: { name: string } | null
  }> | null) ?? []) {
    results.push({
      type: 'albumas', id: al.id, legacy_id: al.legacy_id, slug: al.slug,
      title: al.title, artist: al.artists?.name ?? null, image_url: al.cover_image_url,
    })
  }
  for (const t of (tracksRes.data as Array<{
    id: number; slug: string; title: string; legacy_id: number | null; artists: { name: string } | null
  }> | null) ?? []) {
    results.push({
      type: 'daina', id: t.id, legacy_id: t.legacy_id, slug: t.slug,
      title: t.title, artist: t.artists?.name ?? null, image_url: null,
    })
  }

  // Rank: exact > starts-with > contains
  const qLow = q.toLowerCase()
  const score = (h: Hit) => {
    const tl = h.title.toLowerCase()
    if (tl === qLow) return 0
    if (tl.startsWith(qLow)) return 1
    return 2
  }
  results.sort((a, b) => score(a) - score(b))
  return NextResponse.json({ results: results.slice(0, 24) })
}
