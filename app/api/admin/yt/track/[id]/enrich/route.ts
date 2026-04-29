/**
 * POST /api/admin/yt/track/[id]/enrich
 *
 * Single-track YouTube enrichment — žr. lib/yt-enrich.ts dėl pilnos logikos.
 *
 * Body (JSON, optional):
 *   { force?: boolean }
 *
 * Response: EnrichResult arba { ok: false, error, trackId } su 500.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { enrichTrack } from '@/lib/yt-enrich'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return null
  }
  return session
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: idStr } = await params
  const trackId = Number(idStr)
  if (!Number.isFinite(trackId) || trackId <= 0) {
    return NextResponse.json({ error: 'Bad track id' }, { status: 400 })
  }

  let body: any = {}
  try { body = await req.json() } catch { /* empty body OK */ }
  const force = !!body?.force

  const result = await enrichTrack(trackId, force)
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json(result)
}
