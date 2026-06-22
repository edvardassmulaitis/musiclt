// app/api/admin/lyrics-suggestions/route.ts
//
// Admin (editor+) peržiūra vartotojų pasiūlytiems dainų tekstams.
//   GET  ?status=pending  → sąrašas su dainos + atlikėjo info
//   POST { id, action: 'approve' | 'reject', note? }
//        approve → įrašom į tracks.lyrics, pažymim approved
//        reject  → pažymim rejected

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const status = req.nextUrl.searchParams.get('status') || 'pending'
  const sb = createAdminClient()

  const { data: rows, error } = await sb
    .from('lyrics_suggestions')
    .select('id, track_id, lyrics, status, suggested_by_username, admin_note, created_at, reviewed_at')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const trackIds = [...new Set((rows || []).map((r: any) => r.track_id))]
  const trackMap = new Map<number, any>()
  if (trackIds.length) {
    const { data: tracks } = await sb
      .from('tracks')
      .select('id, slug, title, lyrics, artists:artist_id(slug, name)')
      .in('id', trackIds)
    for (const t of (tracks || []) as any[]) trackMap.set(t.id, t)
  }

  const items = (rows || []).map((r: any) => {
    const t = trackMap.get(r.track_id)
    return {
      id: r.id,
      track_id: r.track_id,
      track_title: t?.title || `#${r.track_id}`,
      artist_name: t?.artists?.name || null,
      track_href: t?.artists?.slug && t?.slug ? `/dainos/${t.artists.slug}-${t.slug}-${r.track_id}` : null,
      track_has_lyrics: !!(t?.lyrics && String(t.lyrics).trim()),
      lyrics: r.lyrics,
      status: r.status,
      suggested_by_username: r.suggested_by_username,
      admin_note: r.admin_note,
      created_at: r.created_at,
      reviewed_at: r.reviewed_at,
    }
  })

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const id = parseInt(String(body?.id), 10)
  const action = String(body?.action || '')
  const note = body?.note ? String(body.note).slice(0, 500) : null
  if (isNaN(id) || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Blogi parametrai' }, { status: 400 })
  }

  const sb = createAdminClient()
  const reviewerId = (session.user as any)?.id || null

  const { data: sug, error: sErr } = await sb
    .from('lyrics_suggestions')
    .select('id, track_id, lyrics, status')
    .eq('id', id)
    .maybeSingle()
  if (sErr || !sug) return NextResponse.json({ error: 'Pasiūlymas nerastas' }, { status: 404 })
  if (sug.status !== 'pending') return NextResponse.json({ error: 'Jau peržiūrėtas' }, { status: 409 })

  if (action === 'approve') {
    const { error: tErr } = await sb.from('tracks').update({ lyrics: sug.lyrics }).eq('id', sug.track_id)
    if (tErr) return NextResponse.json({ error: `Nepavyko įrašyti teksto: ${tErr.message}` }, { status: 500 })
  }

  const { error: uErr } = await sb.from('lyrics_suggestions').update({
    status: action === 'approve' ? 'approved' : 'rejected',
    admin_note: note,
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id)
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
