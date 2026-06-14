// app/api/admin/kolekcijos/tracks/route.ts
//
// KURUOTŲ dainų valdymas dainų kolekcijai (collection_tracks lentelė).
//   GET    ?slug=...                  — kolekcijos dainos (su atlikėju, position tvarka)
//   POST   { slug, track_id }         — pridėti vieną dainą (gale)
//   POST   { slug, track_ids:[...] }  — pridėti kelias (AI suggest patvirtinimas)
//   DELETE { slug, track_id }         — pašalinti
//   PATCH  { slug, ordered:[ids] }    — pertvarkyti (position pagal masyvo tvarką)

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

async function loadTracks(sb: ReturnType<typeof createAdminClient>, slug: string) {
  const { data: rows } = await sb
    .from('collection_tracks')
    .select('track_id, position')
    .eq('collection_slug', slug)
    .order('position', { ascending: true })
  const ids = ((rows || []) as any[]).map((r) => r.track_id)
  if (ids.length === 0) return []
  const { data: tracks } = await sb
    .from('tracks')
    .select('id, slug, title, cover_url, video_views, artist_id, artists!tracks_artist_id_fkey(name, slug)')
    .in('id', ids)
  const byId = new Map<number, any>()
  for (const t of (tracks || []) as any[]) byId.set(t.id, t)
  return ((rows || []) as any[]).map((r) => {
    const t = byId.get(r.track_id)
    if (!t) return null
    const artist = Array.isArray(t.artists) ? t.artists[0] : t.artists
    return {
      track_id: t.id, position: r.position, title: t.title, slug: t.slug,
      cover_url: t.cover_url, video_views: t.video_views,
      artist_name: artist?.name || null, artist_slug: artist?.slug || null,
    }
  }).filter(Boolean)
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const slug = new URL(req.url).searchParams.get('slug') || ''
  if (!slug) return NextResponse.json({ ok: false, error: 'Trūksta slug' }, { status: 400 })
  try {
    const sb = createAdminClient()
    return NextResponse.json({ ok: true, items: await loadTracks(sb, slug) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const slug = (body.slug || '').toString().trim()
  if (!slug) return NextResponse.json({ ok: false, error: 'Trūksta slug' }, { status: 400 })

  const ids: number[] = Array.isArray(body.track_ids)
    ? body.track_ids.map((x: any) => Number(x)).filter(Boolean)
    : (body.track_id ? [Number(body.track_id)] : [])
  if (ids.length === 0) return NextResponse.json({ ok: false, error: 'Trūksta track_id' }, { status: 400 })

  const sb = createAdminClient()
  const { data: last } = await sb.from('collection_tracks').select('position').eq('collection_slug', slug).order('position', { ascending: false }).limit(1).maybeSingle()
  let pos = ((last?.position as number) ?? -1) + 1
  const rows = ids.map((track_id) => ({ collection_slug: slug, track_id, position: pos++ }))
  const { error } = await sb.from('collection_tracks').upsert(rows, { onConflict: 'collection_slug,track_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  revalidatePath(`/dainos/${slug}`)
  revalidatePath('/muzika', 'layout')
  return NextResponse.json({ ok: true, items: await loadTracks(sb, slug) })
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const slug = (body.slug || '').toString().trim()
  const trackId = Number(body.track_id)
  if (!slug || !trackId) return NextResponse.json({ ok: false, error: 'Trūksta slug/track_id' }, { status: 400 })
  const sb = createAdminClient()
  const { error } = await sb.from('collection_tracks').delete().eq('collection_slug', slug).eq('track_id', trackId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  revalidatePath(`/dainos/${slug}`)
  revalidatePath('/muzika', 'layout')
  return NextResponse.json({ ok: true, items: await loadTracks(sb, slug) })
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const slug = (body.slug || '').toString().trim()
  const ordered: number[] = Array.isArray(body.ordered) ? body.ordered.map((x: any) => Number(x)).filter(Boolean) : []
  if (!slug || ordered.length === 0) return NextResponse.json({ ok: false, error: 'Trūksta slug/ordered' }, { status: 400 })
  const sb = createAdminClient()
  // Atnaujinam position po vieną (masyvai maži — dešimtys dainų)
  for (let i = 0; i < ordered.length; i++) {
    await sb.from('collection_tracks').update({ position: i }).eq('collection_slug', slug).eq('track_id', ordered[i])
  }
  revalidatePath(`/dainos/${slug}`)
  revalidatePath('/muzika', 'layout')
  return NextResponse.json({ ok: true, items: await loadTracks(sb, slug) })
}
