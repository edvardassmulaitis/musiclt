// Fanų sekimas (prenumerata atlikėjo naujienoms).
//   GET  ?artistId=  → { following, count, emailConsent }
//   POST { artistId, follow?: bool, emailConsent?: bool, city? }
//        follow nenurodytas → toggle. Grąžina naują būseną.
//
// Naudoja artist_follows (user_id, artist_id) + sutikimai (GDPR).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'

export async function GET(req: NextRequest) {
  const artistId = Number(new URL(req.url).searchParams.get('artistId'))
  if (!Number.isFinite(artistId) || artistId <= 0) return NextResponse.json({ following: false, count: 0 })
  const sb = createAdminClient()
  const { count } = await sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', artistId)

  let following = false, emailConsent = false
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  if (profile?.id) {
    const { data } = await sb.from('artist_follows')
      .select('id, email_consent').eq('artist_id', artistId).eq('user_id', profile.id).maybeSingle()
    following = !!data
    emailConsent = !!data?.email_consent
  }
  return NextResponse.json({ following, count: count || 0, emailConsent })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  if (!profile?.id) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId)
  if (!Number.isFinite(artistId) || artistId <= 0) return NextResponse.json({ error: 'Trūksta artistId' }, { status: 400 })

  const sb = createAdminClient()
  const { data: existing } = await sb.from('artist_follows')
    .select('id').eq('artist_id', artistId).eq('user_id', profile.id).maybeSingle()

  const wantFollow = typeof body?.follow === 'boolean' ? body.follow : !existing

  if (!wantFollow) {
    if (existing) await sb.from('artist_follows').delete().eq('id', existing.id)
    const { count } = await sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', artistId)
    return NextResponse.json({ ok: true, following: false, count: count || 0 })
  }

  const row: any = { artist_id: artistId, user_id: profile.id }
  if (typeof body?.emailConsent === 'boolean') row.email_consent = body.emailConsent
  if (typeof body?.city === 'string') row.city = body.city.trim().slice(0, 80) || null

  if (existing) {
    const upd: any = {}
    if ('email_consent' in row) upd.email_consent = row.email_consent
    if ('city' in row) upd.city = row.city
    if (Object.keys(upd).length) await sb.from('artist_follows').update(upd).eq('id', existing.id)
  } else {
    await sb.from('artist_follows').insert(row)
  }
  const { count } = await sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', artistId)
  return NextResponse.json({ ok: true, following: true, count: count || 0, emailConsent: !!row.email_consent })
}
