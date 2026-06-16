// app/api/mano-muzika/import/job/confirm/route.ts
// POST { jobId, deselect?: number[] } → kelia pasirinktus į biblioteką + neatpažintus į trūkstamus.
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../../../_auth'
import { confirmImportJob } from '@/lib/import-jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const jobId = String(body.jobId || '')
  if (!jobId) return NextResponse.json({ error: 'jobId privalomas' }, { status: 400 })
  const deselect = Array.isArray(body.deselect) ? body.deselect.map(Number).filter(Number.isFinite) : []
  try {
    const res = await confirmImportJob(userId, jobId, deselect)
    if (!res.ok) return NextResponse.json({ error: res.error || 'Nepavyko' }, { status: 400 })
    return NextResponse.json(res)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
