// app/api/admin/boombox/drops/route.ts
//
// Admin CRUD'as visiems boombox drop tipams. Vienas endpoint'as su:
//   GET    ?type=image|duel|verdict|video  → list pagal datą + status
//   POST   { type, ...payload }             → sukurti naują draft'ą
//   PATCH  { id, type, ...patch }           → update (status, schedule, fields)
//   DELETE { id, type }                     → archyvuoti
//
// Auth: admin / super_admin only.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const TYPE_TO_TABLE: Record<string, string> = {
  image: 'boombox_image_drops',
  duel: 'boombox_duel_drops',
  verdict: 'boombox_verdict_drops',
  video: 'boombox_video_drops',
}

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'super_admin') return null
  const sb = createAdminClient()
  const { data } = await sb.from('profiles').select('id').eq('email', session!.user!.email!).maybeSingle()
  return data?.id || null
}

function jsonErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin()
  if (!adminId) return jsonErr('Tik adminams', 403)

  const url = new URL(req.url)
  const type = url.searchParams.get('type')
  if (!type || !TYPE_TO_TABLE[type]) return jsonErr('Bad type')

  const sb = createAdminClient()
  const table = TYPE_TO_TABLE[type]
  const select = type === 'image'
    ? 'id, image_url, ai_prompt, correct_track_id, decoy_track_ids, difficulty, scheduled_for, status, created_at'
    : type === 'duel'
    ? 'id, matchup_type, track_a_id, track_b_id, scheduled_for, status, created_at'
    : type === 'verdict'
    ? 'id, track_id, scheduled_for, status, created_at'
    : 'id, source, source_url, embed_id, caption, related_artist_id, related_track_id, scheduled_for, sort_order, status, created_at'

  const { data, error } = await sb
    .from(table)
    .select(select)
    .neq('status', 'archived')
    .order('scheduled_for', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return jsonErr(error.message, 500)

  // Enrich with track titles for display
  const trackIds = new Set<number>()
  for (const row of data || []) {
    if (type === 'image') {
      trackIds.add((row as any).correct_track_id)
      for (const d of (row as any).decoy_track_ids || []) trackIds.add(d)
    } else if (type === 'duel') {
      trackIds.add((row as any).track_a_id)
      trackIds.add((row as any).track_b_id)
    } else if (type === 'verdict') {
      trackIds.add((row as any).track_id)
    } else if (type === 'video' && (row as any).related_track_id) {
      trackIds.add((row as any).related_track_id)
    }
  }

  let trackMap: Record<number, { id: number; title: string; artist: string }> = {}
  if (trackIds.size > 0) {
    const { data: tracks } = await sb
      .from('tracks')
      .select('id, title, artists:artist_id ( id, name )')
      .in('id', Array.from(trackIds))
    for (const t of tracks || []) {
      const artist = Array.isArray((t as any).artists) ? (t as any).artists[0] : (t as any).artists
      trackMap[(t as any).id] = {
        id: (t as any).id,
        title: (t as any).title,
        artist: artist?.name || '—',
      }
    }
  }

  // Fetch artists for video drops
  let artistMap: Record<number, { id: number; name: string }> = {}
  if (type === 'video') {
    const aIds = new Set<number>()
    for (const row of data || []) if ((row as any).related_artist_id) aIds.add((row as any).related_artist_id)
    if (aIds.size > 0) {
      const { data: artists } = await sb.from('artists').select('id, name').in('id', Array.from(aIds))
      for (const a of artists || []) artistMap[(a as any).id] = { id: (a as any).id, name: (a as any).name }
    }
  }

  return NextResponse.json({ drops: data || [], trackMap, artistMap })
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin()
  if (!adminId) return jsonErr('Tik adminams', 403)

  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Bad JSON')

  const { type, ...rest } = body
  if (!type || !TYPE_TO_TABLE[type]) return jsonErr('Bad type')
  const sb = createAdminClient()
  const table = TYPE_TO_TABLE[type]

  let row: any = { created_by: adminId }

  if (type === 'image') {
    if (!rest.image_url) return jsonErr('Trūksta image_url')
    if (!rest.correct_track_id) return jsonErr('Trūksta correct_track_id')
    if (!Array.isArray(rest.decoy_track_ids) || rest.decoy_track_ids.length !== 3) return jsonErr('Reikia 3 decoy track\'ų')
    row = {
      ...row,
      image_url: rest.image_url,
      ai_prompt: rest.ai_prompt || null,
      correct_track_id: rest.correct_track_id,
      decoy_track_ids: rest.decoy_track_ids,
      difficulty: rest.difficulty || 2,
      scheduled_for: rest.scheduled_for || null,
      status: rest.status || 'draft',
    }
  } else if (type === 'duel') {
    if (!rest.track_a_id || !rest.track_b_id) return jsonErr('Trūksta abiejų track id')
    if (rest.track_a_id === rest.track_b_id) return jsonErr('Track A ir B turi skirtis')
    if (!rest.matchup_type) return jsonErr('Trūksta matchup_type')
    row = {
      ...row,
      matchup_type: rest.matchup_type,
      track_a_id: rest.track_a_id,
      track_b_id: rest.track_b_id,
      scheduled_for: rest.scheduled_for || null,
      status: rest.status || 'draft',
    }
  } else if (type === 'verdict') {
    if (!rest.track_id) return jsonErr('Trūksta track_id')
    row = {
      ...row,
      track_id: rest.track_id,
      scheduled_for: rest.scheduled_for || null,
      status: rest.status || 'draft',
    }
  } else if (type === 'video') {
    if (!rest.source || !rest.source_url || !rest.caption) return jsonErr('Trūksta laukų')
    row = {
      curated_by: adminId,
      source: rest.source,
      source_url: rest.source_url,
      embed_id: rest.embed_id || null,
      caption: rest.caption,
      related_artist_id: rest.related_artist_id || null,
      related_track_id: rest.related_track_id || null,
      scheduled_for: rest.scheduled_for || null,
      sort_order: rest.sort_order || 0,
      status: rest.status || 'draft',
    }
  }

  const { data, error } = await sb.from(table).insert(row).select().single()
  if (error) return jsonErr(error.message, 500)
  return NextResponse.json({ drop: data })
}

export async function PATCH(req: NextRequest) {
  const adminId = await requireAdmin()
  if (!adminId) return jsonErr('Tik adminams', 403)

  const body = await req.json().catch(() => null)
  if (!body) return jsonErr('Bad JSON')

  const { id, type, ...patch } = body
  if (!id || !type || !TYPE_TO_TABLE[type]) return jsonErr('Bad params')

  const sb = createAdminClient()
  const table = TYPE_TO_TABLE[type]
  delete patch.id
  delete patch.created_at

  const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single()
  if (error) return jsonErr(error.message, 500)
  return NextResponse.json({ drop: data })
}

export async function DELETE(req: NextRequest) {
  const adminId = await requireAdmin()
  if (!adminId) return jsonErr('Tik adminams', 403)

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const type = url.searchParams.get('type')
  if (!id || !type || !TYPE_TO_TABLE[type]) return jsonErr('Bad params')

  const sb = createAdminClient()
  const table = TYPE_TO_TABLE[type]
  const { error } = await sb.from(table).update({ status: 'archived' }).eq('id', parseInt(id))
  if (error) return jsonErr(error.message, 500)
  return NextResponse.json({ ok: true })
}
