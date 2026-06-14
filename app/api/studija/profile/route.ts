// POST /api/studija/profile — atlikėjas redaguoja savo profilį (bio + soc. nuorodos).
// Body: { artistId, description?, website?, facebook?, instagram?, youtube?,
//         tiktok?, spotify?, soundcloud?, bandcamp?, twitter? }
// Prieiga: artist_team narys arba admin.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireStudioAccess } from '@/lib/artist-studio'

const SOCIAL_FIELDS = ['website', 'facebook', 'instagram', 'youtube', 'tiktok', 'spotify', 'soundcloud', 'bandcamp', 'twitter'] as const

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }

  const artistId = Number(body?.artistId)
  if (!Number.isFinite(artistId) || artistId <= 0) {
    return NextResponse.json({ error: 'Trūksta artistId' }, { status: 400 })
  }

  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  const patch: Record<string, any> = {}
  if (typeof body?.description === 'string') {
    patch.description = body.description.trim().slice(0, 8000) || null
  }
  for (const f of SOCIAL_FIELDS) {
    if (typeof body?.[f] === 'string') {
      const v = body[f].trim()
      patch[f] = v ? v.slice(0, 500) : null
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nieko nekeičiama' }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('artists')
      .update(patch)
      .eq('id', artistId)
      .select('id, slug, name, description, ' + SOCIAL_FIELDS.join(', '))
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, artist: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Serverio klaida' }, { status: 500 })
  }
}
