// app/api/mb-proxy/route.ts
// Proxy MusicBrainz API užklausas — reikia kad naršyklė negautų CORS klaidos

import { NextRequest, NextResponse } from 'next/server'

const MB_BASE = 'https://musicbrainz.org/ws/2/'
const HEADERS = {
  'User-Agent': 'music.lt/1.0 (admin@music.lt)',
  'Accept': 'application/json',
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  try {
    const res = await fetch(`${MB_BASE}${path}`, { headers: HEADERS })
    if (!res.ok) return NextResponse.json({ error: `MB: ${res.status}` }, { status: res.status })
    const data = await res.json()
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=3600' } // cache 1h
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
