// app/api/blog/suggestions/route.ts
//
// GET /api/blog/suggestions?kind=artist|album|track|all&limit=8
//
// Grąžina nario PASKUTINIUS PAMĖGTUS įrašus (likes lentelė) — naudojama
// wizard'o picker'iuose kaip „greiti pasiūlymai", kad nereikėtų ieškoti.
// Shape sutampa su MusicSearchPicker AttachmentHit, kad UI galėtų rodyti
// tą patį kortelės komponentą.
//
// Resilient: jei narys neprisijungęs arba dar nieko nepamėgo → tuščias
// sąrašas (UI fallback'ina į tuščią suggestions strip + search).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type Hit = {
  type: 'daina' | 'albumas' | 'grupe'
  id: number
  legacy_id: number | null
  slug: string
  title: string
  artist: string | null
  image_url: string | null
}

const one = (v: any) => (Array.isArray(v) ? v[0] : v)

export async function GET(req: NextRequest) {
  const kind = (req.nextUrl.searchParams.get('kind') || 'all') as
    | 'artist' | 'album' | 'track' | 'all'
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '8'), 1), 20)

  const sb = createAdminClient()

  // ── Kas prisijungęs ──────────────────────────────────────────────────────
  let uid: string | undefined
  try {
    const session = await getServerSession(authOptions)
    uid = (session?.user as any)?.id
  } catch { /* anon */ }
  if (!uid) return NextResponse.json({ suggestions: [] })

  // entity_type'ai, kuriuos traukiam pagal kind
  const wantTypes =
    kind === 'artist' ? ['artist'] :
    kind === 'album'  ? ['album'] :
    kind === 'track'  ? ['track'] :
    ['artist', 'album', 'track']

  // ── Paskutiniai like'ai ────────────────────────────────────────────────
  // Per kind imam šiek tiek daugiau (limit*3) nei reikia, nes resolve gali
  // nukristi (ištrinti entity) — po join'o apkarpysim iki limit.
  const { data: likes } = await sb
    .from('likes')
    .select('entity_type, entity_id, id')
    .eq('user_id', uid)
    .in('entity_type', wantTypes)
    .order('id', { ascending: false })
    .limit(limit * 4)

  if (!likes?.length) return NextResponse.json({ suggestions: [] })

  const artistIds = likes.filter(l => l.entity_type === 'artist').map(l => Number(l.entity_id))
  const albumIds  = likes.filter(l => l.entity_type === 'album').map(l => Number(l.entity_id))
  const trackIds  = likes.filter(l => l.entity_type === 'track').map(l => Number(l.entity_id))

  const [artistsRes, albumsRes, tracksRes] = await Promise.all([
    artistIds.length
      ? sb.from('artists').select('id, slug, name, cover_image_url, legacy_id').in('id', artistIds)
      : Promise.resolve({ data: [] as any[] }),
    albumIds.length
      ? sb.from('albums').select('id, slug, title, cover_image_url, legacy_id, artists:artist_id(name)').in('id', albumIds)
      : Promise.resolve({ data: [] as any[] }),
    trackIds.length
      ? sb.from('tracks').select('id, slug, title, cover_url, legacy_id, artists:artist_id(name)').in('id', trackIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const artistMap = new Map((artistsRes.data || []).map((a: any) => [a.id, a]))
  const albumMap  = new Map((albumsRes.data || []).map((a: any) => [a.id, a]))
  const trackMap  = new Map((tracksRes.data || []).map((t: any) => [t.id, t]))

  // Išlaikom like'ų eilę (naujausi pirmi)
  const out: Hit[] = []
  for (const l of likes) {
    if (out.length >= limit && kind !== 'all') break
    if (l.entity_type === 'artist') {
      const a = artistMap.get(Number(l.entity_id))
      if (a) out.push({ type: 'grupe', id: a.id, legacy_id: a.legacy_id ?? null, slug: a.slug, title: a.name, artist: null, image_url: a.cover_image_url ?? null })
    } else if (l.entity_type === 'album') {
      const a = albumMap.get(Number(l.entity_id))
      if (a) out.push({ type: 'albumas', id: a.id, legacy_id: a.legacy_id ?? null, slug: a.slug, title: a.title, artist: one(a.artists)?.name ?? null, image_url: a.cover_image_url ?? null })
    } else if (l.entity_type === 'track') {
      const t = trackMap.get(Number(l.entity_id))
      if (t) out.push({ type: 'daina', id: t.id, legacy_id: t.legacy_id ?? null, slug: t.slug, title: t.title, artist: one(t.artists)?.name ?? null, image_url: t.cover_url ?? null })
    }
  }

  return NextResponse.json({ suggestions: out.slice(0, kind === 'all' ? limit * 2 : limit) })
}
