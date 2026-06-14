// app/api/mano-muzika/setup/route.ts
// POST { action: 'complete' | 'skip' } → pažymėti onboarding būseną.
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../_auth'
import { markSetupComplete, markSetupSkipped } from '@/lib/mano-muzika'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  try {
    if (body.action === 'skip') return NextResponse.json(await markSetupSkipped(userId))
    return NextResponse.json(await markSetupComplete(userId))
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
