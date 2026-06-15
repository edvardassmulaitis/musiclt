// POST /api/studija/photo — nustatyti hero/profilio nuotrauką arba pašalinti.
// Body: { artistId, action: 'hero'|'profile'|'delete', url, photoId? }
// (Įkėlimas — atskiras etapas; čia tvarkomos jau esamos galerijos nuotraukos.)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireStudioAccess } from '@/lib/artist-studio'

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId), action = body?.action, url = String(body?.url || '')
  if (!Number.isFinite(artistId) || !['hero','profile','delete'].includes(action)) return NextResponse.json({ error: 'Blogi laukai' }, { status: 400 })
  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })
  const sb = createAdminClient()
  if (action === 'hero')    await sb.from('artists').update({ cover_image_wide_url: url }).eq('id', artistId)
  if (action === 'profile') await sb.from('artists').update({ cover_image_url: url }).eq('id', artistId)
  if (action === 'delete' && body?.photoId) await sb.from('artist_photos').update({ is_active: false }).eq('id', Number(body.photoId)).eq('artist_id', artistId)
  return NextResponse.json({ ok: true })
}
