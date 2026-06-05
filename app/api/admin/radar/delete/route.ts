/**
 * POST /api/admin/radar/delete
 *
 * VISIŠKAS atlikėjo ištrynimas (admin) — per admin_delete_artist RPC (atominė
 * transakcija, žr. 20260605c). Skirta šiukšlėms/klaidingiems įrašams pašalinti
 * visai (ne tik paslėpti). Apsauga: tik super_admin.
 *
 * Body: { artistId: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  // Ištrynimas — tik super_admin (negrįžtama operacija).
  if (!session?.user || session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Tik super_admin gali trinti atlikėjus.' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Neteisingas body' }, { status: 400 })
  }
  const artistId = Number(body?.artistId)
  if (!Number.isFinite(artistId) || artistId <= 0) {
    return NextResponse.json({ error: 'Trūksta artistId' }, { status: 400 })
  }

  try {
    const sb = createAdminClient()
    const { data, error } = await sb.rpc('admin_delete_artist', { aid: artistId })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, result: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Serverio klaida' }, { status: 500 })
  }
}
