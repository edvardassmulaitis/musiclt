// app/api/profile/[username]/likes/route.ts
//
// V18d: lazy-load VISŲ nario pamėgtų albumų / dainų (modalas „+N daugiau").
// Profilio puslapis SSR'ina tik 48 (greitas pradinis krovimas), o atidarius
// modalą frontas paima visus per šį endpoint'ą.
//
// Kodėl atskiras endpoint'as, o ne getProfileFavorite{Albums,Tracks}: tos
// funkcijos daro `.in('id', ids)` su 4× pool — tinka šimtams, bet ne 10k+
// (PostgREST URI limitas). Čia: 1) ID'us imam per `profile_favorite_like_ids`
// RPC (funkcinis indeksas, greita), 2) entity'es traukiam CHUNK'ais po 200.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ALBUM_SEL = 'id, slug, title, cover_url:cover_image_url, score, artist_id, artists:artist_id(id, slug, name, cover_image_url)'
const TRACK_SEL = 'id, slug, title, cover_url, video_url, score, artist_id, artists:artist_id(id, slug, name, cover_image_url)'

export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } },
) {
  const username = decodeURIComponent(params.username || '').replace(/^@/, '')
  const kind = new URL(req.url).searchParams.get('kind')
  if (!username || (kind !== 'album' && kind !== 'track')) {
    return NextResponse.json({ items: [] })
  }

  const sb = createAdminClient()

  // 1. Visi pamėgti ID'ai (RPC su funkciniu indeksu) — saugus didelis limitas.
  const { data: idRows, error: idErr } = await sb.rpc('profile_favorite_like_ids', {
    p_username: username,
    p_type: kind,
    p_limit: 12000,
  })
  if (idErr) {
    console.warn('[profile/likes] rpc', idErr.message)
    return NextResponse.json({ items: [] })
  }
  const ids = [...new Set(((idRows || []) as any[]).map((r) => Number(r.entity_id)).filter(Boolean))]
  if (!ids.length) return NextResponse.json({ items: [] })

  // 2. Traukiam entity'es chunk'ais po 200 (vengiam .in() URI limito).
  const sel = kind === 'album' ? ALBUM_SEL : TRACK_SEL
  const table = kind === 'album' ? 'albums' : 'tracks'
  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200))

  const results = await Promise.all(
    chunks.map((c) => sb.from(table).select(sel).in('id', c).then((r) => r.data || [])),
  )
  const rows = results.flat() as any[]

  // 3. Išlaikom RPC tvarką (naujausi pamėgti pirma).
  const order = new Map(ids.map((id, i) => [id, i]))
  rows.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))

  return NextResponse.json({ items: rows })
}
