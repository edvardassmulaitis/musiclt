import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

/**
 * Populiariausi paieškoje rasti elementai (trending).
 *
 * Strategy:
 *   1. Imam paskutinių 14 dienų search_clicks įrašus.
 *   2. Group'inam pagal (entity_type, entity_id) → click count.
 *   3. Padarome FETCH į atitinkamas lenteles, kad pagautume metadata
 *      (slug, title, image_url) — atspindi pilną Hit shape'ą kaip
 *      master search.
 *
 * Fallback'as: jei dar nėra click'ų (anksti po launch'o), grąžinam top
 * atlikėjus + top dainas pagal score, kad sekcija nebūtų tuščia.
 *
 * Limit'ai: pagal default 8 viso, mix'as ~5 atlikėjų + ~5 dainų.
 *
 * Cache: edge-cache 5min (mažiau dažnas refresh nei autosuggest).
 */

type TrendingHit = {
  id: number | string
  type: 'artists' | 'tracks' | 'albums'
  title: string
  subtitle?: string | null
  image_url?: string | null
  href: string
  click_count?: number
}

const slugTrack = (artistSlug: string | null | undefined, trackSlug: string, id: number) =>
  artistSlug ? `/dainos/${artistSlug}-${trackSlug}-${id}` : `/dainos/${trackSlug}-${id}`

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10'), 1), 20)
  const sb = createAdminClient()

  // Window: 14 dienų
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()

  // 1. Search clicks group'avimas. Supabase RLS user'ių už admin'ą block'ina
  // SELECT'ą; admin client (service role) bypass'ina RLS.
  const { data: clicks } = await sb
    .from('search_clicks')
    .select('entity_type,entity_id')
    .gte('created_at', since)
    .in('entity_type', ['artists', 'tracks'])
    .limit(2000)

  // Aggregate'inam ant kliento — paprastam volume'ui (≤2k records) tai OK.
  // Future: padaryt RPC funkciją, kuri grąžintų pre-aggregated rezultatą.
  const counts = new Map<string, { type: 'artists' | 'tracks'; id: number; count: number }>()
  for (const c of (clicks || []) as any[]) {
    const k = `${c.entity_type}:${c.entity_id}`
    const ex = counts.get(k)
    if (ex) ex.count++
    else counts.set(k, { type: c.entity_type, id: c.entity_id, count: 1 })
  }

  // Surūšiuojam pagal click count desc, top 30 per kategoriją (kad
  // turėtume pakankamai duomenų sumix'avimui).
  const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count)
  const topArtistRows = sorted.filter(x => x.type === 'artists').slice(0, 30)
  const topTrackRows = sorted.filter(x => x.type === 'tracks').slice(0, 30)

  // Fetch'iname atlikėjų ir dainų metadata
  let artistHits: TrendingHit[] = []
  let trackHits: TrendingHit[] = []

  if (topArtistRows.length > 0) {
    const ids = topArtistRows.map(x => x.id)
    const { data } = await sb
      .from('artists')
      .select('id,slug,name,cover_image_url')
      .in('id', ids)
    const map = new Map((data || []).map((a: any) => [a.id, a]))
    artistHits = topArtistRows
      .map(x => {
        const a: any = map.get(x.id)
        if (!a) return null
        return {
          id: a.id,
          type: 'artists' as const,
          title: a.name,
          image_url: a.cover_image_url,
          href: `/atlikejai/${a.slug}`,
          click_count: x.count,
        }
      })
      .filter(Boolean) as TrendingHit[]
  }

  if (topTrackRows.length > 0) {
    const ids = topTrackRows.map(x => x.id)
    const { data } = await sb
      .from('tracks')
      .select('id,slug,title,artist_id,artists:artist_id(name,slug,cover_image_url)')
      .in('id', ids)
    const map = new Map((data || []).map((t: any) => [t.id, t]))
    trackHits = topTrackRows
      .map(x => {
        const t: any = map.get(x.id)
        if (!t) return null
        return {
          id: t.id,
          type: 'tracks' as const,
          title: t.title,
          subtitle: t.artists?.name ?? null,
          image_url: t.artists?.cover_image_url ?? null,
          href: slugTrack(t.artists?.slug, t.slug, t.id),
          click_count: x.count,
        }
      })
      .filter(Boolean) as TrendingHit[]
  }

  // ── Fallback'as kai dar nėra duomenų ──
  // Jei <3 click-based items kiekvienoj kategorijoj, papildyt top score'ais.
  if (artistHits.length < 3) {
    const need = 6 - artistHits.length
    const have = new Set(artistHits.map(h => h.id))
    const { data } = await sb
      .from('artists')
      .select('id,slug,name,cover_image_url,score')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(need + 5)
    for (const a of (data || []) as any[]) {
      if (have.has(a.id)) continue
      if (artistHits.length >= 6) break
      artistHits.push({
        id: a.id, type: 'artists', title: a.name,
        image_url: a.cover_image_url,
        href: `/atlikejai/${a.slug}`,
      })
      have.add(a.id)
    }
  }
  if (trackHits.length < 3) {
    const need = 6 - trackHits.length
    const have = new Set(trackHits.map(h => h.id))
    const { data } = await sb
      .from('tracks')
      .select('id,slug,title,artist_id,artists:artist_id(name,slug,cover_image_url),score')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(need + 5)
    for (const t of (data || []) as any[]) {
      if (have.has(t.id)) continue
      if (trackHits.length >= 6) break
      trackHits.push({
        id: t.id, type: 'tracks', title: t.title,
        subtitle: t.artists?.name ?? null,
        image_url: t.artists?.cover_image_url ?? null,
        href: slugTrack(t.artists?.slug, t.slug, t.id),
      })
      have.add(t.id)
    }
  }

  // Mix'inam į vieną sąrašą, alternuojant atlikėjas → daina → atlikėjas → ...
  // Tai geriau atrodo grid'e nei visi atlikėjai pirma, dainos po jų.
  const out: TrendingHit[] = []
  const maxLen = Math.max(artistHits.length, trackHits.length)
  for (let i = 0; i < maxLen && out.length < limit; i++) {
    if (artistHits[i] && out.length < limit) out.push(artistHits[i])
    if (trackHits[i] && out.length < limit) out.push(trackHits[i])
  }

  return NextResponse.json({ items: out.slice(0, limit) }, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
      'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
    },
  })
}
