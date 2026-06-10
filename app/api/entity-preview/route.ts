// app/api/entity-preview/route.ts
// Lengvas entiteto preview hover kortelei (enrichintos nuorodos): cover, pavadinimas,
// stiliai (atlikėjui), music.lt sekėjų (legacy_likes) skaičius.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 600

const YT = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
const ytThumb = (u?: string | null) => { const m = u?.match?.(YT)?.[1]; return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null }
const first = (v: any) => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

export async function GET(req: Request) {
  const url = new URL(req.url)
  const type = url.searchParams.get('type') || ''
  const id = parseInt(url.searchParams.get('id') || '0', 10)
  const slug = url.searchParams.get('slug') || ''
  if ((!id && !slug) || !['artist', 'album', 'track'].includes(type)) return NextResponse.json({ error: 'bad' }, { status: 400 })
  const sb = createAdminClient()

  // Like'ų skaičius entitetui iš `likes` (entity_id arba legacy).
  const likeCount = async (etype: string, eid: number, legacyId: number | null) => {
    const filt = legacyId ? `entity_id.eq.${eid},entity_legacy_id.eq.${legacyId}` : `entity_id.eq.${eid}`
    const { count } = await sb.from('likes').select('id', { count: 'exact', head: true }).eq('entity_type', etype).or(filt)
    return count || 0
  }
  const HDR = { headers: { 'Cache-Control': 'public, s-maxage=600' } }

  if (type === 'artist') {
    const q = sb.from('artists').select('id, name, slug, cover_image_url, legacy_likes')
    const { data: a } = await (id ? q.eq('id', id) : q.eq('slug', slug)).maybeSingle()
    if (!a) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const { data: g } = await sb.from('artist_genres').select('genres:genre_id(name)').eq('artist_id', a.id).limit(4)
    const genres = (g || []).map((x: any) => first(x.genres)?.name).filter(Boolean)
    return NextResponse.json({ type, title: a.name, subtitle: null, cover: a.cover_image_url || null, genres, metric: a.legacy_likes || 0, metric_label: 'sekėjų', href: `/atlikejai/${a.slug}` }, HDR)
  }
  if (type === 'album') {
    const { data: al } = await sb.from('albums').select('id, legacy_id, title, slug, cover_image_url, release_year, artist:artist_id(name, slug)').eq('id', id).maybeSingle()
    if (!al) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const ar = first(al.artist)
    return NextResponse.json({ type, title: al.title, subtitle: ar?.name || null, cover: al.cover_image_url || null, genres: al.release_year ? [String(al.release_year)] : [], metric: await likeCount('album', al.id, al.legacy_id), metric_label: 'patinka', href: `/albumai/${[ar?.slug, al.slug].filter(Boolean).join('-')}-${al.id}` }, HDR)
  }
  const { data: t } = await sb.from('tracks').select('id, legacy_id, title, slug, cover_url, video_url, artist:artist_id(name, slug)').eq('id', id).maybeSingle()
  if (!t) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const ar = first(t.artist)
  return NextResponse.json({ type, title: t.title, subtitle: ar?.name || null, cover: ytThumb(t.video_url) || t.cover_url || null, genres: [], metric: await likeCount('track', t.id, t.legacy_id), metric_label: 'patinka', href: `/dainos/${t.slug}-${t.id}` }, HDR)
}
