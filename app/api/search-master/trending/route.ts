import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { ytThumb } from '@/lib/radaras-shared'

/**
 * „Populiariausi šią savaitę" — paieškos empty-state blokas.
 *
 * V2 (patikimumas): anksčiau šaltinis buvo VIEN search_clicks per 14d. Dėl
 * to sekcija atrodydavo „sugedusi": keli test-klikai ant vieno atlikėjo
 * (pvz. 7 Rihanna dainos iš eilės) užplūsdavo visą gridą, o likusi dalis
 * būdavo atsitiktiniai score-fallback'ai, kurių vartotojas niekada neieškojo.
 *
 * Dabar — BLENDAS su diversity:
 *   • clicks per 7d kaip „šviežumo" signalas (cap 1 įrašas / atlikėją),
 *   • likusią dalį pildome top-by-score populiariausiais (irgi cap 1 / atlikėją),
 *   • dainos rodo savo viršelį / YouTube thumbnail, NE atlikėjo nuotrauką.
 *
 * Rezultatas: tankus, įvairus, realiai populiarus mix'as, kuris niekada nėra
 * tuščias ir neužstringa ties vienu atlikėju.
 */

type TrendingHit = {
  id: number | string
  type: 'artists' | 'tracks'
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
  const PER_SIDE = Math.ceil(limit / 2) + 2   // šiek tiek atsargos mix'ui

  // ── 1. Recent clicks (7d) — šviežumo signalas ──
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data: clicks } = await sb
    .from('search_clicks')
    .select('entity_type,entity_id')
    .gte('created_at', since)
    .in('entity_type', ['artists', 'tracks'])
    .limit(2000)

  const counts = new Map<string, { type: 'artists' | 'tracks'; id: number; count: number }>()
  for (const c of (clicks || []) as any[]) {
    const k = `${c.entity_type}:${c.entity_id}`
    const ex = counts.get(k)
    if (ex) ex.count++
    else counts.set(k, { type: c.entity_type, id: c.entity_id, count: 1 })
  }
  const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count)
  const clickArtistIds = sorted.filter(x => x.type === 'artists').map(x => x.id)
  const clickTrackIds = sorted.filter(x => x.type === 'tracks').map(x => x.id)
  const clickMap = new Map(sorted.map(x => [`${x.type}:${x.id}`, x.count]))

  // ── 2. ATLIKĖJAI: clicked (pagal count) → užpildom top-by-score ──
  const artistHits: TrendingHit[] = []
  const seenArtist = new Set<number>()
  const pushArtist = (a: any, click?: number) => {
    if (!a || seenArtist.has(a.id) || artistHits.length >= PER_SIDE) return
    seenArtist.add(a.id)
    artistHits.push({
      id: a.id, type: 'artists', title: a.name,
      image_url: a.cover_image_url,
      href: `/atlikejai/${a.slug}`,
      ...(click ? { click_count: click } : {}),
    })
  }

  if (clickArtistIds.length > 0) {
    const { data } = await sb.from('artists')
      .select('id,slug,name,cover_image_url')
      .in('id', clickArtistIds.slice(0, 40))
    const map = new Map((data || []).map((a: any) => [a.id, a]))
    for (const id of clickArtistIds) pushArtist(map.get(id), clickMap.get(`artists:${id}`))
  }
  if (artistHits.length < PER_SIDE) {
    const { data } = await sb.from('artists')
      .select('id,slug,name,cover_image_url,score')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(PER_SIDE + 10)
    for (const a of (data || []) as any[]) pushArtist(a)
  }

  // ── 3. DAINOS: clicked (cap 1 / atlikėją) → užpildom top-by-score (cap 1 / atlikėją) ──
  const trackHits: TrendingHit[] = []
  const seenTrack = new Set<number>()
  const seenTrackArtist = new Set<number>()
  const TRACK_SEL = 'id,slug,title,score,cover_url,video_url,artist_id,artists:artist_id(name,slug,cover_image_url)'
  const pushTrack = (t: any, click?: number) => {
    if (!t || seenTrack.has(t.id) || trackHits.length >= PER_SIDE) return
    if (t.artist_id && seenTrackArtist.has(t.artist_id)) return   // diversity: max 1 daina / atlikėją
    seenTrack.add(t.id)
    if (t.artist_id) seenTrackArtist.add(t.artist_id)
    trackHits.push({
      id: t.id, type: 'tracks', title: t.title,
      subtitle: t.artists?.name ?? null,
      image_url: t.cover_url || ytThumb(t.video_url) || t.artists?.cover_image_url || null,
      href: slugTrack(t.artists?.slug, t.slug, t.id),
      ...(click ? { click_count: click } : {}),
    })
  }

  if (clickTrackIds.length > 0) {
    const { data } = await sb.from('tracks').select(TRACK_SEL).in('id', clickTrackIds.slice(0, 60))
    const map = new Map((data || []).map((t: any) => [t.id, t]))
    for (const id of clickTrackIds) pushTrack(map.get(id), clickMap.get(`tracks:${id}`))
  }
  if (trackHits.length < PER_SIDE) {
    const { data } = await sb.from('tracks')
      .select(TRACK_SEL)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(PER_SIDE * 8)   // daug kandidatų, nes cap'inam 1/atlikėją
    for (const t of (data || []) as any[]) pushTrack(t)
  }

  // ── 4. Mix'as: atlikėjas → daina → atlikėjas → … ──
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
