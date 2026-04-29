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

function detectVideoSource(url: string): { source: string; embedId: string | null } {
  // YouTube Shorts: https://www.youtube.com/shorts/VIDEO_ID
  const ytShorts = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/)
  if (ytShorts) return { source: 'shorts', embedId: ytShorts[1] }
  // YouTube watch / be / embed
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (yt) return { source: 'youtube', embedId: yt[1] }
  // TikTok: https://www.tiktok.com/@user/video/123456789
  const tt = url.match(/tiktok\.com\/[^/]+\/video\/(\d+)/)
  if (tt) return { source: 'tiktok', embedId: tt[1] }
  // Instagram Reel: https://www.instagram.com/reel/CODE/
  const ig = url.match(/instagram\.com\/reel\/([A-Za-z0-9_-]+)/)
  if (ig) return { source: 'reels', embedId: ig[1] }
  return { source: 'youtube', embedId: null }
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
    ? 'id, image_url, ai_prompt, correct_track_id, decoy_track_ids, difficulty, scheduled_for, status, sort_order, published_at, created_at'
    : type === 'duel'
    ? 'id, matchup_type, track_a_id, track_b_id, scheduled_for, status, sort_order, published_at, created_at'
    : type === 'verdict'
    ? 'id, track_id, scheduled_for, status, sort_order, published_at, created_at'
    : 'id, source, source_url, embed_id, caption, related_artist_id, related_track_id, scheduled_for, sort_order, status, published_at, created_at'

  const { data: rawData, error } = await (sb as any)
    .from(table)
    .select(select)
    .neq('status', 'archived')
    .order('published_at', { ascending: false, nullsFirst: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return jsonErr(error.message, 500)
  const data = (rawData as unknown as any[]) || []

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

  // Pridedam stats kiekvienam drop'ui (jei yra published_at)
  let statsMap: Record<number, { total: number; correctPct: number | null; topChoice: string | null; topPct: number | null }> = {}
  const dropIds = (data || []).map((d: any) => d.id)
  if (dropIds.length > 0) {
    const { data: completions } = await sb
      .from('boombox_completions')
      .select('drop_id, payload, is_correct')
      .eq('drop_table', table)
      .in('drop_id', dropIds)

    const grouped: Record<number, { total: number; correct: number; choices: Record<string, number>; emojis: Record<string, number> }> = {}
    for (const r of completions || []) {
      const did = (r as any).drop_id as number
      if (!grouped[did]) grouped[did] = { total: 0, correct: 0, choices: {}, emojis: {} }
      grouped[did].total += 1
      if ((r as any).is_correct === true) grouped[did].correct += 1
      const p: any = (r as any).payload || {}
      if (typeof p.choice === 'string') grouped[did].choices[p.choice] = (grouped[did].choices[p.choice] || 0) + 1
      if (typeof p.emoji === 'string') grouped[did].emojis[p.emoji] = (grouped[did].emojis[p.emoji] || 0) + 1
    }
    for (const [did, g] of Object.entries(grouped)) {
      let topChoice: string | null = null
      let topCount = 0
      for (const [k, v] of Object.entries(g.choices)) if (v > topCount) { topChoice = k; topCount = v }
      for (const [k, v] of Object.entries(g.emojis)) if (v > topCount) { topChoice = k; topCount = v }
      statsMap[parseInt(did)] = {
        total: g.total,
        correctPct: g.total > 0 && g.correct > 0 ? Math.round((g.correct / g.total) * 100) : null,
        topChoice,
        topPct: g.total > 0 && topCount > 0 ? Math.round((topCount / g.total) * 100) : null,
      }
    }
  }

  return NextResponse.json({ drops: data || [], trackMap, artistMap, statsMap })
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

  // Auto sort_order'is = next-after-last
  async function nextSortOrder(table: string): Promise<number> {
    const { data } = await sb.from(table).select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    return ((data as any)?.sort_order || 0) + 1
  }

  let row: any = { created_by: adminId }

  if (type === 'image') {
    if (!rest.image_url) return jsonErr('Trūksta image_url')
    if (!rest.correct_track_id) return jsonErr('Trūksta correct_track_id')

    // Auto-pick decoys jei admin'as neperdavė
    let decoys = rest.decoy_track_ids
    if (!Array.isArray(decoys) || decoys.length !== 3) {
      const decoyRes = await fetch(new URL('/api/admin/boombox/generate', req.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cookie': req.headers.get('cookie') || '' },
        body: JSON.stringify({ type: 'image_decoys', correctTrackId: rest.correct_track_id }),
      })
      const dj = await decoyRes.json()
      if (dj.error || !dj.decoys) return jsonErr('Nepavyko parinkti decoy\'ų: ' + (dj.error || 'unknown'))
      decoys = dj.decoys
    }

    row = {
      ...row,
      image_url: rest.image_url,
      ai_prompt: rest.ai_prompt || null,
      correct_track_id: rest.correct_track_id,
      decoy_track_ids: decoys,
      difficulty: rest.difficulty || 2,
      scheduled_for: rest.scheduled_for || null,
      status: rest.status || 'ready',  // Default 'ready', ne 'draft'
      sort_order: rest.sort_order ?? await nextSortOrder('boombox_image_drops'),
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
    if (!rest.source_url) return jsonErr('Trūksta nuorodos')
    // Auto-detect šaltinio + embed_id iš URL
    const detected = detectVideoSource(rest.source_url)
    row = {
      curated_by: adminId,
      source: rest.source || detected.source,
      source_url: rest.source_url,
      embed_id: rest.embed_id || detected.embedId,
      caption: rest.caption || '',
      related_artist_id: rest.related_artist_id || null,
      related_track_id: rest.related_track_id || null,
      scheduled_for: rest.scheduled_for || null,
      sort_order: rest.sort_order ?? await nextSortOrder('boombox_video_drops'),
      status: rest.status || 'ready',
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
