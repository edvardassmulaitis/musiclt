import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || 'paulina pau'

  // Test pakartot.lt
  let pakartotResult: any = {}
  try {
    const res = await fetch(`https://pakartot.lt/search?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; musiclt/1.0)', 'Accept': 'text/html' },
    })
    const html = await res.text()
    pakartotResult = {
      status: res.status,
      htmlLength: html.length,
      // Pirmi 2000 simbolių HTML
      htmlPreview: html.slice(0, 2000),
      // Visi href
      allLinks: [...html.matchAll(/href="([^"]+)"/gi)].map(m => m[1]).filter(l => !l.startsWith('http') && !l.startsWith('#')).slice(0, 40),
      // Paieškos rezultatų blokai
      searchSection: html.includes('search') ? html.slice(html.indexOf('search') - 100, html.indexOf('search') + 500) : 'not found',
    }
  } catch (e: any) {
    pakartotResult = { error: e.message }
  }

  // Test YouTube
  let youtubeResult: any = {}
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    youtubeResult = { error: 'YOUTUBE_API_KEY not set' }
  } else {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=3&key=${apiKey}`
      )
      const data = await res.json()
      youtubeResult = { status: res.status, items: data.items?.length, error: data.error?.message, firstTitle: data.items?.[0]?.snippet?.title }
    } catch (e: any) {
      youtubeResult = { error: e.message }
    }
  }

  return NextResponse.json({ q, pakartot: pakartotResult, youtube: youtubeResult }, { status: 200 })
}
