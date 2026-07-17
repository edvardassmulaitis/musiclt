/**
 * /api/admin/yt-discovery/candidates
 *
 * GET  ?scope=lt|foreign|unknown&status=pending&limit=100
 *      → discovery kandidatų sąrašas review UI (rikiuota pagal velocity DESC).
 * PATCH { id, action: 'approve'|'reject', reject_reason? }
 *      → approve: jei match'intas atlikėjas — commitTrack(video_url,{artist_id})
 *        ir status='approved'; jei ne — 400 (naujo atlikėjo kūrimas — v2, per
 *        grounded artist-fill). reject: status='rejected'.
 *
 * Admin-only. Dormant scaffold: lentelė gali būti tuščia, kol scout neaktyvuotas.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { commitTrack } from '@/lib/quick-add'

export const runtime = 'nodejs'
export const maxDuration = 60

function baseUrl(): string {
  return process.env.MUSICLT_BASE_URL || `https://${process.env.VERCEL_URL || 'musiclt.vercel.app'}`
}

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope')
  const status = searchParams.get('status') || 'pending'
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 300)

  const sb = createAdminClient()
  let q = sb
    .from('yt_discovery_candidates')
    .select('id, video_url, raw_title, channel_title, artist_raw, title_raw, published_at, views_last, velocity_vph, matched_artist_id, match_score, scope, status, created_at, artists:matched_artist_id(name, slug, country)')
    .eq('status', status)
    .order('velocity_vph', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (scope) q = q.eq('scope', scope)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, candidates: data || [] })
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Neteisingas body' }, { status: 400 }) }
  const id = Number(body?.id)
  const action = body?.action
  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Reikia id + action (approve|reject)' }, { status: 400 })
  }

  const sb = createAdminClient()
  const { data: cand } = await sb
    .from('yt_discovery_candidates')
    .select('id, video_url, matched_artist_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!cand) return NextResponse.json({ error: 'Kandidatas nerastas' }, { status: 404 })

  if (action === 'reject') {
    await sb.from('yt_discovery_candidates').update({
      status: 'rejected',
      reject_reason: typeof body?.reject_reason === 'string' ? body.reject_reason.slice(0, 300) : null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  // approve
  const artistId = (cand as any).matched_artist_id as number | null
  if (!artistId) {
    return NextResponse.json({ error: 'Nėra susieto atlikėjo — sukurk atlikėją pirma (naujo atlikėjo kūrimas iš čia — v2).' }, { status: 400 })
  }
  try {
    const result = await commitTrack((cand as any).video_url, baseUrl(), { artist_id: artistId })
    if (!result.ok) {
      return NextResponse.json({ error: (result as any).error || 'commitTrack nepavyko' }, { status: 502 })
    }
    await sb.from('yt_discovery_candidates').update({
      status: 'approved',
      published_track_id: (result as any).track?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'approved', track: (result as any).track })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Serverio klaida' }, { status: 500 })
  }
}
