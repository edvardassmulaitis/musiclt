import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

// PATCH /api/tracks/[id]/enrich — Wiki "overlay" enrich endpoint.
//
// Skirtumas nuo PUT /api/tracks/[id]:
//   PUT — pilnas track form save (admin UI). Toggle'ina is_single, perrašo
//         release_year/month/day.
//   PATCH /enrich — Wiki overlay flow. Partial payload, fill-only/promote-only
//         semantics; niekada neperrašo egzistuojančių duomenų.
//
// Semantika:
//   release_year/month/day — FILL-ONLY: jei DB tuščia, įrašom; jei DB jau turi,
//                            neperrašom. (music.lt scrape "Data: YYYY m." gali
//                            būti tikslesnis nei Wiki single1date.)
//   is_single              — PROMOTE-ONLY: Wiki sako TRUE → set TRUE.
//                            NIEKADA nesetinama FALSE (tas pats track'as gali
//                            būti single per kitą albumą, kurio Wiki nelietė).
//   video_url              — FILL-ONLY: jei DB tuščia, įrašom YouTube link'ą.
//   lyrics                 — FILL-ONLY: jei DB tuščia, įrašom.
//
// Response: { ok: true, applied: {...kas buvo pakeista...} }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: idStr } = await params
  const trackId = parseInt(idStr)
  if (!Number.isFinite(trackId)) {
    return NextResponse.json({ error: 'Bad track id' }, { status: 400 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const sb = createAdminClient()
  const { data: cur, error: curErr } = await sb
    .from('tracks')
    .select('id, title, is_single, release_year, release_month, release_day, video_url, lyrics')
    .eq('id', trackId)
    .single()
  if (curErr || !cur) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  }

  const updates: Record<string, any> = {}
  const applied: Record<string, any> = {}

  // CLEAN-ONLY: title — promote'inam Wiki canonical formatą TIK kai
  // normalized'inti title'ai yra tie patys (same logical title, skirtingas
  // formatavimas). Pvz DB "Fairy feller's master stroke" → Wiki
  // "The Fairy Feller's Master-Stroke" — same song, Wiki turi taisyklingą
  // capitalization + ASCII apostrofą + hyphen. Promote'inam Wiki.
  // Jei logically skirtingi (norm nesutampa) — neliečiam, gali būti
  // intentional admin rename.
  const norm = (s: string) => (s || '').toLowerCase()
    .replace(/\([^)]*\)\s*$/, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an)\s+/, '')
  if (typeof body.title === 'string' && body.title.trim()) {
    const wikiTitle = body.title.trim()
    const dbTitle = (cur as any).title || ''
    if (wikiTitle !== dbTitle && norm(wikiTitle) === norm(dbTitle)) {
      updates.title = wikiTitle
      applied.title = { from: dbTitle, to: wikiTitle }
    }
  }

  // FILL-ONLY: release_year (+ month/day chain'as)
  if (body.release_year && !cur.release_year) {
    updates.release_year = parseInt(String(body.release_year)) || null
    applied.release_year = updates.release_year
    // month/day reikšmingi tik kai year yra
    if (body.release_month) {
      updates.release_month = parseInt(String(body.release_month)) || null
      applied.release_month = updates.release_month
    }
    if (body.release_day && body.release_month) {
      updates.release_day = parseInt(String(body.release_day)) || null
      applied.release_day = updates.release_day
    }
    // Sync release_date string (back-compat su senuoju release_date column'u)
    if (updates.release_year) {
      const y = updates.release_year
      const m = updates.release_month || 1
      const d = updates.release_day || 1
      updates.release_date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  } else if (body.release_month && cur.release_year && !cur.release_month) {
    // year jau yra, month tuščias — užfilling'inam
    updates.release_month = parseInt(String(body.release_month)) || null
    applied.release_month = updates.release_month
    if (body.release_day) {
      updates.release_day = parseInt(String(body.release_day)) || null
      applied.release_day = updates.release_day
    }
  }

  // PROMOTE-ONLY: is_single
  if (body.is_single === true && !cur.is_single) {
    updates.is_single = true
    applied.is_single = true
  }

  // FILL-ONLY: video_url, lyrics
  if (body.video_url && !cur.video_url) {
    updates.video_url = body.video_url
    applied.video_url = body.video_url
  }
  if (body.lyrics && !cur.lyrics) {
    updates.lyrics = body.lyrics
    applied.lyrics_added = true
  }

  if (Object.keys(updates).length > 0) {
    const { error: upErr } = await sb.from('tracks').update(updates).eq('id', trackId)
    if (upErr) {
      return NextResponse.json({ error: `Track update failed: ${upErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, applied })
}
