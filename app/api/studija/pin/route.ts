// POST /api/studija/pin — prisegti/atsegti dainą (rodoma viršuje playeryje).
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import { requireStudioAccess } from '@/lib/artist-studio'

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId), trackId = Number(body?.trackId)
  if (!Number.isFinite(artistId) || !Number.isFinite(trackId)) return NextResponse.json({ error: 'Trūksta laukų' }, { status: 400 })
  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })
  const pinned = !!body?.pinned
  const sb = createAdminClient()
  const { data: tr } = await sb.from('tracks').select('id, artist_id').eq('id', trackId).maybeSingle()
  if (!tr || tr.artist_id !== artistId) return NextResponse.json({ error: 'Daina nerasta' }, { status: 404 })
  await sb.from('tracks').update({ is_pinned: pinned, pinned_at: pinned ? new Date().toISOString() : null }).eq('id', trackId)
  try { revalidateTag('artist') } catch {}
  return NextResponse.json({ ok: true, pinned })
}
