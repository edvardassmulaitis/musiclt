// app/api/mano-muzika/import/job/review/route.ts
// GET ?jobId= → paruošto importo atitiktys (hidratuotos) peržiūrai.
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../../../_auth'
import { getReviewItems } from '@/lib/import-jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const jobId = new URL(req.url).searchParams.get('jobId') || ''
  if (!jobId) return NextResponse.json({ error: 'jobId privalomas' }, { status: 400 })
  try {
    const data = await getReviewItems(userId, jobId)
    if (!data) return NextResponse.json({ error: 'Nerasta' }, { status: 404 })
    return NextResponse.json({ ok: true, ...data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
