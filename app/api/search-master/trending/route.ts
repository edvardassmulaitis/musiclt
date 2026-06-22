import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

/**
 * Populiariausi paieškoje ("Populiariausi šią savaitę").
 *
 * Strategy (RPC `search_trending(days, per_type)`):
 *   - LIVE signalas = REALŪS `search_clicks` (paskutinės 14 d.). Tai
 *     vienintelis nesuterštas realaus aktyvumo šaltinis — `likes.created_at`
 *     yra iškreiptas legacy migracijos (importas stampuoja recent datas),
 *     todėl 7d like'ų langas atrodydavo „random".
 *   - BAZĖ = visų laikų populiariausi pagal bendrą like'ų skaičių
 *     (materialized view `mv_top_liked`, top-150/tipą, refresh savaitinis
 *     per pg_cron). Stabili, atpažįstama (AC/DC, Nirvana, Mamontovas...).
 *   - Merge: realus paspaudimas (×1M) visada iškeliamas VIRŠ bet kokio
 *     all-time bazinio → kai atsiras srautas, sekcija savaime virsta tikru
 *     trending'u; kol jo nėra — rodo tikrai populiarius, niekada ne random.
 *
 * Po RPC: fetch metadata + interleave atlikėjas → daina → albumas (įvairovė).
 * Score-fallback'as žemiau lieka tik kaip kraštutinė apsauga (RPC tuščias).
 *
 * Cache: edge 5min.
 */

type Cat = 'artists' | 'tracks' | 'albums'

type TrendingHit = {
  id: number | string
  type: Cat
  title: string
  subtitle?: string | null
  image_url?: string | null
  href: string
  click_count?: number
}

const slugTrack = (artistSlug: string | null | undefined, trackSlug: string, id: number) =>
  artistSlug ? `/dainos/${artistSlug}-${trackSlug}-${id}` : `/dainos/${trackSlug}-${id}`
const slugAlbum = (slug: string, id: number) => `/albumai/${slug}-${id}`

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '12'), 1), 24)
  const sb = createAdminClient()

  // ── 1. Realus savaitės populiarumas per RPC ──
  let rows: { entity_type: Cat; entity_id: number; cnt: number }[] = []
  try {
    const { data } = await sb.rpc('search_trending', { days: 14, per_type: 30 })
    rows = (data || []) as any[]
  } catch {
    rows = []
  }

  const artistRows = rows.filter(r => r.entity_type === 'artists')
  const trackRows = rows.filter(r => r.entity_type === 'tracks')
  const albumRows = rows.filter(r => r.entity_type === 'albums')

  let artistHits: TrendingHit[] = []
  let trackHits: TrendingHit[] = []
  let albumHits: TrendingHit[] = []

  // ── 2. Metadata ──
  if (artistRows.length > 0) {
    const ids = artistRows.map(x => x.entity_id)
    const { data } = await sb
      .from('artists')
      .select('id,slug,name,cover_image_url')
      .in('id', ids)
    const map = new Map((data || []).map((a: any) => [a.id, a]))
    artistHits = artistRows
      .map(x => {
        const a: any = map.get(x.entity_id)
        if (!a) return null
        return {
          id: a.id,
          type: 'artists' as const,
          title: a.name,
          image_url: a.cover_image_url,
          href: `/atlikejai/${a.slug}`,
          click_count: x.cnt,
        }
      })
      .filter(Boolean) as TrendingHit[]
  }

  if (trackRows.length > 0) {
    const ids = trackRows.map(x => x.entity_id)
    const { data } = await sb
      .from('tracks')
      .select('id,slug,title,artist_id,artists:artist_id(name,slug,cover_image_url)')
      .in('id', ids)
    const map = new Map((data || []).map((t: any) => [t.id, t]))
    trackHits = trackRows
      .map(x => {
        const t: any = map.get(x.entity_id)
        if (!t) return null
        return {
          id: t.id,
          type: 'tracks' as const,
          title: t.title,
          subtitle: t.artists?.name ?? null,
          image_url: t.artists?.cover_image_url ?? null,
          href: slugTrack(t.artists?.slug, t.slug, t.id),
          click_count: x.cnt,
        }
      })
      .filter(Boolean) as TrendingHit[]
  }

  if (albumRows.length > 0) {
    const ids = albumRows.map(x => x.entity_id)
    const { data } = await sb
      .from('albums')
      .select('id,slug,title,artist_id,cover_image_url,artists:artist_id(name,slug)')
      .in('id', ids)
    const map = new Map((data || []).map((al: any) => [al.id, al]))
    albumHits = albumRows
      .map(x => {
        const al: any = map.get(x.entity_id)
        if (!al) return null
        return {
          id: al.id,
          type: 'albums' as const,
          title: al.title,
          subtitle: al.artists?.name ?? null,
          image_url: al.cover_image_url,
          href: slugAlbum(al.slug, al.id),
          click_count: x.cnt,
        }
      })
      .filter(Boolean) as TrendingHit[]
  }

  // ── 3. Fallback'ai (tik jei kategorija beveik tuščia) ──
  if (artistHits.length < 3) {
    const have = new Set(artistHits.map(h => h.id))
    const { data } = await sb
      .from('artists')
      .select('id,slug,name,cover_image_url,score')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(10)
    for (const a of (data || []) as any[]) {
      if (have.has(a.id) || artistHits.length >= 5) continue
      artistHits.push({
        id: a.id, type: 'artists', title: a.name,
        image_url: a.cover_image_url, href: `/atlikejai/${a.slug}`,
      })
      have.add(a.id)
    }
  }
  if (trackHits.length < 3) {
    const have = new Set(trackHits.map(h => h.id))
    const { data } = await sb
      .from('tracks')
      .select('id,slug,title,artist_id,artists:artist_id(name,slug,cover_image_url),score')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(10)
    for (const t of (data || []) as any[]) {
      if (have.has(t.id) || trackHits.length >= 5) continue
      trackHits.push({
        id: t.id, type: 'tracks', title: t.title,
        subtitle: t.artists?.name ?? null,
        image_url: t.artists?.cover_image_url ?? null,
        href: slugTrack(t.artists?.slug, t.slug, t.id),
      })
      have.add(t.id)
    }
  }
  if (albumHits.length < 2) {
    const have = new Set(albumHits.map(h => h.id))
    const { data } = await sb
      .from('albums')
      .select('id,slug,title,artist_id,cover_image_url,artists:artist_id(name,slug),score')
      .order('score', { ascending: false, nullsFirst: false })
      .limit(8)
    for (const al of (data || []) as any[]) {
      if (have.has(al.id) || albumHits.length >= 4) continue
      albumHits.push({
        id: al.id, type: 'albums', title: al.title,
        subtitle: al.artists?.name ?? null,
        image_url: al.cover_image_url,
        href: slugAlbum(al.slug, al.id),
      })
      have.add(al.id)
    }
  }

  // ── 4. Interleave: atlikėjas → daina → albumas → ... (įvairovė) ──
  const out: TrendingHit[] = []
  const lanes = [artistHits, trackHits, albumHits]
  const maxLen = Math.max(...lanes.map(l => l.length))
  for (let i = 0; i < maxLen && out.length < limit; i++) {
    for (const lane of lanes) {
      if (lane[i] && out.length < limit) out.push(lane[i])
    }
  }

  return NextResponse.json({ items: out.slice(0, limit) }, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
      'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
    },
  })
}
