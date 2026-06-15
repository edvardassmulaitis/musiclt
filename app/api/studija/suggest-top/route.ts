// POST /api/studija/suggest-top — atlikėjas siūlo savo dainą į Top 40.
// Taisyklės: daina įkelta per pastaruosius 3 mėn.; negali siūlyti naujos, kol
// esama atlikėjo daina topе išbuvo < 8 sav. (ir dar neiškrito).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireStudioAccess } from '@/lib/artist-studio'

const TOP = 'top40'
const NINETY = 90 * 864e5

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId), trackId = Number(body?.trackId)
  if (!Number.isFinite(artistId) || !Number.isFinite(trackId)) return NextResponse.json({ error: 'Trūksta laukų' }, { status: 400 })
  const { profile, ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })
  const sb = createAdminClient()

  const { data: tr } = await sb.from('tracks').select('id, artist_id, video_uploaded_at, title').eq('id', trackId).maybeSingle()
  if (!tr || tr.artist_id !== artistId) return NextResponse.json({ error: 'Daina nerasta' }, { status: 404 })
  if (!tr.video_uploaded_at || Date.now() - new Date(tr.video_uploaded_at).getTime() > NINETY)
    return NextResponse.json({ error: 'Dainą galima siūlyti tik per 3 mėn. nuo įkėlimo' }, { status: 400 })

  const { data: pend } = await sb.from('top_suggestions').select('id').eq('track_id', trackId).eq('status', 'pending').maybeSingle()
  if (pend) return NextResponse.json({ ok: true, already: true })

  // Blokas: ar atlikėjas turi aktyvią dainą topе, išbuvusią < 8 sav.
  const { data: ids } = await sb.from('tracks').select('id').eq('artist_id', artistId)
  const trackIds = (ids || []).map((t: any) => t.id)
  const { data: wk } = await sb.from('top_weeks').select('id').eq('top_type', TOP).eq('is_active', true).order('week_start', { ascending: false }).limit(1).maybeSingle()
  if (wk && trackIds.length) {
    const { data: ent } = await sb.from('top_entries').select('track_id, weeks_in_top').eq('week_id', wk.id).in('track_id', trackIds)
    const blocking = (ent || []).some((e: any) => (e.weeks_in_top || 0) < 8)
    if (blocking) return NextResponse.json({ error: 'Palauk — tavo daina jau topе (naują siūlyk po 8 sav. arba kai iškris)' }, { status: 400 })
  }

  const { error } = await sb.from('top_suggestions').insert({ top_type: TOP, track_id: trackId, suggested_by_user_id: profile?.id || null, status: 'pending' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
