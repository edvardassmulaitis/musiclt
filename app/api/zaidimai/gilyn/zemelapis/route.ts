// app/api/zaidimai/gilyn/zemelapis/route.ts
//
// GILYN žemėlapis — asmeninis fog-of-war per žanrus → substilius.
// Švyturiai = seni like'ai (artist/album/track → artist), aplankyta/išgirsta/
// išsaugota = gilyn_map_nodes.

import { NextResponse } from 'next/server'
import { resolveViewer } from '@/lib/zaidimai'
import { buildMap, buildTravelEdges } from '@/lib/gilyn'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  try {
    const viewer = await resolveViewer()
    const [map, edges] = await Promise.all([buildMap(viewer), buildTravelEdges(viewer)])
    return NextResponse.json({ ...map, edges })
  } catch (e: any) {
    console.error('gilyn zemelapis:', e?.message)
    return NextResponse.json({ error: 'Nepavyko užkrauti žemėlapio' }, { status: 500 })
  }
}
