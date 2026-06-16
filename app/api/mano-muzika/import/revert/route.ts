// app/api/mano-muzika/import/revert/route.ts
// POST { batchId } | { jobId } → atšaukia importą (pašalina tik tai, ką jis įdėjo)
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../../_auth'
import { revertImportBatch } from '@/lib/music-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const batchId = body.batchId ? String(body.batchId) : undefined
  const jobId = body.jobId ? String(body.jobId) : undefined
  if (!batchId && !jobId) return NextResponse.json({ error: 'batchId arba jobId privalomas' }, { status: 400 })
  try {
    const res = await revertImportBatch(userId, { batchId, jobId })
    if (!res.ok) return NextResponse.json({ error: res.error || 'Nepavyko' }, { status: 400 })
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
