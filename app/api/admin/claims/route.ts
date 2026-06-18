// POST /api/admin/claims — admin patvirtina/atmeta atlikėjo claim'ą.
// Body: { claimId: string, action: 'approve'|'reject', note?: string }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { approveClaim, rejectClaim } from '@/lib/artist-studio'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const profile = await resolveProfile(session)

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }

  const claimId = String(body?.claimId || '')
  const action = body?.action
  if (!claimId) return NextResponse.json({ error: 'Trūksta claimId' }, { status: 400 })

  if (action === 'approve') {
    const r = await approveClaim(claimId, profile?.id || null)
    if (!r.ok) return NextResponse.json({ error: r.error || 'Klaida' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } else if (action === 'reject') {
    const r = await rejectClaim(claimId, profile?.id || null, body?.note)
    if (!r.ok) return NextResponse.json({ error: 'Klaida' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Blogas action' }, { status: 400 })
}
