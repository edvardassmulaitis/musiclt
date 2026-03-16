// app/api/search/ytmusic/route.ts
// YouTube paieška per WEB InnerTube API — be API key, be quotos
// Naudoja standartinį YouTube (ne Music) — grąžina veikiančius video ID
// Naudojimas: GET /api/search/ytmusic?q=Queen+Bohemian+Rhapsody

import { NextRequest, NextResponse } from 'next/server'

const YT_SEARCH_ENDPOINT = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false'

const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20241120.01.00',
    hl: 'en',
    gl: 'US',
  },
}

type SearchResult = {
  videoId: string
  title: string
  channel: string
  duration: string
  views: string
}

function parseSearchResults(data: any): SearchResult[] {
  const results: SearchResult[] = []
  try {
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents
    if (!contents) return results

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents
      if (!items) continue

      for (const item of items) {
        const video = item?.videoRenderer
        if (!video?.videoId) continue

        // Skip live streams ir premieres
        const badges = video.badges || []
        const isLive = badges.some((b: any) => b?.metadataBadgeRenderer?.label?.toLowerCase()?.includes('live'))
        if (isLive) continue

        const title = video.title?.runs?.map((r: any) => r.text).join('') || ''
        const channel = video.ownerText?.runs?.map((r: any) => r.text).join('') || ''
        const duration = video.lengthText?.simpleText || ''
        const views = video.viewCountText?.simpleText || ''

        // Skip jei nėra trukmės (= live/premiere)
        if (!duration) continue

        results.push({
          videoId: video.videoId,
          title,
          channel,
          duration,
          views,
        })
      }
    }
  } catch (e) {
    console.error('YT InnerTube parse error:', e)
  }
  return results
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })

  try {
    // Pridedame "official music video" hint kad prioritizuotų oficialias versijas
    const searchQuery = q + ' official music video'

    const res = await fetch(YT_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        context: INNERTUBE_CONTEXT,
        query: searchQuery,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `YouTube ${res.status}: ${text.slice(0, 200)}` }, { status: res.status })
    }

    const data = await res.json()
    const results = parseSearchResults(data)

    const first = results[0]
    return NextResponse.json({
      results: results.slice(0, 5).map((r: SearchResult) => ({
        ...r,
        url: `https://www.youtube.com/watch?v=${r.videoId}`,
      })),
      videoId: first?.videoId || null,
      url: first ? `https://www.youtube.com/watch?v=${first.videoId}` : null,
      title: first?.title || null,
      channel: first?.channel || null,
    }, {
      headers: { 'Cache-Control': 'public, max-age=86400' }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
