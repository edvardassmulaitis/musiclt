// app/api/search/ytmusic/route.ts
// YouTube Music paieška per InnerTube API — be API key, be quotos
// Naudojimas: GET /api/search/ytmusic?q=Queen+Bohemian+Rhapsody
// Grąžina: { videoId, title, artist, duration, url }

import { NextRequest, NextResponse } from 'next/server'

const YTM_ENDPOINT = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false'

// YouTube Music InnerTube context — emuliuoja WEB_REMIX klientą (YouTube Music naršyklė)
const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20241106.01.00',
    hl: 'en',
    gl: 'US',
  },
}

// Parsinti YouTube Music search response — sudėtinga nested struktūra
function parseSearchResults(data: any): Array<{ videoId: string; title: string; artist: string; duration: string }> {
  const results: Array<{ videoId: string; title: string; artist: string; duration: string }> = []

  try {
    // YTM response struktūra: tabbedSearchResultsRenderer → tabs → tabRenderer → content → sectionListRenderer → contents
    const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs
    if (!tabs) return results

    for (const tab of tabs) {
      const sections = tab?.tabRenderer?.content?.sectionListRenderer?.contents
      if (!sections) continue

      for (const section of sections) {
        const items = section?.musicShelfRenderer?.contents
        if (!items) continue

        for (const item of items) {
          const flexColumns = item?.musicResponsiveListItemRenderer?.flexColumns
          const overlay = item?.musicResponsiveListItemRenderer?.overlay

          if (!flexColumns?.length) continue

          // videoId iš overlay arba playlistItemData
          let videoId = ''
          const playNav = overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
          if (playNav?.watchEndpoint?.videoId) {
            videoId = playNav.watchEndpoint.videoId
          }
          // Fallback: playlistItemData
          if (!videoId) {
            videoId = item?.musicResponsiveListItemRenderer?.playlistItemData?.videoId || ''
          }
          if (!videoId) continue

          // Title iš pirmo flex column
          const titleRuns = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
          const title = titleRuns?.map((r: any) => r.text).join('') || ''
          if (!title) continue

          // Artist + duration iš antro flex column
          const secondRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
          let artist = '', duration = ''
          if (secondRuns) {
            // Formatas paprastai: "Song • Artist • Album • Duration"
            // arba: "Artist • Duration"
            const texts = secondRuns.map((r: any) => r.text).join('')
            const parts = texts.split(' • ')
            // Paskutinis elementas su ":" greičiausiai yra trukmė
            for (let i = parts.length - 1; i >= 0; i--) {
              if (/^\d+:\d+$/.test(parts[i].trim())) {
                duration = parts[i].trim()
                break
              }
            }
            // Pirmas ne-"Song" elementas = artist
            // Jei pirmas yra "Song" / "Video" — skip'inam
            const nonType = parts.filter(p => !/^(Song|Video|Album|Playlist|Artist|EP|Single)$/i.test(p.trim()) && !/^\d+:\d+$/.test(p.trim()))
            artist = nonType[0]?.trim() || ''
          }

          results.push({ videoId, title, artist, duration })
        }
      }
    }
  } catch (e) {
    console.error('YTMusic parse error:', e)
  }

  return results
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })

  // filter: 'songs' ieško tik dainų (ne video, albumų, playlistų)
  // params yra base64 encoded filter — 'EgWKAQIIAWoKEAkQBRAKEAMQBA==' = Songs filter
  const filter = req.nextUrl.searchParams.get('filter') || 'songs'
  // Songs filter params (iš YTMusic web inspection)
  const filterParams: Record<string, string> = {
    songs: 'EgWKAQIIAWoKEAkQBRAKEAMQBA==',
    videos: 'EgWKAQIQAWoKEAkQChAFEAMQBA==',
    all: '',
  }

  try {
    const body: any = {
      context: INNERTUBE_CONTEXT,
      query: q,
    }
    if (filterParams[filter]) {
      body.params = filterParams[filter]
    }

    const res = await fetch(YTM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `YTMusic ${res.status}: ${text.slice(0, 200)}` }, { status: res.status })
    }

    const data = await res.json()
    const results = parseSearchResults(data)

    // Grąžinti pirmą rezultatą su pilnu YouTube URL
    const first = results[0]
    return NextResponse.json({
      results: results.slice(0, 5).map(r => ({
        ...r,
        url: `https://www.youtube.com/watch?v=${r.videoId}`,
      })),
      // Patogumui — pirmas rezultatas atskirai
      videoId: first?.videoId || null,
      url: first ? `https://www.youtube.com/watch?v=${first.videoId}` : null,
      title: first?.title || null,
      artist: first?.artist || null,
    }, {
      headers: { 'Cache-Control': 'public, max-age=86400' } // cache 24h
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
