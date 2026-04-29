/**
 * YouTube InnerTube WEB API helper'iai.
 *
 * Naudojami:
 *   - /api/search/ytmusic  — search for video by "{artist} {title}"
 *   - /api/admin/yt/...    — enrichment route'ai (server-side)
 *
 * InnerTube tai vidinis YouTube API, kuris naudojamas pačiame www.youtube.com
 * frontend'e. Be API key, be quotos. Atsako struktūra didelė ir keičiama —
 * laikomės defensyvių parser'ių (try/optional chaining).
 */
const YT_SEARCH_ENDPOINT = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false'
// /player endpoint'as anksčiau buvo naudojamas viewCount'ui, bet iš Vercel IP'o
// jis grąžina "Precondition check failed" — vietoj jo dabar scrape'inam watch
// puslapį (žr. getVideoDetails). Konstanta paliekama dokumentacijai.
// const YT_PLAYER_ENDPOINT = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'

const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20241120.01.00',
    hl: 'en',
    gl: 'US',
  },
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export type YtSearchResult = {
  videoId: string
  title: string
  channel: string
  duration: string
  /** Žmoniškas tekstas iš search'o (pvz "1.2M views" / "1 234 views"). Aproksimacija. */
  views: string
}

function parseSearchResults(data: any): YtSearchResult[] {
  const results: YtSearchResult[] = []
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

        if (!duration) continue // skip live/premiere

        results.push({ videoId: video.videoId, title, channel, duration, views })
      }
    }
  } catch (e) {
    console.error('[yt-innertube] search parse error:', e)
  }
  return results
}

/** Search YouTube. Grąžina iki 5 video kandidatų prioritizuojant „official music video". */
export async function searchYouTube(query: string): Promise<YtSearchResult[]> {
  const searchQuery = query + ' official music video'
  const res = await fetch(YT_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ context: INNERTUBE_CONTEXT, query: searchQuery }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`YouTube search ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return parseSearchResults(data).slice(0, 5)
}

export type YtVideoDetails = {
  videoId: string
  title: string
  /** Tikslus view count (BIGINT-tinkamas — InnerTube grąžina string, mes parsinam į number). */
  viewCount: number
  channelId: string | null
  isPrivate: boolean
}

/**
 * Gauna tikslų view count'ą + meta scrape'inant watch puslapį.
 *
 * Originaliai naudojom /youtubei/v1/player POST, bet iš Vercel'io tas endpoint'as
 * dažnai grąžina "Precondition check failed" arba blokuojamas pagal IP — search
 * veikia, /player ne. Watch puslapis turi tą patį `viewCount` reikšmę
 * `ytInitialPlayerResponse.videoDetails.viewCount` initial JSON'e ir nereikalauja
 * jokios autentikacijos.
 */
export async function getVideoDetails(videoId: string): Promise<YtVideoDetails | null> {
  const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en&gl=US`, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      // Sutinka su Google'o consent challenge'u — kitaip iš EU IP gausim consent puslapį be ytInitialPlayerResponse.
      'Cookie': 'CONSENT=YES+1',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`YouTube watch ${res.status}: ${text.slice(0, 200)}`)
  }
  const html = await res.text()

  // viewCount: greičiausiai pasitaiko po `"viewCount":"NNNNNN"` initial JSON'e.
  // Imam pirmą hit'ą — tas yra videoDetails.viewCount (kitas variantas yra microformat,
  // bet to mums neprireiks).
  const viewMatch = html.match(/"viewCount":"(\d+)"/)
  if (!viewMatch) {
    // Galimai privatu/pašalinta — nėra viewCount initial state'e.
    return null
  }
  const viewCount = parseInt(viewMatch[1], 10)
  if (!Number.isFinite(viewCount)) return null

  // Title (geriausia paskaityt iš `"title":{"runs":[{"text":"X"}]}` arba `<title>` tag'o)
  let title = ''
  const titleMatch = html.match(/<title>([^<]+)<\/title>/)
  if (titleMatch) {
    // YT page title format'as: "Track Name - YouTube"
    title = titleMatch[1].replace(/\s*-\s*YouTube\s*$/, '').trim()
  }

  // channelId — priimam iš initial JSON'o, jei matomas
  let channelId: string | null = null
  const cidMatch = html.match(/"channelId":"(UC[A-Za-z0-9_-]{20,})"/)
  if (cidMatch) channelId = cidMatch[1]

  // isPrivate — jei watch puslapyje randame login-required hint'ą
  const isPrivate = /"status":"LOGIN_REQUIRED"|"status":"UNPLAYABLE".*?"reason":"Sign in"/i.test(html.slice(0, 50000))

  return {
    videoId,
    title,
    viewCount,
    channelId,
    isPrivate,
  }
}

/** Ištraukia videoId iš įvairaus pavidalo YT URL. Grąžina null jei neatpažįsta. */
export function extractVideoIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{6,})/,           // youtube.com/watch?v=ID
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,       // youtu.be/ID
    /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/, // embed URL
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/, // shorts URL
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}
