// app/api/seen-live/recent/route.ts
// GET — naujausi narių koncertų foto/video (approved, su media). Homepage juostai.
import { NextResponse } from 'next/server'
import { getRecentSightingMedia } from '@/lib/seen-live'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const items = await getRecentSightingMedia(18)
    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, items: [] }, { status: 500 })
  }
}
