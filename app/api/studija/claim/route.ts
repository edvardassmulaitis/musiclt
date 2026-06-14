// POST /api/studija/claim — atlikėjas pateikia „Tai mano profilis" prašymą.
// Body: { artistId: number, method?: 'social'|'email'|'manual', proofUrl?, message? }
// Sukuria artist_claims (status=pending). Patvirtina admin per /admin/claims.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { normalizeSocialUrl } from '@/lib/social-embed'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  if (!profile?.id) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }

  const artistId = Number(body?.artistId)
  if (!Number.isFinite(artistId) || artistId <= 0) {
    return NextResponse.json({ error: 'Trūksta artistId' }, { status: 400 })
  }
  const method = ['social', 'email', 'manual'].includes(body?.method) ? body.method : 'social'
  const proofUrl = body?.proofUrl ? normalizeSocialUrl(String(body.proofUrl)) : null
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1000) : null

  try {
    const sb = createAdminClient()

    // Jau valdo?
    const { data: existing } = await sb
      .from('artist_team')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .maybeSingle()
    if (existing) return NextResponse.json({ ok: true, already: true })

    // Jau yra laukiantis claim'as?
    const { data: pending } = await sb
      .from('artist_claims')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('artist_id', artistId)
      .eq('status', 'pending')
      .maybeSingle()
    if (pending) return NextResponse.json({ ok: true, pending: true })

    const { data, error } = await sb
      .from('artist_claims')
      .insert({ artist_id: artistId, profile_id: profile.id, method, proof_url: proofUrl, message })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, claimId: data.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Serverio klaida' }, { status: 500 })
  }
}
