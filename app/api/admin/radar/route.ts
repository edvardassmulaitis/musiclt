/**
 * POST /api/admin/radar
 *
 * Nustato atlikėjo radaro statusą (žr. lib/radaras.ts + 20260605_radaras.sql).
 *
 * Body: {
 *   artistId: number
 *   status:   'featured' | 'included' | 'excluded' | null   // null = auto
 *   blurb?:   string | null    // tik featured kortelei
 *   sort?:    number           // featured eiliškumas (didesnis = aukščiau)
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const STATUSES = ['featured', 'included', 'excluded'] as const

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Neteisingas body' }, { status: 400 })
  }

  const artistId = Number(body?.artistId)
  if (!Number.isFinite(artistId) || artistId <= 0) {
    return NextResponse.json({ error: 'Trūksta artistId' }, { status: 400 })
  }

  const status = body?.status ?? null
  if (status !== null && !STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Neteisingas status' }, { status: 400 })
  }

  const patch: Record<string, any> = {
    radar_status: status,
    radar_set_at: new Date().toISOString(),
  }
  if (status === 'featured') {
    if (typeof body?.blurb === 'string') patch.radar_blurb = body.blurb.trim().slice(0, 280) || null
    if (Number.isFinite(Number(body?.sort))) patch.radar_sort = Number(body.sort)
  } else if (status === null) {
    // auto grįžimas — išvalom featured meta
    patch.radar_blurb = null
    patch.radar_sort = 0
  }

  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('artists')
      .update(patch)
      .eq('id', artistId)
      .select('id, name, slug, radar_status, radar_blurb, radar_sort')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, artist: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Serverio klaida' }, { status: 500 })
  }
}
